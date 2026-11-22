"""The Almaty plant, its unit and its catalogue (`services/almaty_plant`,
`startup.add_almaty_plant`, 2026-11-20).

What is pinned: the catalogue is the form's — 83 lines, 53 · 12 · 18 over the
teams A · B · C, every line with a Трудоемкость and a key of its own; on a
production-shaped database the step adds the plant after the last tab, a unit
named after it (next id, shift 1, загрузка OFF) and the catalogue with the
teams' штатка; it runs once; it never writes into a unit that holds a catalogue
and never guesses between several units; other plants' units are untouched.
Then the unit takes its head's name (`startup.name_almaty_unit`): Akramova
Munisa, spelt as the register spells a Verifix person, «Brigadir o'rnida» as a
person's answer, the bound accounts' name following; once; a unit somebody
already named after another person, or no unit at all, changes nothing.
Then the second form replaces the catalogue (`startup.replace_almaty_catalog`,
2026-11-21): 84 lines over 8898 · 6866 · 9888, dated from the shift in
progress — the days before read A · B · C — with a line that keeps its name
edited in place, what a person typed from that day on carried with it, the
teams renamed, a line the form lacks gone and the archive kept; once.
The database half runs where `SAFIA_TEST_PG` names a server.
"""
import unittest
from collections import Counter
from datetime import date, datetime
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

from app import startup
from app.models import (AppSetting, Factory, Manager, PPCatalogMove, PPCatalogVersion,
                        PPDaily, PPLineDaily, PPProduct, PPWorkCenter,
                        PPWorkCenterDaily, TelegramUserRole)
