"""`services/plan_carry.carry_day` and the 24 Nov one-shot that runs it
(docs/data-fixes.md «24 Nov»): yesterday's typed ПЛАН and «Bugungi fakt»
headcount go into today only where today is empty."""
import unittest
from datetime import date

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.models import Manager, PPDaily, PPLineDaily, PPWorkCenterDaily

SRC, DST = date(2026, 11, 23), date(2026, 11, 24)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class PlanCarryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        for t in ("pp_line_daily", "pp_daily", "pp_work_center_daily", "managers"):
            self.db.execute(__import__("sqlalchemy").text(f"DELETE FROM {t}"))
        self.db.add(Manager(id=1, name="Талипова Мамура", shift=1))
        self.db.commit()
        db = self.db
        db.add_all([
            PPLineDaily(manager_id=1, date=SRC, qty_key="100", work_center="A1", line_key="Tort|2.5",
                        plan_override=400, actual_override=380, priority=2),
            PPLineDaily(manager_id=1, date=SRC, qty_key="200", work_center="B2", line_key="Pirog|1",
                        plan_override=120),
            PPLineDaily(manager_id=1, date=SRC, qty_key="300", work_center="B2", line_key="Rulet|1",
                        plan_override=None, actual_override=50),          # no plan: not carried
            PPDaily(manager_id=1, date=SRC, sap_code="400", work_center="C3", plan_qty=0, actual_qty=0,
                    plan_override=70),
            PPWorkCenterDaily(manager_id=1, date=SRC, work_center="A1", people=5, shtatka=9),
            PPWorkCenterDaily(manager_id=1, date=SRC, work_center="B2", wc_group="A", people=3),
            PPWorkCenterDaily(manager_id=1, date=SRC, work_center="B2", wc_group="B", people=2),
            PPWorkCenterDaily(manager_id=1, date=SRC, work_center="C3", people=4),
            PPWorkCenterDaily(manager_id=1, date=SRC, work_center="d4", people=6),
            PPWorkCenterDaily(manager_id=1, date=DST, work_center="D4", people=2),     # typed today
            PPWorkCenterDaily(manager_id=1, date=DST, work_center="A1", shtatka=7),    # штатка only
        ])
        db.commit()
        self.planned = lambda _db, _mid, _day: frozenset({"A1", "B2", "D4"})   # C3 plans nothing today

    def tearDown(self):
        self.db.close()

    def test_an_empty_day_takes_yesterdays_plan_and_headcount(self):
        from app.services import plan_carry
        r = plan_carry.carry_day(self.db, 1, SRC, DST, planned=self.planned)
        self.db.commit()
        self.assertEqual((r["plan"], r["lines"], r["groups"]), ("copied", 2, 1))
        lines = {x.line_key: x for x in self.db.query(PPLineDaily).filter_by(date=DST)}
        self.assertEqual(sorted(lines), ["Pirog|1", "Tort|2.5"])
        self.assertEqual((float(lines["Tort|2.5"].plan_override), lines["Tort|2.5"].priority), (400.0, 2))
        self.assertIsNone(lines["Tort|2.5"].actual_override)                     # ФАКТ never moves
        legacy = self.db.query(PPDaily).filter_by(date=DST).one()
        self.assertEqual((legacy.sap_code, float(legacy.plan_override)), ("400", 70.0))
        self.assertEqual(r["people"], [("A1", "", 5), ("B2", "A", 3), ("B2", "B", 2)])
        self.assertEqual(r["people_kept"], ["D4"])                               # typed today: kept
        self.assertEqual(r["people_skipped"], ["C3"])                            # no plan today
        pins = {(p.work_center, p.wc_group or ""): p for p in self.db.query(PPWorkCenterDaily).filter_by(date=DST)}
        self.assertEqual((pins[("A1", "")].people, pins[("A1", "")].shtatka), (5, 7))   # штатка pin stays
        self.assertEqual(pins[("D4", "")].people, 2)
        self.assertNotIn(("C3", ""), pins)
        self.assertEqual(pins[("B2", "A")].people + pins[("B2", "B")].people, 5)

    def test_a_typed_plan_is_never_touched_and_a_second_run_changes_nothing(self):
        from app.services import plan_carry
        self.db.add(PPLineDaily(manager_id=1, date=DST, qty_key="900", work_center="A1", line_key="Kek|1",
                                plan_override=10))
        self.db.commit()
        r = plan_carry.carry_day(self.db, 1, SRC, DST, planned=self.planned)
        self.db.commit()
        self.assertEqual((r["plan"], r["lines"]), ("kept", 0))
        self.assertEqual([x.line_key for x in self.db.query(PPLineDaily).filter_by(date=DST)], ["Kek|1"])
        again = plan_carry.carry_day(self.db, 1, SRC, DST, planned=self.planned)
        self.assertEqual(again["people"], [])
        self.assertEqual(sorted(again["people_kept"]), ["A1", "B2", "D4"])

    def test_the_four_brigadirs_are_found_by_name_and_namesakes_are_not(self):
        from app import startup
        self.db.add_all([Manager(id=2, name="Хакимов Руслан", shift=1),
                         Manager(id=3, name="Sultonova Umida", shift=2),
                         Manager(id=4, name="Aripova Manzura", shift=1),
                         Manager(id=5, name="Abdutalipova Mamura", shift=1),         # not Talipova
                         Manager(id=6, name="Talipova Dilnoza", shift=1),            # not Mamura
                         Manager(id=7, name="Aripova Manzura (eski)", shift=1, archived=True)])
        self.db.commit()
        got = {k: [m.id for m in v] for k, v in startup._plan_carry_units(self.db).items()}
        self.assertEqual(got, {"Sultonova Umida": [3], "Xakimov Ruslan": [2],
                               "Aripova Manzura": [4], "Talipova Mamura": [1]})


    def _run_step(self, now):
        """Run `startup.carry_plan_nov24` against this database at `now`
        (Tashkent); → the admin reports it sent."""
        from datetime import datetime as real_dt
        from unittest import mock

        from app import startup
        from app.services import plan_carry

        class Clock(real_dt):
            @classmethod
            def now(cls, tz=None):
                return now.astimezone(tz) if tz else now.replace(tzinfo=None)

        sent = []
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "datetime", Clock), \
                mock.patch.object(plan_carry, "_planned", self.planned), \
                mock.patch.object(startup, "_dm_report", lambda *a, **k: sent.append((a, k))):
            startup.carry_plan_nov24()
        return sent

    def test_the_step_runs_once_on_the_24th_and_never_after_it(self):
        from zoneinfo import ZoneInfo

        from app import startup
        from app.models import AppSetting
        tz = ZoneInfo("Asia/Tashkent")
        self.db.execute(__import__("sqlalchemy").text("DELETE FROM app_settings"))
        self.db.commit()
        late = self._run_step(__import__("datetime").datetime(2026, 11, 25, 9, 0, tzinfo=tz))
        self.assertEqual(late[0][0][0], "warn")                                 # too late: nothing copied
        self.assertEqual(self.db.query(PPLineDaily).filter_by(date=DST).count(), 0)
        self.db.query(AppSetting).filter_by(key=startup.PLAN_CARRY_FLAG).delete()
        self.db.commit()
        sent = self._run_step(__import__("datetime").datetime(2026, 11, 24, 0, 40, tzinfo=tz))
        self.assertEqual(sent[0][0][0], "ok")
        self.db.expire_all()
        self.assertEqual(self.db.query(PPLineDaily).filter_by(date=DST).count(), 2)
        rows = dict((label, v) for _ic, label, v in sent[0][1]["rows"])
        self.assertEqual(rows["Xakimov Ruslan"], "bo'linma topilmadi")          # not in this database
        self.assertIn("reja: 2 pozitsiya ko'chirildi", rows["Талипова Мамура (#1)"])
        self.assertEqual(self._run_step(__import__("datetime").datetime(2026, 11, 24, 1, 0, tzinfo=tz)), [])


if __name__ == "__main__":
    unittest.main()
