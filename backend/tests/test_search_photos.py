"""A person found by the header search comes with their face
(routers/search.py, routers/people.py — 2026-11-20).

The index names a brigadir's and a leader's profile-photo VERSION, the people
search says whether Verifix holds a photo of a worker; somebody with no photo
carries nothing, so the browser never asks for bytes that are not there.
"""
import unittest
from datetime import datetime, timezone

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

ADMIN = {"role": "admin", "sub": "1"}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class SearchPhotosTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.models import (LiveVerifixRead, Manager, ProfilePhoto, RoleProfile,
                                TurnoverPerson, TurnoverRead)
        from app.services import people, verifix_org

        cls.pg = ScratchDB()
        cls.at = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
        # Both keep one answer per process: start from none.
        people._DIR.update(at=0.0, read=-1, data=None)
        verifix_org._stored.update(at=None, data=None, toks=None)
        db = cls.pg.Session()
        db.add_all([Manager(id=1, name="Azimov Baxtiyor", shift=1),
                    Manager(id=2, name="Azizova Nargiza", shift=2)])
        db.flush()
        db.add_all([RoleProfile(id=1, role="leader", name="Azimjonova Dilnoza", manager_id=1),
                    RoleProfile(id=2, role="leader", name="Azizbekov Sardor", manager_id=1)])
        db.add_all([ProfilePhoto(profile_key="supervisor:1", data=b"jpeg", updated_at=cls.at),
                    ProfilePhoto(profile_key="leader:1", data=b"jpeg", updated_at=cls.at)])
        db.add_all([TurnoverPerson(employee_id="11", name="AZIMOV JAVLON", status="W"),
                    TurnoverPerson(employee_id="12", name="AZIMOV LOCHINBEK", status="W")])
        db.add(TurnoverRead(ok=True, finished_at=cls.at, trigger="test"))
        db.add(LiveVerifixRead(key=verifix_org.ORG_KEY, read_at=cls.at,
                               data={"emps": {"11": {"photo": "a" * 64}, "12": {"photo": None}}}))
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        from app.services import people, verifix_org
        people._DIR.update(at=0.0, read=-1, data=None)
        verifix_org._stored.update(at=None, data=None, toks=None)
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()

    def tearDown(self):
        self.db.close()

    def test_the_index_names_a_profile_photo_version_only_where_there_is_one(self):
        from app.routers.search import search_index
        got = search_index(db=self.db, payload=ADMIN)
        ver = int(self.at.timestamp())
        self.assertEqual({u["name"]: u["photo"] for u in got["units"]},
                         {"Azimov Baxtiyor": ver, "Azizova Nargiza": None})
        self.assertEqual({l["name"]: l["photo"] for l in got["leaders"]},
                         {"Azimjonova Dilnoza": ver, "Azizbekov Sardor": None})

    def test_a_worker_row_says_whether_verifix_holds_a_photo(self):
        from app.routers.people import search
        got = search(q="azimov", limit=6, db=self.db, payload=ADMIN)
        self.assertEqual({r["employee_id"]: r["photo"] for r in got["rows"]},
                         {"11": True, "12": False})

    def test_a_search_that_finds_nobody_reads_no_photos(self):
        from app.routers.people import search
        self.assertEqual(search(q="zzz", limit=6, db=self.db, payload=ADMIN)["rows"], [])


if __name__ == "__main__":
    unittest.main()
