"""The bot's /broadcast follows the «Xabarnoma» grant (`admin.tab.broadcast`),
not the admins table alone (docs/permissions.md). Scratch Postgres, see `pg_scratch`.
"""
from __future__ import annotations

import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class BotBroadcastGrant(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def test_grantee_may_and_a_stranger_may_not(self):
        from app import telegram_bot as tb
        from app.models import Admin, UserCapability
        db = self.pg.Session()
        db.add(Admin(telegram_id=1))
        db.add(UserCapability(telegram_id=2, capability="admin.tab.broadcast"))
        db.add(UserCapability(telegram_id=3, capability="page.view.tasks"))
        db.commit()
        db.close()
        with mock.patch.object(tb, "SessionLocal", self.pg.Session):
            self.assertTrue(tb._may_broadcast(1))    # an admin
            self.assertTrue(tb._may_broadcast(2))    # the grant
            self.assertFalse(tb._may_broadcast(3))   # another grant
            self.assertFalse(tb._may_broadcast(4))   # nobody
            self.assertEqual(tb._bc_actor(1), {"actor_role": "admin"})
            self.assertEqual(tb._bc_actor(2), {"via_capability": "admin.tab.broadcast"})


if __name__ == "__main__":
    unittest.main()
