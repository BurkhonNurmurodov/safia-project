"""«Nomzodlarni baholash» — a candidate's face is the PAGE's own (the
operator, 2026-11-23: a shift manager on the panel saw initials, because the
photo sat behind «Xodim kartasi»). Runs where `SAFIA_TEST_PG` names a server.

What is pinned: the door is guarded by the `assessment` page and by nothing
of «Xodim kartasi»; it is keyed by the CANDIDATE and serves that candidate's
own Verifix photo; a candidate typed before the picker (no employee), one
Verifix holds no photo of, and an unknown id all answer 404 `no_photo`.
"""
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException
from sqlalchemy import text

from app.models import AssessmentCandidate

SHA = "a" * 64
ORG = {"emps": {"E-1": {"photo": SHA}, "E-2": {}}}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class CandidatePhotoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.routers import assessment as r
        from app.services import verifix_explore, verifix_org
        self.r = r
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE assessment_candidates RESTART IDENTITY CASCADE"))
        self.with_photo = AssessmentCandidate(full_name="Rasmli Nomzod", employee_id="E-1")
        self.no_photo = AssessmentCandidate(full_name="Rasmsiz Nomzod", employee_id="E-2")
        self.typed = AssessmentCandidate(full_name="Qo'lda yozilgan")          # from before the picker
        self.db.add_all([self.with_photo, self.no_photo, self.typed])
        self.db.commit()
        self.asked = []

        def fake_photo(db, sha, size):
            self.asked.append((sha, size))
            return b"JPEG"

        for p in (mock.patch.object(verifix_org, "stored", return_value=(ORG, None)),
                  mock.patch.object(verifix_explore, "photo", side_effect=fake_photo)):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def _get(self, cid, size=96):
        return self.r.candidate_photo(cid, size=size, db=self.db, _={})

    def _no_photo(self, cid):
        with self.assertRaises(HTTPException) as ctx:
            self._get(cid)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["code"], "no_photo")

    def test_the_door_is_the_assessment_pages_own(self):
        from app.routers import people
        route = next(x for x in self.r.router.routes
                     if getattr(x, "path", "") == "/api/assessment/candidates/{cid}/photo")
        guards = [d.call for d in route.dependant.dependencies]
        self.assertIn(self.r.PAGE, guards)
        self.assertNotIn(people.PAGE, guards)

    def test_a_candidates_own_photo_is_served(self):
        res = self._get(self.with_photo.id, size=192)
        self.assertEqual(res.body, b"JPEG")
        self.assertEqual(res.media_type, "image/jpeg")
        self.assertEqual(self.asked, [(SHA, 192)])

    def test_no_employee_no_photo_and_nobody_are_404(self):
        for cid in (self.typed.id, self.no_photo.id, 9999):
            self._no_photo(cid)
        self.assertEqual(self.asked, [])


if __name__ == "__main__":
    unittest.main()
