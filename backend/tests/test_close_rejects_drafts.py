"""A day's close rejects that unit-day's draft documents (2026-11-26).

Niyozov Izzatilla closed 25.11 with transfer #2350 still a draft, so the day
was closed but never confirmed and stayed ⏳ on /zagruzka. From now on the
closer — a person, or «System» for the automatic close — rejects every draft of
that unit-day inside the close, and the day is confirmed at once.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_close_rejects_drafts
"""
from __future__ import annotations

import unittest
from datetime import date
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

DAY = date(2026, 11, 25)
MID, OTHER = 10, 15
CLOSER = {"sub": 777, "full_name": "Niyozov Izzatilla", "role": "supervisor", "role_id": MID}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class CloseRejectsDrafts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.models import DayApproval, LiveDocument, LiveDocumentHistory, Manager
        db = self.pg.Session()
        db.query(LiveDocumentHistory).delete()
        db.query(LiveDocument).delete()
        db.query(DayApproval).delete()
        for mid, name in ((MID, "Niyozov Izzatilla"), (OTHER, "Yogmirov Feruz")):
            if db.get(Manager, mid) is None:
                db.add(Manager(id=mid, name=name, shift=1))
        db.flush()

        def doc(mid, day, status):
            d = LiveDocument(doc_type="people_exchange", manager_id=mid, day=day, status=status,
                             payload={"employees": [{"worker_name": "Jo'rayev Diyorbek"}],
                                      "target_type": "supervisor", "target_manager_id": OTHER},
                             created_by_telegram_id=777, created_by_name="Niyozov Izzatilla")
            db.add(d)
            db.flush()
            return d.id

        self.ids = {
            "draft": doc(MID, DAY, "draft"),
            "approved": doc(MID, DAY, "approved"),
            "other_day": doc(MID, date(2026, 11, 26), "draft"),
            "other_unit": doc(OTHER, DAY, "draft"),
        }
        db.add(DayApproval(manager_id=MID, date=DAY, approved_by_name="Niyozov Izzatilla"))
        db.commit()
        db.close()

    def _close(self, caller):
        from app.routers import staff_live
        db = self.pg.Session()
        try:
            docs = staff_live._reject_drafts_at_close(db, MID, DAY, caller)
            db.commit()
            with mock.patch.object(staff_live, "_tell_rejected") as tell, \
                    mock.patch.object(staff_live, "_retire") as retire, \
                    mock.patch.object(staff_live.action_log, "record") as rec, \
                    mock.patch.object(staff_live.action_log, "record_system") as rec_sys:
                staff_live._tell_drafts_rejected(db, docs, caller)
            return [d.id for d in docs], tell, retire, rec, rec_sys
        finally:
            db.close()

    def _status(self):
        from app.models import LiveDocument
        db = self.pg.Session()
        try:
            return {k: db.get(LiveDocument, i) for k, i in self.ids.items()}
        finally:
            db.close()

    def test_a_person_closing_rejects_only_that_unit_days_drafts(self):
        from app.models import LiveDocumentHistory
        from app.services import day_state, live_staff
        ids, tell, retire, rec, rec_sys = self._close(CLOSER)
        self.assertEqual(ids, [self.ids["draft"]])
        s = self._status()
        self.assertEqual(s["draft"].status, "rejected")
        self.assertEqual(s["draft"].approved_by_name, "Niyozov Izzatilla")
        self.assertEqual(s["draft"].approved_by_telegram_id, 777)
        self.assertEqual(s["approved"].status, "approved")
        self.assertEqual(s["other_day"].status, "draft")
        self.assertEqual(s["other_unit"].status, "draft")
        db = self.pg.Session()
        try:
            self.assertEqual(db.query(LiveDocumentHistory).filter_by(
                document_id=self.ids["draft"], action="rejected").count(), 1)
            self.assertEqual(live_staff.pending_count(db, MID, DAY), 0)
            self.assertIn((MID, DAY), day_state.confirmed_pairs(db, DAY, DAY))
        finally:
            db.close()
        retire.assert_called_once_with("live_document", self.ids["draft"], "rejected",
                                       "Niyozov Izzatilla")
        tell.assert_called_once()
        rec.assert_called_once()
        self.assertEqual(rec.call_args.kwargs["action"], "lab.live_document_rejected")
        self.assertIn(("closed_by", "Niyozov Izzatilla"), rec.call_args.kwargs["details"])
        rec_sys.assert_not_called()

    def test_the_automatic_close_rejects_as_system(self):
        from app.routers import staff_live
        ids, _tell, retire, rec, rec_sys = self._close(staff_live._SYSTEM)
        self.assertEqual(ids, [self.ids["draft"]])
        s = self._status()
        self.assertEqual(s["draft"].status, "rejected")
        self.assertEqual(s["draft"].approved_by_name, "System")
        retire.assert_called_once_with("live_document", self.ids["draft"], "rejected", "System")
        rec_sys.assert_called_once()
        rec.assert_not_called()

    def test_nothing_to_reject_is_a_no_op(self):
        self._close(CLOSER)
        ids, tell, retire, rec, _ = self._close(CLOSER)
        self.assertEqual(ids, [])
        tell.assert_not_called()
        retire.assert_not_called()
        rec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
