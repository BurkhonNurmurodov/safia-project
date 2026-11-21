"""«Ish grafigi» lists who Verifix has on a cell NOW (`kelish_placements`,
2026-11-21): a joiner from the next shift-day, a move with no gap or overlap,
the list as it stood (`as_of`), a collapsed read refused.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_kelish_placements
"""
import unittest
from datetime import date, datetime, timedelta, timezone

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

TZ = timezone(timedelta(hours=5))
D = date(2026, 11, 23)                       # a day after CURRENT_FROM
T0 = datetime(2026, 11, 23, 10, 0, tzinfo=TZ)


def directory(emps: dict) -> dict:
    """{eid: (name, code)} → the stored directory's shape."""
    divs = {f"u{c}": {"code": c, "raw": c, "name": c} for _, c in emps.values()}
    return {"divs": divs, "emps": {eid: {"name": n, "unit": f"u{c}", "div": "", "job": "Pekar"}
                                   for eid, (n, c) in emps.items()}}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class PlacementsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.models import Cell, Manager
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE kelish_placements, cells, managers, app_settings "
                             "RESTART IDENTITY CASCADE"))
        self.db.add_all([Manager(id=1, name="Day", shift=1), Manager(id=2, name="Night", shift=2)])
        self.db.flush()
        self.db.add_all([Cell(verifix_code="0701", manager_id=1), Cell(verifix_code="0702", manager_id=2)])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def lists(self, days, as_of=None):
        from app.services import kelish
        files = {d: ({}, None) for d in days}
        out = kelish._placed(self.db, files, as_of)
        return {d: {c: sorted(w["name"] for w in ws.values())
                    for c, ws in kelish.by_code(out[d][0]).items()} for d in days}

    def test_joiner_mover_and_as_of(self):
        from app.services import kelish
        base = {"1": ("ALIYEV ALI", "0701"), "2": ("KARIMOVA ZUHRA", "0701")}
        self.assertEqual(kelish.track_placements(self.db, directory(base), now=T0), 2)
        # The first pass is the plant as it stood: listed on its own day already.
        self.assertEqual(self.lists([D])[D], {"0701": ["ALIYEV ALI", "KARIMOVA ZUHRA"]})

        moved = dict(base, **{"2": ("KARIMOVA ZUHRA", "0702"), "3": ("YANGI ODAM", "0701")})
        t1 = T0 + timedelta(hours=6)         # 16:00: the day cell's today is D, the night cell's D-1
        self.assertEqual(kelish.track_placements(self.db, directory(moved), now=t1), 3)
        got = self.lists([D, D + timedelta(days=1)])
        # A joiner on a day cell waits for tomorrow. The mover's night cell
        # lists her from tonight (its D) — one list a day, so the newer wins.
        self.assertEqual(got[D], {"0701": ["ALIYEV ALI"], "0702": ["KARIMOVA ZUHRA"]})
        self.assertEqual(got[D + timedelta(days=1)],
                         {"0701": ["ALIYEV ALI", "YANGI ODAM"], "0702": ["KARIMOVA ZUHRA"]})
        # As it stood before the move.
        before = self.lists([D + timedelta(days=1)], as_of=T0 + timedelta(hours=1))
        self.assertEqual(before[D + timedelta(days=1)], {"0701": ["ALIYEV ALI", "KARIMOVA ZUHRA"]})

    def test_collapsed_read_and_empty_log(self):
        from app.services import kelish
        files = {D: ({"x": {"key": "x", "name": "X", "code": "0701", "job": "", "seen": D, "came": None}}, None)}
        self.assertIs(kelish._placed(self.db, files, None), files)        # nothing logged yet: the file stands
        many = {str(i): (f"ODAM {n}", "0701") for i, n in enumerate("ALI VALI SALI GULI NODIR BOTIR SOBIR KAMOL JAMOL ZAFAR".split())}
        kelish.track_placements(self.db, directory(many), now=T0)
        self.assertEqual(kelish.track_placements(self.db, directory({"1": ("ODAM VALI", "0701")}), now=T0), 0)
        self.assertEqual(len(self.lists([D])[D]["0701"]), 10)


if __name__ == "__main__":
    unittest.main()
