"""The Almaty plant, its unit and its catalogue (`services/almaty_plant`,
`startup.add_almaty_plant`, 2026-11-20).

What is pinned: the catalogue is the form's — 83 lines, 53 · 12 · 18 over the
teams A · B · C, every line with a Трудоемкость and a key of its own; on a
production-shaped database the step adds the plant after the last tab, a unit
named after it (next id, shift 1, загрузка OFF) and the catalogue with the
teams' штатка; it runs once; it never writes into a unit that holds a catalogue
and never guesses between several units; other plants' units are untouched.
The database half runs where `SAFIA_TEST_PG` names a server.
"""
import unittest
from collections import Counter
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

from app import startup
from app.models import AppSetting, Factory, Manager, PPProduct, PPWorkCenter
from app.services import almaty_plant
from app.services.pp_calc import daily_key, line_keys, takes_sap


class CatalogueData(unittest.TestCase):
    def test_the_forms_rows(self):
        self.assertEqual(len(almaty_plant.LINES), 83)
        self.assertEqual(Counter(t for _, _, t in almaty_plant.LINES),
                         {"A": 53, "B": 12, "C": 18})
        self.assertEqual(almaty_plant.LINES[0], ("Круасан Класс Замарозка", 3.5, "A"))
        self.assertEqual(almaty_plant.LINES[-1], ("Сосиска Булочка Гп", 4.2, "A"))

    def test_every_line_is_workable_and_its_own(self):
        teams = {c for c, _ in almaty_plant.TEAMS}
        for name, labor, team in almaty_plant.LINES:
            self.assertEqual(name, " ".join(name.split()))
            self.assertTrue(name)
            self.assertGreater(labor, 0)
            self.assertIn(team, teams)
        keys = {(team, daily_key("", name)) for name, _, team in almaty_plant.LINES}
        self.assertEqual(len(keys), len(almaty_plant.LINES))

    def test_teams_are_the_forms_headcount(self):
        self.assertEqual(almaty_plant.TEAMS, (("A", 2), ("B", 2), ("C", 1)))
        self.assertEqual(sum(n for _, n in almaty_plant.TEAMS), 5)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class AlmatyPlantTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE pp_products, pp_work_centers, pp_catalog_versions, "
                             "managers, factories, app_settings RESTART IDENTITY CASCADE"))
        # Production's shape on 2026-11-20: Uchtepa and Keles, units up to №30.
        uch = Factory(code="Uchtepa", name_ru="Учтепа", sort_order=0)
        kel = Factory(code="Keles", name_ru="Келес", sort_order=1)
        self.db.add_all([uch, kel])
        self.db.flush()
        self.db.add_all([
            Manager(id=1, name="Aripova Manzura", shift=1, factory_id=uch.id, zagruzka_on=True),
            Manager(id=20, name="Axmedova Munisa", shift=1, factory_id=kel.id, zagruzka_on=True),
            Manager(id=30, name="Yuldasheva Dilnoza Ulmasovna", shift=None, factory_id=uch.id),
        ])
        self.db.add(PPProduct(manager_id=20, sap_code="", name="Олча тозалаш",
                              work_center="1612", labor_time=187, sort_order=0))
        self.db.commit()
        self.cards = []

    def tearDown(self):
        self.db.close()

    def _boot(self):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: self.cards.append((tone, kw))):
            startup.add_almaty_plant()
        self.db.expire_all()

    def _plant(self):
        return self.db.query(Factory).filter(Factory.code == "Almaty").one()

    def test_adds_plant_unit_and_catalogue(self):
        self._boot()
        plant = self._plant()
        self.assertEqual((plant.name_ru, plant.name_uz, plant.name_en, plant.sort_order),
                         ("Алматы", "Olmaota", "Almaty", 2))
        self.assertFalse(plant.archived)
        unit = self.db.query(Manager).filter(Manager.factory_id == plant.id).one()
        self.assertEqual((unit.id, unit.name, unit.shift, bool(unit.archived),
                          bool(unit.zagruzka_on)), (31, "Almaty", 1, False, False))

        lines = (self.db.query(PPProduct).filter(PPProduct.manager_id == unit.id)
                 .order_by(PPProduct.sort_order).all())
        self.assertEqual([(p.name, float(p.labor_time), p.work_center) for p in lines],
                         [(n, float(lab), t) for n, lab, t in almaty_plant.LINES])
        self.assertTrue(all(p.sap_code == "" and p.active and p.wc_group is None
                            for p in lines))
        # Code-less lines: keyed by name, out of every SAP upload's reach.
        self.assertFalse(any(takes_sap(p.sap_code, p.auto_fill) for p in lines))
        self.assertEqual(len(set(line_keys(lines).values())), 83)
        wcs = (self.db.query(PPWorkCenter).filter(PPWorkCenter.manager_id == unit.id)
               .order_by(PPWorkCenter.sort_order).all())
        self.assertEqual([(w.code, w.shtatka) for w in wcs], [("A", 2), ("B", 2), ("C", 1)])
        self.assertEqual([t for t, _ in self.cards], ["ok"])

    def test_runs_once(self):
        self._boot()
        self._boot()
        self.assertEqual(self.db.query(Factory).count(), 3)
        self.assertEqual(self.db.query(Manager).count(), 4)
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id == 31).count(), 83)
        self.assertEqual(len(self.cards), 1)

    def test_other_plants_are_untouched(self):
        self._boot()
        keles = self.db.query(PPProduct).filter(PPProduct.manager_id == 20).all()
        self.assertEqual([p.name for p in keles], ["Олча тозалаш"])
        self.assertEqual({m.id: m.factory_id for m in self.db.query(Manager)
                          .filter(Manager.id.in_([1, 20, 30]))},
                         {1: 1, 20: 2, 30: 1})

    def test_a_hand_made_plant_and_unit_take_the_catalogue(self):
        plant = Factory(code="almaty", name_ru="Алматы", sort_order=5)
        self.db.add(plant)
        self.db.flush()
        self.db.add(Manager(id=40, name="Somebody Real", shift=2, factory_id=plant.id))
        self.db.commit()
        self._boot()
        self.assertEqual(self.db.query(Factory).count(), 3)
        self.assertEqual(self.db.query(Manager).count(), 4)
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id == 40).count(), 83)
        self.assertEqual([t for t, _ in self.cards], ["ok"])

    def test_a_unit_with_a_catalogue_is_left_alone(self):
        plant = Factory(code="Almaty", name_ru="Алматы", sort_order=5)
        self.db.add(plant)
        self.db.flush()
        self.db.add(Manager(id=40, name="Somebody Real", shift=1, factory_id=plant.id))
        self.db.add(PPProduct(manager_id=40, sap_code="", name="Их строка",
                              work_center="A", labor_time=9, sort_order=0))
        self.db.commit()
        self._boot()
        mine = self.db.query(PPProduct).filter(PPProduct.manager_id == 40).all()
        self.assertEqual([p.name for p in mine], ["Их строка"])
        self.assertEqual(self.db.query(PPWorkCenter).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["warn"])
        self._boot()
        self.assertEqual(len(self.cards), 1)

    def test_several_units_on_the_plant_change_nothing(self):
        plant = Factory(code="Almaty", name_ru="Алматы", sort_order=5)
        self.db.add(plant)
        self.db.flush()
        self.db.add_all([Manager(id=40, name="One", shift=1, factory_id=plant.id),
                         Manager(id=41, name="Two", shift=2, factory_id=plant.id)])
        self.db.commit()
        self._boot()
        self.assertEqual(self.db.query(Manager).count(), 5)
        self.assertEqual(self.db.query(PPProduct).filter(
            PPProduct.manager_id.in_([40, 41])).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["warn"])
        flag = self.db.query(AppSetting).filter_by(key=startup.ALMATY_PLANT_FLAG).one()
        self.assertTrue(flag.value.startswith("refused"))

    def test_a_namesake_unit_elsewhere_changes_nothing(self):
        self.db.add(Manager(id=40, name="ALMATY", shift=1, factory_id=1))
        self.db.commit()
        self._boot()
        # The plant it would have added is rolled back with the refusal.
        self.assertEqual(self.db.query(Factory).count(), 2)
        self.assertEqual(self.db.query(Manager).count(), 4)
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id == 40).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["warn"])


if __name__ == "__main__":
    unittest.main()
