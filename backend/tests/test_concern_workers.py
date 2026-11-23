"""The typed-name matcher behind «Kim yozgan» (services/concern_workers.py)."""
import unittest

from app.services.concern_workers import _first, pick

CELL = ["PARDAYEVA MASTURA BURIBOYEVNA", "SOBIROVA ZUBAYDA ALISHER QIZI",
        "ABSAMATOV NURLANBEK TOSHPO'LAT O'G'LI", "ABSAMATOV YERLAN TASHPULAT O‘G‘LI",
        "KURBANOVA MADINA TURSUNBAYEVNA", "AXMEDOVA MADINA BOYMURODOVNA",
        "XO'JAQULOVA MOXINUR BAXODIR QIZI"]


class PickTest(unittest.TestCase):
    def test_first_name_alone_in_cyrillic(self):
        self.assertEqual(pick("Мастура", CELL), CELL[0])
        self.assertEqual(pick("ZUBAYDA", CELL), CELL[1])

    def test_misspelt_full_name(self):
        self.assertEqual(pick("Хужакулова Мохинур", CELL), CELL[6])

    def test_clear_fuzzy_winner_between_brothers(self):
        self.assertEqual(pick("Absamatov Nurlan", CELL), CELL[2])

    def test_two_fit_is_no_answer(self):
        self.assertIsNone(pick("Madina", CELL))

    def test_patronymic_alone_is_nobody(self):
        self.assertIsNone(pick("Alisher", CELL))

    def test_nobody(self):
        self.assertIsNone(pick("Ishchi", CELL))
        self.assertIsNone(pick("", CELL))

    def test_ambiguous_pool_ends_the_walk(self):
        # two Madinas in the cell: the unit's single Madina must not be taken
        self.assertIsNone(_first("Madina", (CELL, ["ALIYEVA MADINA"])))
        self.assertEqual(_first("Мастура", ([], CELL)), CELL[0])


if __name__ == "__main__":
    unittest.main()
