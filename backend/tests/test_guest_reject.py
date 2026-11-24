"""A rejected guest request is deleted, with its profile (docs/registration.md
«A rejected guest is deleted»). Scratch Postgres (`SAFIA_TEST_PG`, see `pg_scratch`).

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_guest_reject
"""
from __future__ import annotations

import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class GuestReject(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app import telegram_bot as tb
        self.tb = tb
        self._patches = [mock.patch.object(tb, "SessionLocal", self.pg.Session),
                         mock.patch.object(tb, "notify_status_change"),
                         mock.patch.object(tb, "notify_admins_of_decision")]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()

    def _claim(self, db, tid, pid, other_role=None):
        from app.models import TelegramUser, TelegramUserRole
        db.add(TelegramUser(telegram_id=tid, full_name="G", role="guest"))
        r = TelegramUserRole(telegram_id=tid, role="guest", role_id=pid,
                             full_name="G", status="pending")
        db.add(r)
        if other_role:
            db.add(TelegramUserRole(telegram_id=tid, role=other_role, role_id=1,
                                    full_name="G", status="approved"))
        db.flush()
        return r.id

    def test_reject_deletes_request_account_and_profile(self):
        from app.models import RoleProfile, TelegramUser, TelegramUserRole
        db = self.pg.Session()
        p = RoleProfile(role="guest", name="Ali Valiyev")
        db.add(p)
        db.flush()
        pid, ref = p.id, self._claim(db, 101, p.id)
        db.commit()
        db.close()
        self.assertTrue(self.tb.decide_registration(ref, "rejected"))
        db = self.pg.Session()
        self.assertIsNone(db.get(RoleProfile, pid))
        self.assertIsNone(db.get(TelegramUserRole, ref))
        self.assertIsNone(db.query(TelegramUser).filter_by(telegram_id=101).first())
        db.close()

    def test_approve_drops_rivals_keeps_profile(self):
        from app.models import RoleProfile, TelegramUser, TelegramUserRole
        db = self.pg.Session()
        p = RoleProfile(role="guest", name="Vali Aliyev")
        db.add(p)
        db.flush()
        pid = p.id
        win = self._claim(db, 201, pid)
        lose = self._claim(db, 202, pid, other_role="top-manager")
        db.commit()
        db.close()
        self.assertTrue(self.tb.decide_registration(win, "approved"))
        db = self.pg.Session()
        self.assertIsNotNone(db.get(RoleProfile, pid))
        self.assertEqual(db.get(TelegramUserRole, win).status, "approved")
        self.assertIsNone(db.get(TelegramUserRole, lose))
        # the rival keeps the account: it holds another role
        self.assertIsNotNone(db.query(TelegramUser).filter_by(telegram_id=202).first())
        db.close()

    def test_reject_keeps_pwc_profile(self):
        from app.models import RoleProfile, TelegramUserRole
        db = self.pg.Session()
        p = RoleProfile(role="guest", name="PwC")
        db.add(p)
        db.flush()
        pid, ref = p.id, self._claim(db, 301, p.id)
        db.commit()
        db.close()
        self.assertTrue(self.tb.decide_registration(ref, "rejected"))
        db = self.pg.Session()
        self.assertIsNotNone(db.get(RoleProfile, pid))
        self.assertIsNone(db.get(TelegramUserRole, ref))
        db.close()

    def test_oneshot_drops_only_unchanged_unconnected(self):
        from app import startup
        from app.models import AppSetting, RoleProfile, TelegramUser, TelegramUserRole
        db = self.pg.Session()
        db.add_all([RoleProfile(id=419, role="guest", name="Suyunboyeva Solixa"),
                    RoleProfile(id=420, role="guest", name="Renamed Since"),
                    RoleProfile(id=423, role="guest", name="Iroda Yangiboyeva"),
                    RoleProfile(id=463, role="guest", name="Ayupov Asomiddin")])
        db.flush()
        rej = self._claim(db, 401, 419)
        db.get(TelegramUserRole, rej).status = "rejected"
        self._claim(db, 402, 423)          # pending again → stays
        db.commit()
        db.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
                mock.patch.object(startup, "_dm_report"):
            startup.drop_unconnected_guests()
        db = self.pg.Session()
        self.assertIsNone(db.get(RoleProfile, 419))
        self.assertIsNone(db.query(TelegramUser).filter_by(telegram_id=401).first())
        self.assertIsNone(db.get(RoleProfile, 463))
        self.assertIsNotNone(db.get(RoleProfile, 420))
        self.assertIsNotNone(db.get(RoleProfile, 423))
        self.assertIsNotNone(db.get(AppSetting, startup.UNCONNECTED_GUESTS_FLAG))
        db.close()


if __name__ == "__main__":
    unittest.main()