from app.models import Cell, ProfilePermission
from app.capabilities import CAP_CONTAINER_COLS
from app.services import almaty_plant, pp_catalog
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

    def test_the_second_forms_rows(self):
        form = almaty_plant.FORM_NOV21
        self.assertEqual(len(form), 84)
        self.assertEqual(Counter(t for _, _, t in form),
                         {"8898": 54, "6866": 12, "9888": 18})
        self.assertEqual(form[0], ("Круасан Класс Замарозка", 3.5, "8898"))
        self.assertEqual(form[-1], ("СосискаСлойка Булочка Гп", 4.2, "8898"))
        teams = {c for c, _, _ in almaty_plant.FORM_NOV21_TEAMS}
        for name, labor, team in form:
            self.assertEqual(name, " ".join(name.split()))
            self.assertGreater(labor, 0)
            self.assertIn(team, teams)
        self.assertEqual(len({daily_key("", n) for n, _, _ in form}), 84)

    def test_the_second_form_against_the_first(self):
        old = {n: (lab, t) for n, lab, t in almaty_plant.LINES}
        new = {n: (lab, t) for n, lab, t in almaty_plant.FORM_NOV21}
        self.assertEqual(set(old) - set(new), {"Сосиска Булочка Замарозка"})
        self.assertEqual(set(new) - set(old), {"СосискаСлойка Булочка Замарозка",
                                               "СосискаСлойка Булочка Гп"})
        self.assertEqual({n: (old[n][0], new[n][0]) for n in new
                          if n in old and old[n][0] != new[n][0]},
                         {"Балиш Гп": (3.4, 3.7), "Сосиска Булочка Гп": (4.2, 3.1)})
        # Every team is the first form's, written as a number — one to one.
        was = {letter: code for code, _, letter in almaty_plant.FORM_NOV21_TEAMS}
        self.assertTrue(all(new[n][1] == was[old[n][1]] for n in new if n in old))
        self.assertEqual([(letter, n) for _, n, letter in almaty_plant.FORM_NOV21_TEAMS],
                         list(almaty_plant.TEAMS))

    def test_the_head_as_the_register_spells_her(self):
        from app.services import supervisor_kind, verifix_org
        self.assertEqual(verifix_org.profile_name(almaty_plant.HEAD),
                         "Akramova Munisa Akmal Qizi")
        self.assertIn(almaty_plant.HEAD_KIND, supervisor_kind.KINDS)
        self.assertEqual(almaty_plant.HEAD_KIND, "acting")


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
                             "pp_daily, pp_line_daily, pp_work_center_daily, pp_catalog_moves, "
                             "cells, managers, factories, app_settings, telegram_user_roles, "
                             "translations RESTART IDENTITY CASCADE"))
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

    def _name(self):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: self.cards.append((tone, kw))):
            startup.name_almaty_unit()
        self.db.expire_all()

    # Saturday 21 Nov, 14:00 in Tashkent: shift 1 is running, so an edit made
    # now counts from the 21st.
    NOW = datetime(2026, 11, 21, 14, 0, tzinfo=pp_catalog.TZ)
    DAY = date(2026, 11, 21)
    EVE = date(2026, 11, 20)

    def _replace(self, now=None):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(pp_catalog, "now_local", lambda: now or self.NOW), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: self.cards.append((tone, kw))):
            startup.replace_almaty_catalog()
        self.db.expire_all()

    def _lines(self, unit=31):
        return (self.db.query(PPProduct).filter(PPProduct.manager_id == unit)
                .order_by(PPProduct.sort_order, PPProduct.id).all())

    def _line(self, name, unit=31):
        return self.db.query(PPProduct).filter(PPProduct.manager_id == unit,
                                               PPProduct.name == name).one()

    def _cells(self):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: self.cards.append((tone, kw))):
            startup.add_almaty_cells()
        self.db.expire_all()

    def test_the_four_cells_stand_on_the_unit(self):
        self._boot()
        self._cells()
        cells = {c.verifix_code: c for c in self.db.query(Cell).all()}
        self.assertEqual(sorted(cells), ["6668", "6866", "8898", "9888"])
        for c in cells.values():
            self.assertEqual(c.manager_id, 31)
            self.assertFalse(c.in_load)
            self.assertIsNone(c.leader_id)
            self.assertIsNone(c.archived_at)
        self.assertEqual({k: c.sap_code for k, c in cells.items()},
                         {"8898": "8898", "6866": "6866", "9888": "9888", "6668": None})
        self.assertEqual(cells["8898"].name_workshop_ru, "Комплектация")
        self.assertEqual(cells["6668"].vfx_division_id, "8684")
        self.assertEqual(self.db.query(Cell).filter(Cell.vfx_division_id.isnot(None)).count(), 4)
        self.assertEqual([t for t, _ in self.cards], ["ok", "ok"])

    def test_the_cells_run_once(self):
        self._boot()
        self._cells()
        self.db.query(Cell).filter(Cell.verifix_code == "6668").delete()
        self.db.commit()
        self._cells()
        self.assertEqual(self.db.query(Cell).count(), 3)

    def test_a_code_that_is_a_cell_already_is_left_alone(self):
        self._boot()
        self.db.add(Cell(verifix_code="9888", manager_id=1))
        self.db.commit()
        self._cells()
        self.assertEqual(self.db.query(Cell.manager_id).filter(Cell.verifix_code == "9888").scalar(), 1)
        self.assertEqual(self.db.query(Cell).count(), 4)
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        self.assertEqual(rows["Qo'shildi"], ["8898", "6866", "6668"])
        self.assertEqual(rows["Avvaldan bor (tegilmadi)"], ["9888 · bo'linma №1"])

    def test_no_unit_no_cells(self):
        self._cells()
        self.assertEqual(self.db.query(Cell).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["warn"])

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

    # ── the unit's head ──────────────────────────────────────────────────────

    def test_the_unit_takes_its_heads_name_and_kind(self):
        self._boot()
        self.db.add(TelegramUserRole(telegram_id=777, role="supervisor", role_id=31,
                                     full_name="Almaty", status="approved"))
        self.db.commit()
        self._name()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        self.assertEqual(unit.name, "Akramova Munisa Akmal Qizi")
        self.assertEqual(unit.supervisor_kind, "acting")
        self.assertEqual(unit.supervisor_kind_meta["src"], "manual")
        # Nothing else about the unit moved.
        self.assertEqual((unit.shift, bool(unit.archived), bool(unit.zagruzka_on),
                          unit.factory_id), (1, False, False, self._plant().id))
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id == 31).count(), 83)
        # The account bound to the unit reads the new name too.
        self.assertEqual(self.db.query(TelegramUserRole.full_name).filter_by(role_id=31).scalar(),
                         "Akramova Munisa Akmal Qizi")
        self.assertEqual([t for t, _ in self.cards], ["ok", "ok"])
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        self.assertEqual(rows["Avvalgi nomi"], "Almaty")
        self.assertEqual(rows["Telegram"], "1 ta akkaunt")

    def test_naming_runs_once(self):
        self._boot()
        self._name()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        unit.name = "Somebody Later"          # a person renames it afterwards
        self.db.commit()
        self._name()
        self.assertEqual(self.db.query(Manager.name).filter(Manager.id == 31).scalar(),
                         "Somebody Later")
        self.assertEqual(len(self.cards), 2)

    def test_a_unit_typed_in_her_name_by_hand_only_gets_the_kind(self):
        self._boot()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        unit.name = "AKRAMOVA MUNISA AKMAL QIZI"
        self.db.commit()
        self._name()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        self.assertEqual((unit.name, unit.supervisor_kind),
                         ("Akramova Munisa Akmal Qizi", "acting"))

    def test_a_unit_named_after_somebody_else_is_left_alone(self):
        self._boot()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        unit.name = "Somebody Real"
        self.db.commit()
        self._name()
        unit = self.db.query(Manager).filter(Manager.id == 31).one()
        self.assertEqual((unit.name, unit.supervisor_kind), ("Somebody Real", None))
        self.assertEqual([t for t, _ in self.cards], ["ok", "warn"])
        flag = self.db.query(AppSetting).filter_by(key=startup.ALMATY_HEAD_FLAG).one()
        self.assertTrue(flag.value.startswith("refused"))

    def test_no_plant_changes_nothing(self):
        self._name()
        self.assertEqual({m.name for m in self.db.query(Manager)},
                         {"Aripova Manzura", "Axmedova Munisa", "Yuldasheva Dilnoza Ulmasovna"})
        self.assertEqual([t for t, _ in self.cards], ["warn"])

    def test_a_namesake_unit_changes_nothing(self):
        self._boot()
        self.db.add(Manager(id=40, name="akramova munisa akmal qizi", shift=2, factory_id=1))
        self.db.commit()
        self._name()
        self.assertEqual(self.db.query(Manager.name).filter(Manager.id == 31).scalar(), "Almaty")
        self.assertEqual([t for t, _ in self.cards], ["ok", "warn"])

    # ── the second form ──────────────────────────────────────────────────────

    def test_the_second_form_replaces_the_catalogue(self):
        self._boot()
        ids = {p.name: p.id for p in self._lines()}
        self._replace()
        lines = self._lines()
        self.assertEqual([(p.name, float(p.labor_time), p.work_center) for p in lines],
                         [(n, float(lab), t) for n, lab, t in almaty_plant.FORM_NOV21])
        self.assertTrue(all(p.sap_code == "" and p.active and p.wc_group is None
                            for p in lines))
        self.assertEqual(len(set(line_keys(lines).values())), 84)
        # A line that kept its name is the SAME row; the two new names are new rows.
        kept = [p for p in lines if p.name in ids]
        self.assertEqual(len(kept), 82)
        self.assertTrue(all(ids[p.name] == p.id for p in kept))
        self.assertNotIn(ids["Сосиска Булочка Замарозка"], {p.id for p in lines})
        wcs = (self.db.query(PPWorkCenter).filter(PPWorkCenter.manager_id == 31)
               .order_by(PPWorkCenter.sort_order).all())
        self.assertEqual([(w.code, w.shtatka, w.active) for w in wcs],
                         [("8898", 2, True), ("6866", 2, True), ("9888", 1, True)])

        tone, card = self.cards[-1]
        self.assertEqual(tone, "ok")
        rows = dict((label, value) for _, label, value in card["rows"])
        self.assertEqual(rows["Katalog"], "84 ta pozitsiya (SAP kodsiz, nomi bo'yicha)")
        self.assertEqual(rows["Qaysi kundan"], "21.11.2026")
        self.assertEqual(rows["Komandalar · shtatka"], "8898 — 2, 6866 — 2, 9888 — 1")
        self.assertEqual(rows["Qo'shildi"], ["СосискаСлойка Булочка Замарозка",
                                             "СосискаСлойка Булочка Гп"])
        self.assertEqual(rows["Olib tashlandi"], ["Сосиска Булочка Замарозка"])
        self.assertEqual(rows["Trudoyomkost o'zgardi"], ["Балиш Гп: 3.4 → 3.7",
                                                         "Сосиска Булочка Гп: 4.2 → 3.1"])
        # No cell of the unit answers for a team yet — the card says which.
        self.assertIn("8898 · 6866 · 9888", card["notes"][-1][1])

    def test_the_days_before_keep_the_first_catalogue(self):
        self._boot()
        self._replace()
        v = self.db.query(PPCatalogVersion).filter(PPCatalogVersion.manager_id == 31).one()
        self.assertEqual((v.valid_from, v.valid_to), (None, self.EVE))
        eve = pp_catalog.at(self.db, 31, self.EVE)
        self.assertEqual([(p.name, float(p.labor_time), p.work_center) for p in eve.lines],
                         [(n, float(lab), t) for n, lab, t in almaty_plant.LINES])
        self.assertEqual([(w.code, w.shtatka) for w in eve.work_centers],
                         [("A", 2), ("B", 2), ("C", 1)])
        today = pp_catalog.at(self.db, 31, self.DAY)
        self.assertEqual(len(today.lines), 84)
        self.assertEqual({p.work_center for p in today.lines}, {"8898", "6866", "9888"})

    def test_after_the_shift_it_counts_from_tomorrow(self):
        self._boot()
        self._replace(now=datetime(2026, 11, 21, 20, 30, tzinfo=pp_catalog.TZ))
        v = self.db.query(PPCatalogVersion).filter(PPCatalogVersion.manager_id == 31).one()
        self.assertEqual(v.valid_to, self.DAY)
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        self.assertEqual(rows["Qaysi kundan"], "22.11.2026")

    def test_what_a_person_typed_follows_its_line(self):
        self._boot()
        keys = line_keys(self._lines())
        pizza, balish = self._line("Пицца Гп"), self._line("Балиш Гп")
        sandwich = self._line("Курыный Сендвич Передзагатовка")
        for day in (self.EVE, self.DAY):
            # A value typed on the line itself; one on a line whose Трудоемкость
            # the form changes too; and a shared one on the group's own row.
            self.db.add(PPLineDaily(manager_id=31, date=day, qty_key=daily_key("", pizza.name),
                                    work_center="A", line_key=keys[pizza.id],
                                    plan_override=120, actual_override=90, priority=1))
            self.db.add(PPLineDaily(manager_id=31, date=day, qty_key=daily_key("", balish.name),
                                    work_center="A", line_key=keys[balish.id], plan_override=40))
            self.db.add(PPDaily(manager_id=31, date=day, sap_code=daily_key("", sandwich.name),
                                work_center="B", plan_override=33))
            self.db.add(PPWorkCenterDaily(manager_id=31, date=day, work_center="A", people=3))
        self.db.commit()
        self._replace()

        new_keys = line_keys(self._lines())

        def typed(line, day):
            return self.db.query(PPLineDaily).filter(
                PPLineDaily.manager_id == 31, PPLineDaily.date == day,
                PPLineDaily.qty_key == daily_key("", line.name)).all()

        got = typed(pizza, self.DAY)
        self.assertEqual([(r.work_center, r.line_key, float(r.plan_override),
                           float(r.actual_override), r.priority) for r in got],
                         [("8898", new_keys[pizza.id], 120.0, 90.0, 1)])
        got = typed(balish, self.DAY)
        self.assertEqual([(r.work_center, r.line_key, float(r.plan_override)) for r in got],
                         [("8898", new_keys[balish.id], 40.0)])
        self.assertTrue(new_keys[balish.id].startswith("балиш гп|3.7"))
        got = typed(sandwich, self.DAY)
        self.assertEqual([(r.work_center, float(r.plan_override)) for r in got], [("6866", 33.0)])
        # The day before reads the first catalogue, so its numbers stay put.
        self.assertEqual([(r.work_center, r.line_key) for r in typed(pizza, self.EVE)],
                         [("A", keys[pizza.id])])
        self.assertEqual([(r.work_center, r.line_key) for r in typed(balish, self.EVE)],
                         [("A", keys[balish.id])])
        self.assertTrue(keys[balish.id].startswith("балиш гп|3.4"))
        self.assertEqual(typed(sandwich, self.EVE), [])
        shared = {r.date: r.plan_override for r in self.db.query(PPDaily).filter(
            PPDaily.manager_id == 31, PPDaily.work_center == "B").all()}
        self.assertEqual((float(shared[self.EVE]), shared[self.DAY]), (33.0, None))
        pins = {(r.date, r.work_center): r.people for r in self.db.query(PPWorkCenterDaily)
                .filter(PPWorkCenterDaily.manager_id == 31).all()}
        self.assertEqual(pins, {(self.EVE, "A"): 3, (self.DAY, "8898"): 3})
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        # ПЛАН, ФАКТ and «Navbat» of one line, a ПЛАН of two more, one pin.
        self.assertEqual(rows["Yangi komandaga ko'chirilgan kiritmalar"], "6 ta")

    def test_what_a_person_set_on_a_line_stays(self):
        self._boot()
        p = self._line("Пицца Гп")
        p.uom, p.cap_yellow, p.sap_code, p.wc_group = "dona", 24, "F1001", "B"
        pid = p.id
        self.db.commit()
        self._replace()
        p = self._line("Пицца Гп")
        self.assertEqual((p.id, p.uom, float(p.cap_yellow), p.sap_code, p.work_center),
                         (pid, "dona", 24.0, "F1001", "8898"))
        # A letter names a cell AT a work centre, and the Команда changed.
        self.assertIsNone(p.wc_group)

    def test_a_line_the_form_lacks_goes_and_the_archive_stays(self):
        self._boot()
        self.db.add_all([
            PPProduct(manager_id=31, sap_code="", name="Их строка", work_center="A",
                      labor_time=9, sort_order=200),
            PPProduct(manager_id=31, sap_code="", name="Старая", work_center="B",
                      labor_time=5, sort_order=201, active=False),
            PPProduct(manager_id=31, sap_code="", name="Не из команд", work_center="D",
                      labor_time=5, sort_order=202, active=False),
            PPWorkCenter(manager_id=31, code="D", shtatka=4, sort_order=3),
            PPWorkCenter(manager_id=31, code="E", shtatka=1, sort_order=4),
        ])
        gone = self._line("Круасан Гп Миндаль")
        gone.active = False                     # set aside, and the form names it
        self.db.query(PPWorkCenter).filter(PPWorkCenter.manager_id == 31,
                                           PPWorkCenter.code == "A").one().capacity = 900
        self.db.commit()
        self._replace()
        lines = self._lines()
        self.assertEqual([p.name for p in lines if p.active],
                         [n for n, _, _ in almaty_plant.FORM_NOV21])
        self.assertEqual([(p.name, p.work_center, p.sort_order) for p in lines if not p.active],
                         [("Старая", "6866", 84), ("Не из команд", "D", 85)])
        wcs = {w.code: (w.shtatka, w.capacity and float(w.capacity))
               for w in self.db.query(PPWorkCenter).filter(PPWorkCenter.manager_id == 31)}
        # Team A's row was renamed, so the capacity somebody tuned stays; «D»
        # is still named by an archived line, «E» by nothing.
        self.assertEqual(wcs, {"8898": (2, 900.0), "6866": (2, None), "9888": (1, None),
                               "D": (4, None)})
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        self.assertEqual(sorted(rows["Olib tashlandi"]),
                         sorted(["Их строка", "Сосиска Булочка Замарозка"]))
        self.assertEqual((rows["Arxivdan qaytdi"], rows["Arxivda qoldi"]), ("1 ta", "2 ta"))

    def test_replacing_runs_once(self):
        self._boot()
        self._replace()
        self.db.query(PPProduct).filter(PPProduct.manager_id == 31,
                                        PPProduct.name == "Товук Кесиш").delete()
        self.db.commit()
        self._replace()
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id == 31).count(), 83)
        self.assertEqual([t for t, _ in self.cards], ["ok", "ok"])

    def test_a_unit_with_no_catalogue_takes_the_form_for_every_day(self):
        plant = Factory(code="Almaty", name_ru="Алматы", sort_order=5)
        self.db.add(plant)
        self.db.flush()
        self.db.add(Manager(id=40, name="Somebody Real", shift=1, factory_id=plant.id))
        self.db.commit()
        self._replace()
        self.assertEqual([(p.name, p.work_center) for p in self._lines(40)],
                         [(n, t) for n, _, t in almaty_plant.FORM_NOV21])
        self.assertEqual(self.db.query(PPCatalogVersion).count(), 0)
        rows = dict((label, value) for _, label, value in self.cards[-1][1]["rows"])
        self.assertEqual(rows["Qaysi kundan"], "barcha kunlar")

    def test_no_unit_on_the_plant_replaces_nothing(self):
        self._replace()
        self.assertEqual(self.db.query(PPProduct).filter(PPProduct.manager_id != 20).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["warn"])
        flag = self.db.query(AppSetting).filter_by(key=startup.ALMATY_FORM_FLAG).one()
        self.assertTrue(flag.value.startswith("refused"))

    def test_positions_that_moved_with_a_cell_stop_it(self):
        self._boot()
        self.db.add(PPCatalogMove(kind="live", state="moved", cell_id=1, code="A",
                                  from_unit=1, to_unit=31, home_from=self.EVE))
        self.db.commit()
        self._replace()
        self.assertEqual([(p.name, p.work_center) for p in self._lines()],
                         [(n, t) for n, _, t in almaty_plant.LINES])
        self.assertEqual(self.db.query(PPCatalogVersion).count(), 0)
        self.assertEqual([t for t, _ in self.cards], ["ok", "warn"])

    def test_other_units_keep_their_catalogue(self):
        self._boot()
        self._replace()
        keles = self.db.query(PPProduct).filter(PPProduct.manager_id == 20).all()
        self.assertEqual([(p.name, p.work_center) for p in keles], [("Олча тозалаш", "1612")])
        self.assertEqual(self.db.query(PPCatalogVersion).filter(
            PPCatalogVersion.manager_id != 31).count(), 0)

    # 22 Nov: the container columns of «Zagruzka fayli» opened for the unit
    # (`startup.container_cols_almaty`) — on its PROFILE, found by the plant.
    def _cols(self):
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: self.cards.append((tone, kw))):
            startup.container_cols_almaty()
        self.db.expire_all()

    def _col_grants(self):
        return sorted((p.profile_key, p.mode, p.scope) for p in self.db.query(ProfilePermission)
                      .filter(ProfilePermission.capability == CAP_CONTAINER_COLS).all())

    def test_the_container_columns_open_on_the_units_profile(self):
        self.db.execute(text("TRUNCATE profile_permissions RESTART IDENTITY"))
        self.db.commit()
        self._boot()
        self._cols()
        self.assertEqual(self._col_grants(), [("supervisor:31", "grant", "all")])
        self.assertEqual(self.cards[-1][0], "ok")
        # Once: a grant somebody takes back on the Permissions tab stays taken back.
        self.db.query(ProfilePermission).delete()
        self.db.commit()
        self._cols()
        self.assertEqual(self._col_grants(), [])

    def test_no_plant_no_container_columns(self):
        self.db.execute(text("TRUNCATE profile_permissions RESTART IDENTITY"))
        self.db.commit()
        self._cols()
        self.assertEqual(self._col_grants(), [])
        self.assertEqual([t for t, _ in self.cards], ["warn"])


if __name__ == "__main__":
    unittest.main()
