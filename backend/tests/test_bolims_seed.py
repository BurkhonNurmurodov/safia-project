"""The bo'lims seed (services/bolims.py, 2026-11-23): every cell is placed in
ONE room, a twin never overrides a room the plans give, and every twin points
at a seeded room."""
import unittest

from app.services import bolims


class BolimSeedTest(unittest.TestCase):
    def test_each_cell_in_one_room(self):
        seen = {}
        for room, *_x, cells in bolims.SEED:
            for c in cells.split():
                self.assertNotIn(c, seen, f"{c} in {seen.get(c)} and {room}")
                seen[c] = room

    def test_rooms_unique_and_twins_point_at_them(self):
        rooms = [r[0] for r in bolims.SEED]
        self.assertEqual(len(rooms), len(set(rooms)))
        planned = {c for *_x, cells in bolims.SEED for c in cells.split()}
        for c, room in bolims.TWINS.items():
            self.assertIn(room, rooms)
            self.assertNotIn(c, planned, f"twin {c} is already on the plans")

    def test_placement(self):
        p = bolims.seed_placement()
        self.assertEqual(p["7416"], "r9")       # on the plans
        self.assertEqual(p["7421"], "r9")       # the 2nd shift's twin
        self.assertNotIn("1611", p)             # Keles: not on the plans
        self.assertEqual(len(p), 83 + len(bolims.TWINS))


if __name__ == "__main__":
    unittest.main()


try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class BolimSeedDB(unittest.TestCase):
    """On a real database: the seed creates the rooms and places the cells
    once; a cell somebody placed by hand stays; the API saves, lists with
    counts, deletes and frees the cells; the container split reads places."""

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def test_seed_api_and_places(self):
        from unittest import mock
        from fastapi import HTTPException
        from app import startup
        from app.models import AppSetting, Bolim, Cell
        from app.routers import profiles
        db = self.pg.Session()
        for code in ("7416", "7421", "1611", "8611"):
            db.add(Cell(verifix_code=code))
        db.add(Bolim(name_ru="Ручной", block="C", floor=1))
        db.commit()
        hand = db.query(Bolim).filter_by(name_ru="Ручной").one()
        hid = hand.id
        db.query(Cell).filter_by(verifix_code="8611").update({Cell.bolim_id: hid})
        db.commit()
        db.close()

        with mock.patch.object(startup, "SessionLocal", self.pg.Session):
            startup.add_cell_bolim_column()
            startup.seed_bolims()
            startup.seed_bolims()          # flag-guarded: nothing twice
        db = self.pg.Session()
        self.assertEqual(db.query(Bolim).filter(Bolim.sim_room.isnot(None)).count(), len(bolims.SEED))
        self.assertTrue(db.query(AppSetting).filter_by(key=bolims.SEED_FLAG).first())
        at = {c.verifix_code: c.bolim_id for c in db.query(Cell)}
        r9 = db.query(Bolim).filter_by(sim_room="r9").one()
        self.assertEqual(at["7416"], r9.id)
        self.assertEqual(at["7421"], r9.id)          # the twin
        self.assertIsNone(at["1611"])                # Keles: unplaced
        self.assertEqual(at["8611"], hid)        # placed by hand: kept

        places = bolims.cell_places(db, ["7416", "1611"])
        self.assertEqual(set(places), {"7416"})
        self.assertEqual((places["7416"]["block"], places["7416"]["floor"]), ("A", 2))
        self.assertEqual(places["7416"]["names"]["uz"], "Pirog tayyorlash sexi")

        caller = {"role": "admin"}
        out = profiles.admin_create_bolim(profiles.BolimPayload(name_uz="Yangi xona", block="b", floor=-1),
                                          db=db, caller=caller)
        nb = db.query(Bolim).filter_by(id=out["id"]).one()
        self.assertEqual((nb.block, nb.floor), ("B", -1))
        with self.assertRaises(HTTPException):
            profiles.admin_create_bolim(profiles.BolimPayload(name_ru="  ", block="A"), db=db, caller=caller)
        listed = {b["id"]: b for b in profiles._bolims_list(db)}
        self.assertEqual(listed[r9.id]["cells"], 2)
        gone = profiles.admin_delete_bolim(r9.id, db=db, caller=caller)
        self.assertEqual(gone["freed"], 2)
        db.expire_all()
        self.assertIsNone(db.query(Cell).filter_by(verifix_code="7416").one().bolim_id)
        db.close()


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class CellPlaceTyped(unittest.TestCase):
    """«Bo'limlar» typed like a spreadsheet: a typed name · block · floor finds
    the room that already has them (any language, any case), else makes ONE
    room; the same text typed again reuses it; a blank name clears."""

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def test_find_or_make(self):
        from app.models import Bolim, Cell
        from app.routers import container_flow as r
        db = self.pg.Session()
        db.add_all([Cell(verifix_code="7416"), Cell(verifix_code="7421"),
                    Bolim(name_uz="Pirog tayyorlash sexi", name_ru="Цех гот. пирогов", block="A", floor=2)])
        db.commit()
        c1 = db.query(Cell).filter_by(verifix_code="7416").one().id
        c2 = db.query(Cell).filter_by(verifix_code="7421").one().id
        room = db.query(Bolim).one().id
        P = r.CellPlaceBody
        out = r.put_cell_place(c1, P(name="  цех гот. пирогов ", block="a", floor=2), db=db, payload={})
        self.assertEqual((out["bolim_id"], out["created"]), (room, False))
        out = r.put_cell_place(c1, P(name="Pirog tayyorlash sexi", block="A", floor=3), db=db, payload={})
        self.assertTrue(out["created"])                     # another floor: another room
        made = out["bolim_id"]
        out = r.put_cell_place(c2, P(name="pirog tayyorlash sexi", block="A", floor=3), db=db, payload={})
        self.assertEqual((out["bolim_id"], out["created"]), (made, False))
        out = r.put_cell_place(c2, P(name="Новый цех", block="B", floor=-1), db=db, payload={})
        self.assertEqual(db.query(Bolim).filter_by(id=out["bolim_id"]).one().name_ru, "Новый цех")
        out = r.put_cell_place(c2, P(name=""), db=db, payload={})
        self.assertIsNone(out["bolim_id"])
        out = r.put_cell_place(c2, P(bolim_id=room), db=db, payload={})
        self.assertEqual(out["bolim_id"], room)
        self.assertEqual(db.query(Bolim).count(), 3)
        db.close()
