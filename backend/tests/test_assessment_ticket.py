"""«Bilet №» — every drawn set of a «Nomzodlarni baholash» sitting is a
numbered ticket (2026-11-20). The number comes from a Postgres sequence, so
these run where `SAFIA_TEST_PG` names a server.

What is pinned: sittings from before are numbered once in the order they were
opened; the boot step is idempotent; the sequence never trails a number already
printed; a draw takes the next number and a redraw takes a new one; a bank too
short to draw burns no number.
"""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException
from sqlalchemy import text

from app import startup
from app.models import Assessment, AssessmentCandidate, AssessmentItem, AssessmentQuestion

T0 = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)

# Enough for one draw: Kaizen + Production 2 theory + 4 practical each,
# TB / HR / OKK 3 each (rules.BLOCKS).
BANK = ([("kaizen", "theory")] * 2 + [("kaizen", "practical")] * 4
        + [("production", "theory")] * 2 + [("production", "practical")] * 4
        + [("tb", "theory")] * 3 + [("hr", "theory")] * 3 + [("okk", "theory")] * 3)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class TicketTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE assessment_items, assessments, assessment_candidates, "
                             "assessment_questions RESTART IDENTITY CASCADE"))
        self.db.execute(text("DROP SEQUENCE IF EXISTS assessment_ticket_seq"))
        self.db.commit()
        self.cand = AssessmentCandidate(full_name="Test Nomzod")
        self.db.add(self.cand)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _boot(self):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session):
            startup.add_assessment_ticket_numbers()
        self.db.expire_all()

    def _sitting(self, minutes, ticket=None):
        a = Assessment(candidate_id=self.cand.id, created_at=T0 + timedelta(minutes=minutes), ticket_no=ticket)
        self.db.add(a)
        self.db.commit()
        return a.id

    def _ticket(self, aid):
        return self.db.query(Assessment.ticket_no).filter(Assessment.id == aid).scalar()

    def test_old_sittings_numbered_in_the_order_they_were_opened(self):
        late, early, mid = self._sitting(30), self._sitting(0), self._sitting(10)
        self._boot()
        self.assertEqual([self._ticket(early), self._ticket(mid), self._ticket(late)], [1, 2, 3])
        self._boot()   # idempotent: nothing renumbered
        self.assertEqual([self._ticket(early), self._ticket(mid), self._ticket(late)], [1, 2, 3])
        # one an old worker opened during a deploy: the next boot numbers it
        stray = self._sitting(40)
        self._boot()
        self.assertEqual(self._ticket(stray), 4)

    def test_sequence_never_trails_a_printed_number(self):
        self._sitting(0, ticket=10)
        fresh = self._sitting(5)
        self._boot()
        self.assertEqual(self._ticket(fresh), 11)
        self.assertEqual(self.db.execute(text("SELECT nextval('assessment_ticket_seq')")).scalar(), 12)

    def test_a_fresh_database_starts_at_one(self):
        self._boot()
        self.assertEqual(self.db.execute(text("SELECT nextval('assessment_ticket_seq')")).scalar(), 1)

    def test_draw_takes_a_number_and_a_redraw_a_new_one(self):
        from app.routers import assessment as r
        self._boot()
        for dept, qtype in BANK:
            self.db.add(AssessmentQuestion(department=dept, qtype=qtype, text=f"{dept} {qtype} {id(object())}"))
        self.db.commit()
        a = Assessment(candidate_id=self.cand.id)
        self.db.add(a)
        self.db.flush()
        self.assertEqual(r._draw_into(self.db, a), 20)
        self.db.commit()
        self.assertEqual(self._ticket(a.id), 1)
        # the redraw: the items go, a new set is drawn, a new number taken
        self.db.query(AssessmentItem).filter(AssessmentItem.assessment_id == a.id).delete()
        self.db.flush()
        r._draw_into(self.db, a)
        self.db.commit()
        self.assertEqual(self._ticket(a.id), 2)

    def test_a_short_bank_burns_no_number(self):
        from app.routers import assessment as r
        self._boot()
        a = Assessment(candidate_id=self.cand.id)
        self.db.add(a)
        self.db.flush()
        with self.assertRaises(HTTPException) as ctx:
            r._draw_into(self.db, a)
        self.assertEqual(ctx.exception.status_code, 409)
        self.db.rollback()
        self.assertEqual(self.db.execute(text("SELECT nextval('assessment_ticket_seq')")).scalar(), 1)


if __name__ == "__main__":
    unittest.main()
