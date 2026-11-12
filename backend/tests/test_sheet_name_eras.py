"""A unit that changed brigadir keeps its sheet history (`name_map.SHEET_NAME_ERAS`)."""
import unittest

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class SheetNameEras(unittest.TestCase):
    def setUp(self):
        self.pg = ScratchDB()

    def tearDown(self):
        self.pg.drop()

    def test_old_rows_go_to_the_unit_new_rows_stay_with_the_name(self):
        from app.models import LeaderChecklist, Manager, ProductionData, Translation
        from app.services.name_map import rekey_sheet_eras, sheet_alias_map
        db = self.pg.Session()
        try:
            db.add_all([Manager(id=9, name="Raximova Kamola"),
                        Manager(id=10, name="Niyozov Izzatilla"),
                        # her Cyrillic spelling followed her to unit 9
                        Translation(lang="ru", key="name.Raximova Kamola", value="Рахимова Камола")])
            db.add_all([
                ProductionData(manager_name="Рахимова Камола", date="23.10.2026", prod_plan=1),
                ProductionData(manager_name="Рахимова Камола", date="24.10.2026", prod_plan=2),
                ProductionData(manager_name="Мирмахмудова Мунира", date="23.10.2026", prod_plan=3),
                LeaderChecklist(date="2026-08-26", supervisor="Рахимова Камола", leader="L"),
            ])
            db.commit()
            self.assertEqual(rekey_sheet_eras(db),
                             {"production_data": 2, "leader_checklists": 1})
            db.commit()
            alias = sheet_alias_map(db, ["Raximova Kamola", "Niyozov Izzatilla"])
            owner = {r.prod_plan: alias.get(r.manager_name) for r in db.query(ProductionData)}
            self.assertEqual(owner, {1: "Niyozov Izzatilla",   # Kamola's unit-10 day
                                     2: "Raximova Kamola",     # from the 24th, unit 9's
                                     3: "Raximova Kamola"})    # Munira's day stays unit 9's
            self.assertEqual(db.query(LeaderChecklist.supervisor).scalar(), "Niyozov Izzatilla")
            self.assertEqual(rekey_sheet_eras(db), {})          # a second pass moves nothing
        finally:
            db.close()


class EraUnit(unittest.TestCase):
    """The Quality register's «Отв. бригадир» before and after the 24 Oct change."""

    def test_register_names(self):
        from app.services.name_map import era_unit
        self.assertEqual(era_unit("RAXIMOVA KAMOLA XIKMAT QIZI", "2026-10-23"), 10)
        self.assertIsNone(era_unit("RAXIMOVA KAMOLA XIKMAT QIZI", "2026-10-24"))
        self.assertEqual(era_unit("MIRMAXMUDOVA MUNIRA TEMIRBEKOVNA", "2026-08-01"), 9)
        # the plain name is his own unit 6, not the OF unit
        self.assertEqual(era_unit("SUVONOV ELSHOD VALIJON O'G'LI", "2026-08-01"), 6)
        self.assertEqual(era_unit("Сувонов Элшод ОФ", "2026-08-01"), 5)
        self.assertIsNone(era_unit("XAYRULLO O'G'LI ХABIBULLO", "2026-08-01"))
        self.assertIsNone(era_unit("ABDURAXIMOV ABDURAXMON ABDUXALIL O'G'LI", "2026-08-01"))
        self.assertIsNone(era_unit(None, "2026-08-01"))


if __name__ == "__main__":
    unittest.main()
