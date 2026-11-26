"""A concern filed by somebody with no unit of their own — an admin, a
shift-manager — is anchored to its CELL's unit (`concerns._cell_manager_id`).

Pinned 2026-11-26: that lookup selected `coalesce(leader's unit, cell's unit)`
and outer-joined the leader profile without saying the join starts FROM the
cell, so SQLAlchemy refused to build it and every such filing answered
«Internal Server Error». What is pinned: both creators file, the row lands on
the cell's unit (the leader's unit wins over the cell's own column), and a
leaderless cell falls back to the cell's unit. The database half runs where
`SAFIA_TEST_PG` names a server.
"""
import unittest

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.models import Cell, Factory, LeaderConcern, Manager, RoleProfile
from app.routers import concerns


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class ConcernAnchorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        db = cls.pg.Session()
        db.add(Factory(id=1, code="Uchtepa", name_ru="Учтепа", sort_order=0))
        db.flush()
        db.add_all([Manager(id=101, name="Unit A", shift=1, factory_id=1),
                    Manager(id=102, name="Unit B", shift=1, factory_id=1)])
        db.flush()
        db.add_all([RoleProfile(id=11, role="top-manager", name="Top One"),
                    RoleProfile(id=21, role="shift-manager", name="SM One", shift=1),
                    RoleProfile(id=31, role="leader", name="Leader One", manager_id=101)])
        db.flush()
        # 6668: its leader stands in unit 101 while the cell's own column says
        # 102 — the leader's unit is the anchor. 7001: no leader at all.
        db.add_all([Cell(id=1, verifix_code="6668", manager_id=102, leader_id=31),
                    Cell(id=2, verifix_code="7001", manager_id=102, leader_id=None)])
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def _file(self, payload, cell, **extra):
        db = self.pg.Session()
        try:
            body = concerns.ConcernIn(cell_code=cell, category="ars", concern_text="text",
                                      top_manager_profile_id=11, **extra)
            out = concerns.create_concern(body=body, db=db, payload=payload)
            row = db.query(LeaderConcern).filter_by(id=out["id"]).one()
            return row.level, row.brigadir_manager_id
        finally:
            db.close()

    def test_a_shift_manager_files_on_the_cells_unit(self):
        payload = {"sub": "600", "role": "shift-manager", "role_id": 21, "full_name": "SM One"}
        self.assertEqual(self._file(payload, "6668"), ("top-manager", 101))

    def test_an_admin_files_on_the_cells_unit(self):
        payload = {"sub": "1", "role": "admin", "role_id": None, "full_name": "Admin"}
        self.assertEqual(self._file(payload, "6668", level="top-manager"), ("top-manager", 101))
        self.assertEqual(self._file(payload, "7001", level="top-manager"), ("top-manager", 102))

    def test_the_lookup_itself(self):
        db = self.pg.Session()
        try:
            self.assertEqual(concerns._cell_manager_id(db, "6668"), 101)
            self.assertEqual(concerns._cell_manager_id(db, "7001"), 102)
            self.assertIsNone(concerns._cell_manager_id(db, "0000"))
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
