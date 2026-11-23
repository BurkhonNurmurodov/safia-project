"""«Nomzodlarni baholash» — one person may hold SEVERAL seats of a sitting
(the operator, 2026-11-23: «one person should be able to grade in terms of
all departments not just one»). Runs where `SAFIA_TEST_PG` names a server.

What is pinned, on a REAL sitting (no sample question) and for a NON-admin:
a judge whose scorecard is already submitted takes another seat; each seat is
a scorecard of its own and grades only its department's questions; taking a
seat touches none already held; somebody else's seat is still refused;
results stay closed while ANY of the viewer's seats is open; one person
submitting all five closes the sitting.
"""
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException
from sqlalchemy import text

from app import startup
from app.models import (
    Assessment, AssessmentCandidate, AssessmentGrade, AssessmentItem, AssessmentQuestion, JudgeEvaluation,
)
from app.services import assessment as rules

# Enough for one draw (rules.BLOCKS), none of them a sample.
BANK = ([("kaizen", "theory")] * 2 + [("kaizen", "practical")] * 4
        + [("production", "theory")] * 2 + [("production", "practical")] * 4
        + [("tb", "theory")] * 3 + [("hr", "theory")] * 3 + [("okk", "theory")] * 3)

ME = {"sub": "101", "full_name": "Bir Hakam"}
OTHER = {"sub": "202", "full_name": "Ikkinchi Hakam"}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class SeatsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.routers import assessment as r
        self.r = r
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE assessment_items, assessments, assessment_candidates, "
                             "assessment_questions RESTART IDENTITY CASCADE"))
        self.db.commit()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session):
            startup.add_assessment_ticket_numbers()
        for n, (dept, qtype) in enumerate(BANK):
            self.db.add(AssessmentQuestion(department=dept, qtype=qtype, text=f"{dept} {qtype} {n}"))
        cand = AssessmentCandidate(full_name="Test Nomzod")
        self.db.add(cand)
        self.db.flush()
        a = Assessment(candidate_id=cand.id)
        self.db.add(a)
        self.db.flush()
        r._draw_into(self.db, a)
        self.db.commit()
        self.aid = a.id
        # A judge, never an admin — and every caller is who their payload says.
        for p in (mock.patch.object(r, "_is_admin", return_value=False),
                  mock.patch.object(r, "_judge_key", side_effect=lambda db, payload: f"tg:{payload['sub']}"),
                  mock.patch.object(r, "_photo_emps", return_value={}),
                  mock.patch.object(r.action_log, "enrich")):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    # ── helpers ──────────────────────────────────────────────────────────────
    def _take(self, dept, who=ME):
        return self.r.claim_seat(self.aid, {"department": dept}, db=self.db, payload=who)

    def _detail(self, seat=None, who=ME):
        return self.r.get_assessment(self.aid, seat=seat, db=self.db, payload=who)

    def _grade_and_submit(self, dept, who=ME):
        for it in self.db.query(AssessmentItem).filter(AssessmentItem.assessment_id == self.aid,
                                                       AssessmentItem.department == dept).all():
            self.r.save_grade(self.aid, it.id, {"verdict": "pass"}, seat=dept, db=self.db, payload=who)
        return self.r.submit(self.aid, {"overall_feedback": "Yaxshi"}, seat=dept, db=self.db, payload=who)

    def _refused(self, code, fn, *a, **kw):
        with self.assertRaises(HTTPException) as ctx:
            fn(*a, **kw)
        self.assertEqual(ctx.exception.detail["code"], code)

    # ── the rule ─────────────────────────────────────────────────────────────
    def test_a_submitted_judge_takes_another_seat(self):
        self._take("kaizen")
        self._grade_and_submit("kaizen")
        d = self._detail()
        self.assertFalse(d["test_mode"])
        self.assertTrue(d["rights"]["claim"])            # the screenshot's case: Kaizen is in, Production is free
        self._take("production")
        d = self._detail()
        self.assertEqual(d["my_seats"], ["kaizen", "production"])
        self.assertEqual(d["mine"]["department"], "production")     # the open one comes up first
        self.assertTrue(d["rights"]["grade"])
        # the submitted scorecard is untouched by the new seat
        kz = self.db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == self.aid,
                                                   JudgeEvaluation.department == "kaizen").one()
        self.assertIsNotNone(kz.submitted_at)
        self.assertEqual(self.db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id == kz.id).count(),
                         len([1 for it in d["items"] if it["department"] == "kaizen"]))

    def test_each_seat_is_its_own_scorecard(self):
        self._take("kaizen")
        self._take("tb")                                  # a second seat while the first is still open
        rows = self.db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == self.aid).all()
        self.assertEqual({e.department: e.judge_key for e in rows}, {"kaizen": "tg:101", "tb": "tg:101#tb"})
        self.assertEqual(self._detail(seat="tb")["mine"]["department"], "tb")
        self.assertEqual(self._detail(seat="kaizen")["mine"]["department"], "kaizen")
        # a seat grades its own department's questions only
        tb_item = self.db.query(AssessmentItem).filter(AssessmentItem.assessment_id == self.aid,
                                                       AssessmentItem.department == "tb").first()
        self._refused("not_your_question", self.r.save_grade, self.aid, tb_item.id, {"verdict": "pass"},
                      seat="kaizen", db=self.db, payload=ME)
        # leaving one seat leaves the other standing
        self.r.release_seat(self.aid, "kaizen", db=self.db, payload=ME)
        self.assertEqual(self._detail()["my_seats"], ["tb"])

    def test_somebody_elses_seat_is_still_refused(self):
        self._take("kaizen", OTHER)
        self._take("production")
        self._refused("seat_taken", self._take, "kaizen")
        self.assertEqual(self._take("production"), {"ok": True})     # their own seat again: nothing happens
        self.assertEqual(self._detail()["my_seats"], ["production"])
        self.assertEqual(self._detail(who=OTHER)["my_seats"], ["kaizen"])

    def test_results_stay_closed_while_any_seat_of_mine_is_open(self):
        self._take("kaizen")
        self._grade_and_submit("kaizen")
        self.assertIsNone(self._detail()["results_hidden"])          # every seat of mine is in
        self._take("production")
        for seat in (None, "production", "kaizen"):                   # the submitted seat on screen too
            d = self._detail(seat=seat)
            self.assertEqual(d["results_hidden"], "own_pending")
            self.assertIsNone(d["results"])
        self._grade_and_submit("production")
        d = self._detail(seat="kaizen")
        self.assertIsNone(d["results_hidden"])
        self.assertEqual({j["department"] for j in d["results"]["judges"]}, {"kaizen", "production"})

    def test_one_person_grades_all_five_and_the_sitting_closes(self):
        closed = []
        for dept in rules.SEAT_ORDER:
            self._take(dept)
            closed.append(self._grade_and_submit(dept)["closed"])
        self.assertEqual(closed, [False, False, False, False, True])
        d = self._detail()
        self.assertEqual(d["status"], "closed")
        self.assertEqual(d["my_seats"], list(rules.SEAT_ORDER))
        self.assertEqual(d["results"]["overall"]["judged"], 20)
        self.assertFalse(d["rights"]["claim"])


if __name__ == "__main__":
    unittest.main()
