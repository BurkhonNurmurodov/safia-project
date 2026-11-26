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

    def test_menu_follows_the_grant(self):
        """A grantee's chat menu gains /broadcast once, in their language; an
        unchanged sync is silent; a cleared grant takes the menu back."""
        from types import SimpleNamespace
        from app import telegram_bot as tb
        from app.models import Admin, TelegramUser, UserCapability
        db = self.pg.Session()
        db.query(UserCapability).delete()
        db.query(Admin).delete()
        db.add(Admin(telegram_id=11))
        db.add(TelegramUser(telegram_id=12, full_name="G", role="guest", language="ru"))
        db.add(UserCapability(telegram_id=11, capability="admin.tab.broadcast"))
        db.add(UserCapability(telegram_id=12, capability="admin.tab.broadcast"))
        db.commit()
        bot = mock.Mock()
        live = SimpleNamespace(telegram_bot_token="t", backend_url="https://x")
        with mock.patch.object(tb, "SessionLocal", self.pg.Session), \
                mock.patch.object(tb, "bot", bot), mock.patch.object(tb, "settings", live), \
                mock.patch.dict(tb._state, {}, clear=True):
            tb.sync_broadcast_menus()
            (cmds,), kw = bot.set_my_commands.call_args
            self.assertEqual(bot.set_my_commands.call_count, 1)   # the admin is not here
            self.assertEqual(kw["scope"].chat_id, 12)
            self.assertEqual([c.command for c in cmds],
                             [c.command for c in tb._MENUS["ru"]] + ["broadcast"])
            self.assertEqual(cmds[-1].description, tb._BC_ROW["ru"])

            tb.sync_broadcast_menus()
            self.assertEqual(bot.set_my_commands.call_count, 1)   # nothing changed
            bot.delete_my_commands.assert_not_called()

            db.query(UserCapability).filter_by(telegram_id=12).delete()
            db.commit()
            tb.sync_broadcast_menus()
            self.assertEqual(bot.delete_my_commands.call_args.kwargs["scope"].chat_id, 12)
            tb.sync_broadcast_menus()
            self.assertEqual(bot.delete_my_commands.call_count, 1)
        db.close()

    def test_a_save_of_the_grant_kicks_the_sync(self):
        from app import capabilities, telegram_bot as tb
        db = self.pg.Session()
        with mock.patch.object(tb, "sync_broadcast_menus") as sync, \
                mock.patch("threading.Thread", lambda target, daemon: mock.Mock(start=target)):
            capabilities.apply_caps(db, [21], grants={"page.view.tasks": "own"})
            sync.assert_not_called()
            capabilities.apply_caps(db, [21], grants={"admin.tab.broadcast": "all"})
            capabilities.apply_caps(db, [21], revokes=["admin.tab.broadcast"])
            self.assertEqual(sync.call_count, 2)
        db.close()


if __name__ == "__main__":
    unittest.main()
