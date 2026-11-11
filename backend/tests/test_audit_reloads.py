"""public.audit's reloads: the older full copies go, a unique row never does."""
import unittest

from sqlalchemy import text

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

A = ("2026-10-01", "t", 1, "9422", "g", "f", 91.5)
B = ("2026-10-02", "t", 1, "9423", "g", None, 80)
C = ("2026-11-05", "t", 1, "9424", "g", "f", 70)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class AuditReloads(unittest.TestCase):
    def setUp(self):
        self.pg = ScratchDB()
        with self.pg.engine.begin() as c:
            c.execute(text(
                "CREATE TABLE public.audit (date date, type_name varchar, factory_id int, "
                "division_name varchar, division_group_name varchar, foreman varchar, avg_rating numeric)"))

    def tearDown(self):
        self.pg.drop()

    def _load(self, *rows):  # one load = one transaction
        with self.pg.engine.begin() as c:
            for r in rows:
                c.execute(text("INSERT INTO public.audit VALUES (:a,:b,:c,:d,:e,:f,:g)"),
                          dict(zip("abcdefg", r)))

    def _clean(self):
        from app.services.tech_audit import drop_older_loads
        db = self.pg.Session()
        try:
            out = drop_older_loads(db)
            db.commit()
            return out, db.execute(text("SELECT count(*) FROM public.audit")).scalar()
        finally:
            db.close()

    def test_older_copies_go_and_a_real_pair_stays(self):
        self._load(A, A, B)
        self._load(A, A, B)
        self._load(A, A, B, C)
        self.assertEqual(self._clean(), ((6, 0), 4))
        self.assertEqual(self._clean(), ((0, 0), 4))

    def test_a_row_only_an_older_load_has_stops_everything(self):
        self._load(A, B)
        self._load(A, C)
        self.assertEqual(self._clean(), ((0, 1), 4))

    def test_fewer_copies_in_the_newest_load_stops_everything(self):
        self._load(A, A)
        self._load(A)
        self.assertEqual(self._clean(), ((0, 1), 3))


if __name__ == "__main__":
    unittest.main()
