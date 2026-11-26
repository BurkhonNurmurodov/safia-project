"""A top-manager pinned to one plant (`factory_scope.PLANT_BOUND_ROLES`,
2026-11-26 — the Almaty plant's top-manager: «all screens should show only the
data of Almaty plant for this account»).

What is pinned: a top-manager whose profile names a plant is LOCKED to it the
way a supervisor is to their unit's — `?factory=` cannot widen them and a
supervisor pick outside it yields nothing; one with no plant keeps every plant;
their «own» scope is their plant's units; a grant at «all» reads as «own» on
the server while the UI's reading keeps «all» (it shows them the pickers, which
the server cuts); `cut_to_plant` never hands back an empty list; and the
one-shot pins exactly one profile found by name, once, never over an admin's
pick. The database half runs where `SAFIA_TEST_PG` names a server.
"""
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app import capabilities, startup
from app.models import AppSetting, Factory, Manager, RoleProfile, UserCapability
from app.services import factory_scope


class NoDatabase(unittest.TestCase):
    """Roles that are never plant-bound answer without touching the database."""

    def test_other_roles_are_never_plant_bound(self):
        for role in ("admin", "shift-manager", "supervisor", "leader", "guest", None):
            payload = {"role": role, "role_id": 7}
            self.assertFalse(factory_scope.plant_bound(None, payload))
            self.assertIsNone(factory_scope.viewer_unit_ids(None, payload))

    def test_cut_leaves_a_free_viewer_alone(self):
        self.assertEqual(factory_scope.cut_to_plant(None, {"role": "admin"}, []), [])
        self.assertEqual(factory_scope.cut_to_plant(None, {"role": "admin"}, [3, 4]), [3, 4])

    def test_profile_factory_ignores_other_roles(self):
        self.assertIsNone(factory_scope.profile_factory_id(None, "shift-manager", 5))
        self.assertIsNone(factory_scope.profile_factory_id(None, "top-manager", None))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class PlantBoundTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        db = cls.pg.Session()
        db.add_all([Factory(id=1, code="Uchtepa", name_ru="Учтепа", sort_order=0),
                    Factory(id=2, code="Almaty", name_ru="Алматы", sort_order=1)])
        db.flush()
        db.add_all([Manager(id=101, name="Uchtepa A", shift=1, factory_id=1),
                    Manager(id=102, name="Uchtepa B", shift=2, factory_id=1),
                    Manager(id=201, name="Almaty A", shift=1, factory_id=2)])
        db.add_all([RoleProfile(id=11, role="top-manager", name="Almaz Khusainov", factory_id=2),
                    RoleProfile(id=12, role="top-manager", name="Free Top")])
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        self.bound = {"sub": "900", "role": "top-manager", "role_id": 11}
        self.free = {"sub": "901", "role": "top-manager", "role_id": 12}

    def tearDown(self):
        self.db.rollback()
        self.db.query(UserCapability).delete()
        self.db.commit()
        self.db.close()

    # ── the lock ──────────────────────────────────────────────────────────────
    def test_a_bound_top_manager_is_locked(self):
        self.assertEqual(factory_scope.viewer_factory_id(self.db, self.bound), 2)
        self.assertTrue(factory_scope.plant_bound(self.db, self.bound))
        # «All factories» and another plant's id both answer as Almaty
        self.assertEqual(factory_scope.resolve_factory(self.db, self.bound, None), 2)
        self.assertEqual(factory_scope.resolve_factory(self.db, self.bound, 1), 2)
        self.assertEqual(factory_scope.scoped_manager_ids(self.db, self.bound, None), [201])
        # a supervisor of another plant picked by hand yields nothing, not them
        self.assertEqual(factory_scope.scoped_manager_ids(self.db, self.bound, 1, [101]), [])

    def test_a_free_top_manager_keeps_every_plant(self):
        self.assertIsNone(factory_scope.viewer_factory_id(self.db, self.free))
        self.assertFalse(factory_scope.plant_bound(self.db, self.free))
        self.assertIsNone(factory_scope.scoped_manager_ids(self.db, self.free, None))
        self.assertEqual(factory_scope.scoped_manager_ids(self.db, self.free, 1), [101, 102])
        self.assertIsNone(factory_scope.viewer_unit_ids(self.db, self.free))

    def test_cut_to_plant_is_never_empty(self):
        cut = factory_scope.cut_to_plant
        self.assertEqual(cut(self.db, self.bound, []), [201])
        self.assertEqual(cut(self.db, self.bound, [101, 201]), [201])
        self.assertEqual(cut(self.db, self.bound, [101]), [factory_scope.NO_UNIT])
        self.assertEqual(cut(self.db, self.free, []), [])

    # ── scopes ────────────────────────────────────────────────────────────────
    def test_own_scope_is_the_plant(self):
        self.assertEqual(capabilities.profile_unit_ids(self.db, "top-manager:11"), [201])
        self.assertIsNone(capabilities.profile_unit_ids(self.db, "top-manager:12"))

    def test_a_grant_at_all_reads_as_own_on_the_server_only(self):
        cap = capabilities.page_cap("staff")
        self.db.add_all([UserCapability(telegram_id=900, capability=cap, scope="all"),
                         UserCapability(telegram_id=901, capability=cap, scope="all")])
        self.db.commit()
        self.assertEqual(capabilities.cap_scope(self.db, self.bound, cap), "own")
        self.assertFalse(capabilities.page_scope_is_all(self.db, self.bound, "staff"))
        # the UI keeps «all» — it shows the pickers, the server cuts them
        self.assertEqual(capabilities.page_scopes(self.db, self.bound).get("staff"), "all")
        self.assertEqual(capabilities.cap_scope(self.db, self.free, cap), "all")
        self.assertTrue(capabilities.page_scope_is_all(self.db, self.free, "staff"))

    # ── the one-shot ──────────────────────────────────────────────────────────
    def _run_oneshot(self):
        sent = []
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report",
                                  lambda tone, title, **kw: sent.append((tone, kw))):
            startup.almaty_top_manager_plant()
        return sent

    def test_oneshot_pins_the_one_profile_once(self):
        db = self.db
        db.query(RoleProfile).filter_by(id=11).update({"factory_id": None})
        db.query(AppSetting).filter_by(key=startup.ALMATY_TOP_MANAGER_FLAG).delete()
        db.commit()
        sent = self._run_oneshot()
        self.assertEqual(sent[0][0], "ok")
        db.expire_all()
        self.assertEqual(db.get(RoleProfile, 11).factory_id, 2)
        self.assertIsNone(db.get(RoleProfile, 12).factory_id)
        # once: an admin's later «every plant» is never undone by a reboot
        db.query(RoleProfile).filter_by(id=11).update({"factory_id": None})
        db.commit()
        self.assertEqual(self._run_oneshot(), [])
        db.expire_all()
        self.assertIsNone(db.get(RoleProfile, 11).factory_id)
        db.query(RoleProfile).filter_by(id=11).update({"factory_id": 2})
        db.commit()

    def test_oneshot_writes_nothing_on_two_matches(self):
        db = self.db
        db.query(AppSetting).filter_by(key=startup.ALMATY_TOP_MANAGER_FLAG).delete()
        db.add(RoleProfile(id=13, role="top-manager", name="Алмаз Хусаинов"))
        db.commit()
        try:
            sent = self._run_oneshot()
            self.assertEqual(sent[0][0], "warn")
            db.expire_all()
            self.assertIsNone(db.get(RoleProfile, 13).factory_id)
        finally:
            db.query(RoleProfile).filter_by(id=13).delete()
            db.commit()


if __name__ == "__main__":
    unittest.main()
