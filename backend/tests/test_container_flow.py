"""The container flow (services/container_flow.py): the split, the frozen
need and its top-up, and a batch's steps from the draft to the close.

`split` is pure and runs everywhere; the steps need the real tables (JSONB,
row locks), so they run where `SAFIA_TEST_PG` names a server.
"""
import unittest
from datetime import date, datetime, timedelta
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.models import Manager
from app.services import container_flow as flow

DAY = date(2026, 11, 16)


class SplitTest(unittest.TestCase):
    def test_enough_gives_everybody_their_due(self):
        self.assertEqual(flow.split(30, [18, 6, 4]), [18, 6, 4])   # the surplus stays with the batch

    def test_short_is_cut_in_proportion_and_adds_up(self):
        out = flow.split(15, [18, 6])
        self.assertEqual(sum(out), 15)
        self.assertEqual(out, [11, 4])

    def test_largest_remainder_breaks_ties_by_order(self):
        self.assertEqual(flow.split(1, [1, 1, 1]), [1, 0, 0])
        self.assertEqual(sum(flow.split(7, [3, 3, 3])), 7)

    def test_nothing_delivered(self):
        self.assertEqual(flow.split(0, [5, 2]), [0, 0])

    def test_share_out_scales_both_ways_and_adds_up(self):
        self.assertEqual(flow.share_out(30, [18, 12]), [18, 12])
        self.assertEqual(flow.share_out(20, [18, 12]), [12, 8])     # fewer asked than the figures
        self.assertEqual(flow.share_out(40, [18, 12]), [24, 16])    # more asked — scaled up, unlike split
        self.assertEqual(sum(flow.share_out(7, [1, 1, 1])), 7)
        self.assertEqual(flow.share_out(5, [0, 0]), [0, 0])


class UnitTeamsTest(unittest.TestCase):
    """`hourly_containers.unit_teams` is `unit_hours` kept per team: summed
    back together it is the same answer, so the readiness check («Sozlamalar»)
    counts the «Soatlik» figure and nothing else."""

    DASH = {
        "constants": {"shift_min": 480, "productive_min": 408, "shift_hours": {"start": "08:00"}},
        "rows": [
            {"work_center": "A1", "wc_group": "A", "seq": 1, "plan_qty": 400, "total_labor": 600, "cap_yellow": 20},
            {"work_center": "A1", "wc_group": "B", "seq": 2, "plan_qty": 90, "total_labor": 300, "cap_round": 9, "cap_box": 30},
            {"work_center": "A1", "wc_group": None, "seq": 3, "plan_qty": 50, "total_labor": 100, "cap_grey": 5},
            {"work_center": "B2", "seq": 1, "plan_qty": 120, "total_labor": 0, "cap_bucket": 10},      # no norm → untimed
            {"work_center": "B2", "seq": 2, "plan_qty": 300, "total_labor": 900, "cap_yellow": 25},
        ],
        "work_centers": [
            {"work_center": "A1", "people": 2, "cell": {"id": 1, "verifix_code": "9001", "leader": "L1"},
             "groups": [{"group": "A", "people": 3, "cell": {"id": 2, "verifix_code": "9002", "leader": "L2"}},
                        {"group": "B", "people": 2, "cell": None},
                        {"group": "Z", "people": 1, "orphan": True}]},
            {"work_center": "B2", "people": 4, "cell": None},
        ],
    }

    def test_teams_add_up_to_the_unit(self):
        from app.services import hourly_containers as hc
        hours, untimed = hc.unit_hours(self.DASH)
        teams = hc.unit_teams(self.DASH)
        got_h, got_u = {}, {}
        for t in teams:
            for h, e in t["hours"].items():
                for k, n in e.items():
                    got_h.setdefault(h, {})[k] = got_h.get(h, {}).get(k, 0) + n
            for k, n in t["untimed"].items():
                got_u[k] = got_u.get(k, 0) + n
        self.assertEqual(got_h, hours)
        self.assertEqual(got_u, untimed)
        self.assertTrue(hours and untimed)
        self.assertEqual([(t["work_center"], t["group"], t["rest"]) for t in teams],
                         [("A1", "A", False), ("A1", "B", False), ("A1", "", True), ("B2", "", False)])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class FlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        for t in ("container_events", "container_shares", "container_batch_lines",
                  "container_batches", "app_settings", "container_send_areas"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        if self.db.get(Manager, 1) is None:
            self.db.add(Manager(id=1, name="Unit One", shift=1))
        self.db.commit()
        # every unit's «Konteynerlar» figure — a brigadir's LIMIT for an hour;
        # generous here, so only the limit tests meet it
        big = {k: 100 for k in flow.KEYS}
        self.hours = {mid: {h: dict(big) for h in range(48)} for mid in (1, 2, 3)}
        self._h = mock.patch.object(flow, "units_hours", side_effect=lambda db, day: self.hours)
        self._h.start()

    def tearDown(self):
        self._h.stop()
        self.db.close()

    def at(self, hh, mm=0):
        return datetime.combine(DAY, datetime.min.time(), flow.TZ) + timedelta(hours=hh, minutes=mm)

    def test_notify_and_tv_oneshots_run_once(self):
        """15 Nov: the Telegram switch ON and the TV board open to the two
        manager roles — once each; an admin's later «off» / untick sticks."""
        from app import startup
        from app.permissions import get_page_access, set_page_access

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)["containers"]
            finally:
                s.close()

        def matrix_with(roles):
            s = self.pg.Session()
            try:
                m = get_page_access(s)
                m["containers"] = roles
                set_page_access(s, m)
            finally:
                s.close()

        matrix_with([])                      # an Access-tab save that names the page, nobody ticked
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_flow_notify_on()
            startup.containers_tv_managers()
            self.db.expire_all()
            self.assertTrue(flow.settings(self.db)["notify"])
            self.assertEqual(access(), ["top-manager", "shift-manager"])
            flow.save_settings(self.db, False)   # an admin switches it off, unticks the roles
            matrix_with([])
            startup.container_flow_notify_on()
            startup.containers_tv_managers()
            self.db.expire_all()
            self.assertFalse(flow.settings(self.db)["notify"])
            self.assertEqual(access(), [])
            self.assertEqual(dm.call_count, 2)           # one note each, the first time only

    def test_another_plants_brigadir_is_not_served(self):
        """20 Nov: the flow is Uchtepa's (resolved by name). A unit placed in
        another plant (Keles) is not offered, not counted and cannot be split
        to; a unit with no plant yet stays; no Uchtepa by name → no narrowing."""
        from app.models import Factory, ProfilePermission, RoleProfile
        for t in ("container_request_parts", "container_requests", "profile_permissions"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        self.db.execute(flow.text("UPDATE managers SET factory_id = NULL"))
        self.db.execute(flow.text("DELETE FROM factories"))
        self.db.commit()
        self.assertIn(1, flow.flow_unit_ids(self.db))         # no plants at all: nothing narrowed
        uch, kel = Factory(code="Uchtepa", name_uz="Uchtepa"), Factory(code="KELES", name_uz="Keles")
        self.db.add_all([uch, kel])
        self.db.flush()
        for i, fid in ((8801, uch.id), (8802, kel.id), (8803, None)):
            self.db.merge(Manager(id=i, name=f"Plant unit {i}", shift=1, factory_id=fid))
        self.db.commit()
        ids = flow.flow_unit_ids(self.db)
        self.assertIn(8801, ids)
        self.assertIn(8803, ids)                               # unplaced: stays
        self.assertNotIn(8802, ids)                            # Keles: out
        lp = RoleProfile(role="idle-owner", name="Logistics")
        self.db.add(lp)
        self.db.flush()
        nk = f"idle-owner:{lp.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 5}, "", "axo", "guest:1")
        self.db.commit()
        with self.assertRaises(flow.FlowError) as e:
            flow.assign_request(self.db, r.id, [{"manager_id": 8802, "counts": {"yellow": 5}}],
                                None, None, "a", "admin:1", True)
        self.assertEqual(e.exception.code, "unit")
        self.db.rollback()
        self.db.execute(flow.text("DELETE FROM container_requests"))
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        self.db.execute(flow.text("DELETE FROM managers WHERE id IN (8801, 8802, 8803)"))
        self.db.execute(flow.text("DELETE FROM factories"))
        self.db.commit()

    def test_brigadir_card_and_the_bot_button(self):
        """A split request tells each brigadir who may open «Qabul» (switch on);
        «Hammasi keldi» in the bot confirms only for a holder of that unit's
        brigadir profile, once."""
        from app.models import ProfilePermission, RoleProfile, TelegramUserRole
        from app.permissions import get_page_access, set_page_access
        from app.routers import staff
        for t in ("container_request_parts", "container_requests", "profile_permissions", "telegram_user_roles"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        for i in (1, 2):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.add(TelegramUserRole(telegram_id=5001, role="supervisor", role_id=1, full_name="Brig One",
                                     status="approved", profile_key="supervisor:1"))
        self.db.commit()
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30}, "", "axo", "guest:1")
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 18}},
                                            {"manager_id": 2, "counts": {"yellow": 12}}], None, None, "n", nk, False)
        self.db.commit()
        m = get_page_access(self.db)
        m["container-receive"] = []                 # the role closed …
        set_page_access(self.db, m)
        self.db.add(ProfilePermission(profile_key="supervisor:1", capability=flow.RECEIVE_CAP,
                                      mode="grant", scope="all"))          # … unit 1 by a personal grant
        self.db.commit()
        self.assertTrue(flow.receive_open(self.db, 1))
        self.assertFalse(flow.receive_open(self.db, 2))
        sent = []   # the card as notify_profile renders it — inside the sender's session

        def capture(db, key, nkey, params, **kw):
            sent.append((key, nkey, kw["html_fn"]("uz"), kw["markup_fn"]("uz").to_dict()))
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=capture):
            self.assertEqual(flow.notify_split(r.id), 0)          # switch off: nobody
            flow.save_settings(self.db, None, True)
            self.assertEqual(flow.notify_split(r.id), 1)          # unit 2's brigadir cannot open «Qabul»
        key, nkey, html, markup = sent[-1]
        self.assertEqual((key, nkey), ("supervisor:1", "container_split"))
        self.assertIn("18", html)
        kb = markup["inline_keyboard"]
        self.assertEqual(kb[0][0]["callback_data"], f"crv:{r.id}:1")
        self.assertIn(f"rcv={r.id}", kb[1][0]["web_app"]["url"])
        # the button: somebody else's tap does nothing; the holder's confirms once
        self.assertEqual(flow.receive_from_bot(self.db, r.id, 1, 9999)[0], "not_yours")
        code, got = flow.receive_from_bot(self.db, r.id, 1, 5001)
        self.assertEqual(code, "done")
        self.db.commit()
        self.assertEqual(flow.receipts_of(self.db, DAY, 1)[0]["received"], {"yellow": 18})
        self.assertEqual(flow.receive_from_bot(self.db, r.id, 1, 5001)[0], "already")
        self.assertEqual(flow.receive_from_bot(self.db, 999999, 1, 5001)[0], "gone")
        # an admin deletes it outright — even confirmed, which no cancel may touch
        flow.delete_request(self.db, r.id)
        self.db.commit()
        self.assertEqual([x for x in flow.requests_of(self.db, DAY) if x["id"] == r.id], [])
        self.assertEqual(self.db.query(flow.ContainerRequestPart).filter_by(request_id=r.id).count(), 0)
        self.assertEqual(flow.receive_from_bot(self.db, r.id, 1, 5001)[0], "gone")   # the old card
        with self.assertRaises(flow.FlowError) as e:
            flow.delete_request(self.db, r.id)
        self.assertEqual(e.exception.code, "gone")
        self.db.rollback()

    def test_cancel_after_split_and_the_reminder(self):
        """A split request can still be withdrawn (its brigadirs told, the bot
        button then says so); a unit that has not confirmed gets ONE reminder
        when the hour begins, never a stale one."""
        from app.models import ProfilePermission, RoleProfile, TelegramUserRole
        from app.routers import staff
        for t in ("container_request_parts", "container_requests", "profile_permissions", "telegram_user_roles"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        for i in (1, 2):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        for mid in (1, 2):
            self.db.add(ProfilePermission(profile_key=f"supervisor:{mid}", capability=flow.RECEIVE_CAP,
                                          mode="grant", scope="all"))
        self.db.add(TelegramUserRole(telegram_id=5001, role="supervisor", role_id=1, full_name="Brig One",
                                     status="approved", profile_key="supervisor:1"))
        self.db.commit()
        flow.save_settings(self.db, None, True)

        def split(hour, at):
            with mock.patch.object(flow, "now", return_value=at):
                r = flow.create_request(self.db, DAY, hour, nk, {"yellow": 30}, "", "axo", "guest:1")
                flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 18}},
                                                    {"manager_id": 2, "counts": {"yellow": 12}}],
                                    None, None, "n", nk, False)
            self.db.commit()
            return r

        sent = []
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=lambda db, key, nkey, params, **kw:
                               sent.append((key, nkey, kw["html_fn"]("uz"), "markup_fn" in kw))):
            # the reminder: split at 08:30 for 10:00 → due at 10:00 (the hour begins)
            r = split(10, self.at(8, 30))
            self.assertEqual(flow.remind_at(r), self.at(10))
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(9, 59)), 0)
            flow.receive(self.db, r.id, 2, None, None, None, "Brig Two")     # unit 2 confirmed
            self.db.commit()
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(10, 5)), 1)   # unit 1 only
            self.assertEqual(sent[-1][:2], ("supervisor:1", "container_split_remind"))
            self.assertTrue(sent[-1][3])                                     # with its buttons
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(10, 10)), 0)  # once
            # a split later than its hour: 30 minutes after the split; past the window — never
            late = split(11, self.at(11, 40))
            self.assertEqual(flow.remind_at(late), self.at(12, 10))
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(14, 30)), 0)  # stale: silent
            # the switch off: nobody
            flow.save_settings(self.db, None, False)
            r3 = split(12, self.at(9))
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(12, 1)), 0)
            flow.save_settings(self.db, None, True)

            # cancel after the split: allowed while nobody confirmed; brigadirs told, no buttons
            flow.cancel_request(self.db, r3.id, "reja o'zgardi", "axo")
            self.db.commit()
            n = len(sent)
            self.assertEqual(flow.notify_split_cancelled(r3.id), 2)
            self.assertEqual({s[1] for s in sent[n:]}, {"container_split_cancelled"})
            self.assertIn("reja o'zgardi", sent[-1][2])
            self.assertFalse(sent[-1][3])
        self.assertEqual(flow.receive_from_bot(self.db, r3.id, 1, 5001)[0], "cancelled")

    def test_need_vs_got_per_brigadir_per_day(self):
        """«Kerak va olingan»: the day's need per brigadir (the «Konteynerlar»
        figure) beside what was split and what they confirmed; a unit that
        needed and got nothing still has its row; a cancelled split counts
        nowhere; an unconfirmed one is `unconfirmed`, not a shortfall."""
        from app.models import ProfilePermission, RoleProfile
        for t in ("container_request_parts", "container_requests", "profile_permissions"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        for i in (1, 2, 3):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        need = {(DAY, 1): {"yellow": 20, "bucket": 4}, (DAY, 2): {"yellow": 10}, (DAY, 3): {"grey": 6}}
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30, "bucket": 4}, "", "axo", "guest:1")
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 20, "bucket": 4}},
                                            {"manager_id": 2, "counts": {"yellow": 10}}], None, None, "n", nk, False)
        self.db.commit()
        flow.receive(self.db, r.id, 1, {"yellow": 18, "bucket": 4}, "damaged", None, "b")
        c = flow.create_request(self.db, DAY, 11, nk, {"grey": 6}, "", "axo", "guest:1")
        flow.assign_request(self.db, c.id, [{"manager_id": 3, "counts": {"grey": 6}}], None, None, "n", nk, False)
        flow.cancel_request(self.db, c.id, "xato", "axo")
        self.db.commit()
        rows = {x["manager_id"]: x for x in flow.need_vs_got(self.db, DAY, DAY, need)}
        self.assertEqual({k: rows[1][k] for k in ("need", "given", "received", "unconfirmed", "diff", "pct")},
                         {"need": 24, "given": 24, "received": 22, "unconfirmed": 0, "diff": -2, "pct": 92})
        self.assertEqual(rows[1]["types"]["yellow"], {"need": 20, "given": 20, "received": 18})
        self.assertEqual({k: rows[2][k] for k in ("need", "given", "received", "unconfirmed", "pct")},
                         {"need": 10, "given": 10, "received": 0, "unconfirmed": 10, "pct": 0})
        self.assertEqual({k: rows[3][k] for k in ("need", "given", "received")},
                         {"need": 6, "given": 0, "received": 0})            # needed, got nothing, cancelled split
        self.assertEqual(rows[1]["unit"], self.db.get(Manager, 1).name)

    def test_yusuf_becomes_the_second_logistics_person(self):
        """16 Nov: Yusuf aka gets the logistics page like Nuriddin aka, so AXO
        picks between two; once, and only on exactly one matching profile."""
        from app import startup
        from app.models import ProfilePermission, RoleProfile
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        n = RoleProfile(role="idle-owner", name="Nuriddin aka")
        y = RoleProfile(role="idle-owner", name="Yusuf aka", name_ru="Юсуф ака")
        other = RoleProfile(role="leader", name="Yusuf Karimov")       # not a «Kutish mas'uli»
        self.db.add_all([n, y, other])
        self.db.flush()
        self.db.add(ProfilePermission(profile_key=f"idle-owner:{n.id}", capability=flow.LOGISTICS_CAP,
                                      mode="grant", scope="all"))
        self.db.commit()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.yusuf_container_logistics()
            startup.yusuf_container_logistics()                     # the flag: once
        self.db.expire_all()
        self.assertEqual([p["name"] for p in flow.logistics_people(self.db)], ["Nuriddin aka", "Yusuf aka"])
        self.assertEqual(dm.call_count, 1)

    def test_davron_gets_nuriddins_container_access(self):
        """18 Nov: Davron Kuldimirodov gets Nuriddin aka's container grants —
        the one live «Davron» profile, a leader namesake and a left one aside;
        once, and nothing while no profile is found."""
        from datetime import date as _d

        from app import capabilities, startup
        from app.models import ProfilePermission, RoleProfile
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        self.db.execute(flow.text("DELETE FROM app_settings WHERE key = :k"), {"k": startup.DAVRON_LOGISTICS_FLAG})
        n = RoleProfile(role="idle-owner", name="Nuriddin aka")
        leader = RoleProfile(role="leader", name="Davron Karimov")              # Verifix's namesake
        gone = RoleProfile(role="idle-owner", name="Davron Qo'ldimurodov", ended_on=_d(2026, 1, 1))
        self.db.add_all([n, leader, gone])
        self.db.flush()
        nk = f"idle-owner:{n.id}"
        self.db.add_all([
            ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"),
            ProfilePermission(profile_key=nk, capability="page.view.container-watch", mode="grant", scope="all"),
            ProfilePermission(profile_key=nk, capability="page.view.downtime", mode="grant", scope="all"),
        ])
        self.db.commit()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.davron_container_logistics()                     # no live profile yet: nothing
            self.assertEqual([p["name"] for p in flow.logistics_people(self.db)], ["Nuriddin aka"])
            d = RoleProfile(role="shift-manager", name="Davron Kuldimirodov", name_ru="Даврон Кулдимуродов")
            self.db.add(d)
            self.db.commit()
            startup.davron_container_logistics()
            startup.davron_container_logistics()                     # the flag: once
        self.db.expire_all()
        self.assertEqual([p["name"] for p in flow.logistics_people(self.db)],
                         ["Davron Kuldimirodov", "Nuriddin aka"])
        self.assertEqual(sorted(capabilities.perms_for_profile(self.db, f"shift-manager:{d.id}")),
                         ["page.view.container-logistics", "page.view.container-watch"])
        self.assertEqual(dm.call_count, 2)                           # the miss, then the grant

    def test_alisher_gets_nuriddins_container_access(self):
        """20 Nov: Maksudov Alisher — a brigadir, so his profile is his UNIT
        (`supervisor:<managers.id>`) — gets Nuriddin aka's container grants;
        another Alisher and Verifix's leader twin aside; once, and nothing
        while no unit or profile carries both names."""
        from app import capabilities, startup
        from app.models import Manager, ProfilePermission, RoleProfile
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        self.db.execute(flow.text("DELETE FROM app_settings WHERE key = :k"), {"k": startup.ALISHER_LOGISTICS_FLAG})
        self.db.execute(flow.text("DELETE FROM role_profiles WHERE name LIKE '%Alisher%'"))
        self.db.execute(flow.text("DELETE FROM managers WHERE id IN (7101, 7102)"))
        n = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add_all([n, Manager(id=7101, name="Karimov Alisher", shift=2)])      # a namesake unit
        self.db.flush()
        nk = f"idle-owner:{n.id}"
        self.db.add_all([
            ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"),
            ProfilePermission(profile_key=nk, capability="page.view.container-watch", mode="grant", scope="all"),
            ProfilePermission(profile_key=nk, capability="page.view.downtime", mode="grant", scope="all"),
        ])
        self.db.commit()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.alisher_container_logistics()                    # no «Maksudov Alisher» yet: nothing
            self.assertEqual([p["name"] for p in flow.logistics_people(self.db)], ["Nuriddin aka"])
            self.db.add_all([Manager(id=7102, name="Максудов Алишер", shift=2),
                             RoleProfile(role="leader", name="Maqsudov Alisher")])   # Verifix's leader twin
            self.db.commit()
            startup.alisher_container_logistics()
            startup.alisher_container_logistics()                    # the flag: once
        self.db.expire_all()
        self.assertEqual([p["key"] for p in flow.logistics_people(self.db)], [nk, "supervisor:7102"])
        self.assertEqual(sorted(capabilities.perms_for_profile(self.db, "supervisor:7102")),
                         ["page.view.container-logistics", "page.view.container-watch"])
        self.assertEqual(capabilities.perms_for_profile(self.db, "supervisor:7101"), {})
        self.assertEqual(dm.call_count, 2)                           # the miss, then the grant

    def test_asqar_gets_alishers_containers_and_no_idle_time(self):
        """22 Nov: Karimov Asqar's profile takes Maksudov Alisher's container
        grants AS THEY STAND (the board included), loses /downtime and
        /idle-cell and lets go of the causes he answered for — Abdukarimov
        Asqar and Verifix's leader twin aside; once, nothing while none is found."""
        from app import capabilities, startup
        from app.models import Manager, ProfilePermission, RoleProfile
        from app.services import idle_scope
        for sql in ("DELETE FROM profile_permissions", "DELETE FROM idle_category_owners",
                    "DELETE FROM role_profiles WHERE name LIKE '%Alisher%' OR name LIKE '%Asqar%' "
                    "OR name LIKE '%Askar%' OR name LIKE 'Nuriddin%'",
                    "DELETE FROM managers WHERE id IN (7101, 7102, 7103)"):
            self.db.execute(flow.text(sql))
        self.db.execute(flow.text("DELETE FROM app_settings WHERE key = :k"), {"k": startup.ASQAR_FLAG})
        n = RoleProfile(role="idle-owner", name="Nuriddin aka")
        other = RoleProfile(role="idle-owner", name="Abdukarimov Asqar")          # folds apart: «abdukarimov»
        self.db.add_all([n, other, Manager(id=7102, name="Максудов Алишер", shift=2)])
        self.db.flush()
        nk, ak, ok = f"idle-owner:{n.id}", "supervisor:7102", f"idle-owner:{other.id}"
        for key, caps in ((nk, [flow.LOGISTICS_CAP, "page.view.container-watch"]),
                          (ak, [flow.LOGISTICS_CAP, "page.view.containers", "page.view.container-watch"])):
            for cap in caps:
                self.db.add(ProfilePermission(profile_key=key, capability=cap, mode="grant", scope="all"))
        self.db.add(ProfilePermission(profile_key=ak, capability="page.view.downtime", mode="grant", scope="all"))
        self.db.commit()
        cats = list(idle_scope.CATEGORIES)
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.asqar_containers_no_idle()                       # no «Karimov Asqar» yet: nothing
            self.assertEqual(capabilities.perms_for_profile(self.db, ok), {})
            q = RoleProfile(role="idle-owner", name="Karimov Asqar", name_ru="Каримов Асқар")
            twin = RoleProfile(role="leader", name="Karimov Askar")                  # Verifix's leader twin
            self.db.add_all([q, twin])
            self.db.commit()
            qk = f"idle-owner:{q.id}"
            idle_scope.set_owner(self.db, cats[0], qk)
            idle_scope.set_owner(self.db, cats[1], ok)
            self.db.commit()
            startup.asqar_containers_no_idle()
            startup.asqar_containers_no_idle()                       # the flag: once
        self.db.expire_all()
        got = capabilities.perms_for_profile(self.db, qk)
        self.assertEqual(sorted(k for k, v in got.items() if v["mode"] == "grant"),
                         [flow.LOGISTICS_CAP, "page.view.container-watch", "page.view.containers"])
        self.assertEqual(capabilities.denied_pages_for_profile(self.db, qk), {"downtime", "idle-cell"})
        self.assertIn(qk, [p["key"] for p in flow.logistics_people(self.db)])
        self.assertEqual(idle_scope.categories_of(self.db, qk), [])
        self.assertEqual(idle_scope.owners(self.db), {cats[1]: ok})             # nobody else's touched
        self.assertEqual(capabilities.perms_for_profile(self.db, f"leader:{twin.id}"), {})
        self.assertEqual(capabilities.perms_for_profile(self.db, ok), {})
        self.assertEqual(dm.call_count, 2)                           # the miss, then the change

    def test_davron_loses_idle_time_keeps_containers(self):
        """18 Nov: Davron's profile is denied /downtime and /idle-cell and lets
        go of the ojidaniya categories he answered for; logistics stays; once."""
        from app import capabilities, startup
        from app.models import ProfilePermission, RoleProfile
        from app.services import idle_scope
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        self.db.execute(flow.text("DELETE FROM idle_category_owners"))
        self.db.execute(flow.text("DELETE FROM role_profiles WHERE name LIKE 'Davron%'"))
        self.db.execute(flow.text("DELETE FROM app_settings WHERE key = :k"), {"k": startup.DAVRON_NO_IDLE_FLAG})
        d = RoleProfile(role="idle-owner", name="Davron Kuldimirodov")
        other = RoleProfile(role="idle-owner", name="Someone Else")
        self.db.add_all([d, other])
        self.db.flush()
        dk, ok = f"idle-owner:{d.id}", f"idle-owner:{other.id}"
        self.db.add(ProfilePermission(profile_key=dk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        cats = list(idle_scope.CATEGORIES)
        idle_scope.set_owner(self.db, cats[0], dk)
        idle_scope.set_owner(self.db, cats[1], ok)
        self.db.commit()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.davron_no_idle_time()
            startup.davron_no_idle_time()                            # the flag: once
        self.db.expire_all()
        self.assertEqual(capabilities.denied_pages_for_profile(self.db, dk), {"downtime", "idle-cell"})
        self.assertEqual(idle_scope.categories_of(self.db, dk), [])
        self.assertEqual(idle_scope.owners(self.db), {cats[1]: ok})     # nobody else's touched
        self.assertIn(dk, {p["key"] for p in flow.logistics_people(self.db)})
        self.assertEqual(capabilities.denied_pages_for_profile(self.db, ok), set())
        self.assertEqual(dm.call_count, 1)

    def test_receive_oneshot_opens_to_brigadirs_once(self):
        from app import startup
        from app.permissions import get_page_access, set_page_access

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)["container-receive"]
            finally:
                s.close()

        s = self.pg.Session()
        m = get_page_access(s)
        m["container-receive"] = []
        set_page_access(s, m)
        s.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_receive_brigadirs()
            self.db.expire_all()
            self.assertEqual(access(), ["supervisor"])
            self.assertTrue(flow.settings(self.db)["notify_brigadirs"])
            flow.save_settings(self.db, None, False)
            startup.container_receive_brigadirs()
            self.db.expire_all()
            self.assertFalse(flow.settings(self.db)["notify_brigadirs"])   # an «off» sticks
            self.assertEqual(dm.call_count, 1)

    def test_managers_alerts_oneshot_switches_on_once(self):
        from app import startup
        from app.models import RoleProfile
        self.assertFalse(flow.settings(self.db)["notify_managers"])     # shipped off
        n = self.db.query(RoleProfile).filter(RoleProfile.role == "shift-manager").count()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_flow_managers_alerts_on()
            self.db.expire_all()
            cfg = flow.settings(self.db)
            self.assertTrue(cfg["notify_managers"])
            # the other three switches are where they were
            self.assertEqual((cfg["notify"], cfg["notify_brigadirs"], cfg["notify_axo"]), (False, False, True))
            self.assertIn(f"{n} ta smena menejeri", dm.call_args[0][0])
            flow.save_settings(self.db, notify_managers=False)
            startup.container_flow_managers_alerts_on()
            self.db.expire_all()
            self.assertFalse(flow.settings(self.db)["notify_managers"])   # an «off» sticks
            self.assertEqual(dm.call_count, 1)

    def test_who_sees_what_oneshot(self):
        """21 Nov: «Konteynerlar» to the AXO and logistics PROFILES, the shift
        managers' alerts off — once; a grant taken back or a switch turned on
        later sticks."""
        from app import capabilities, startup
        from app.models import ProfilePermission, RoleProfile
        from app.permissions import get_page_access, set_page_access
        lg = RoleProfile(role="idle-owner", name="Nuriddin aka")
        ax = RoleProfile(role="guest", name="Fozilova Dilafruz")
        other = RoleProfile(role="idle-owner", name="Somebody Else")
        self.db.add_all([lg, ax, other]); self.db.commit()
        ids = [lg.id, ax.id, other.id]
        lk, ak, ok_ = f"idle-owner:{lg.id}", f"guest:{ax.id}", f"idle-owner:{other.id}"

        def clean():
            s = self.pg.Session()
            try:
                s.query(ProfilePermission).filter(ProfilePermission.profile_key.in_([lk, ak, ok_])).delete(synchronize_session=False)
                s.query(RoleProfile).filter(RoleProfile.id.in_(ids)).delete(synchronize_session=False)
                s.commit()
            finally:
                s.close()
        self.addCleanup(clean)
        capabilities.apply_profile_perms(self.db, [lk], grants={"page.view.container-logistics": "all"})
        capabilities.apply_profile_perms(self.db, [ak], grants={"page.view.container-flow": "all"})
        flow.save_settings(self.db, notify_managers=True)
        m = get_page_access(self.db); m["containers"] = ["top-manager"]; set_page_access(self.db, m)
        self.db.commit()

        def board(key):
            s = self.pg.Session()
            try:
                return [r.mode for r in s.query(ProfilePermission).filter_by(
                    profile_key=key, capability="page.view.containers").all()]
            finally:
                s.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.containers_who_sees_what()
            self.db.expire_all()
            self.assertEqual((board(lk), board(ak), board(ok_)), (["grant"], ["grant"], []))
            cfg = flow.settings(self.db)
            self.assertFalse(cfg["notify_managers"])
            self.assertTrue(cfg["notify_axo"])                          # AXO's own alerts stay
            self.assertIn("shift-manager", get_page_access(self.db)["containers"])
            text = dm.call_args[0][0]
            self.assertIn("Nuriddin aka", text)
            self.assertIn("Fozilova Dilafruz", text)
            # their own page each is untouched
            self.assertEqual([r.capability for r in self.db.query(ProfilePermission).filter_by(profile_key=lk)
                              .order_by(ProfilePermission.capability)],
                             ["page.view.container-logistics", "page.view.containers"])
            # later: an admin takes the board back and switches the alerts on — both stick
            capabilities.apply_profile_perms(self.db, [lk], revokes=["page.view.containers"])
            flow.save_settings(self.db, notify_managers=True)
            self.db.commit()
            startup.containers_who_sees_what()
            self.db.expire_all()
            self.assertEqual(board(lk), [])
            self.assertTrue(flow.settings(self.db)["notify_managers"])
            self.assertEqual(dm.call_count, 1)

    def test_watch_off_for_shift_managers_once(self):
        """21 Nov: the shift managers leave «Konteyner berish» (the watch key)
        and keep the board; a tick put back later sticks."""
        from app import startup
        from app.permissions import get_page_access, set_page_access
        m = get_page_access(self.db)
        m["container-watch"] = ["top-manager", "shift-manager"]
        m["containers"] = ["top-manager", "shift-manager"]
        set_page_access(self.db, m)

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)
            finally:
                s.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_watch_shift_managers_off()
            self.assertEqual(access()["container-watch"], ["top-manager"])
            self.assertEqual(access()["containers"], ["top-manager", "shift-manager"])
            s = self.pg.Session()
            m = get_page_access(s); m["container-watch"] = ["top-manager", "shift-manager"]; set_page_access(s, m); s.close()
            startup.container_watch_shift_managers_off()
            self.assertEqual(access()["container-watch"], ["top-manager", "shift-manager"])   # a re-tick sticks
            self.assertEqual(dm.call_count, 1)

    def test_extra_oneshot_opens_to_brigadirs_once(self):
        from app import startup
        from app.permissions import get_page_access, set_page_access

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)["container-extra"]
            finally:
                s.close()

        s = self.pg.Session()
        m = get_page_access(s)
        m["container-extra"] = []                         # as production's stored matrix has it
        set_page_access(s, m)
        s.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_extra_brigadirs()
            self.assertEqual(access(), ["supervisor"])
            s = self.pg.Session()
            m = get_page_access(s)
            m["container-extra"] = []                     # an admin unticks it later …
            set_page_access(s, m)
            s.close()
            startup.container_extra_brigadirs()
            self.assertEqual(access(), [])                # … and it stays unticked
            self.assertEqual(dm.call_count, 1)

    def test_extra_closed_to_brigadirs_again_once(self):
        """Opened in the morning, closed the same afternoon: on a fresh
        database both one-shots run in order and it ends closed; a reopen on
        the Access tab later sticks."""
        from app import startup
        from app.permissions import get_page_access, set_page_access

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)["container-extra"]
            finally:
                s.close()

        s = self.pg.Session()
        m = get_page_access(s)
        m["container-extra"] = ["supervisor"]             # as production's stored matrix has it now
        set_page_access(s, m)
        s.close()
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.container_extra_brigadirs()             # its flag may be set already — either way …
            startup.container_extra_brigadirs_off()
            self.assertEqual(access(), [])                  # … it ends closed
            s = self.pg.Session()
            m = get_page_access(s)
            m["container-extra"] = ["supervisor"]           # the operator reopens it on the Access tab …
            set_page_access(s, m)
            s.close()
            startup.container_extra_brigadirs_off()
            self.assertEqual(access(), ["supervisor"])      # … and it stays open
            self.assertIn("yopildi", dm.call_args_list[-1][0][0])

    def test_split_hint_follows_each_units_hour(self):
        from app.models import ContainerRequest
        for i, n in ((12, "Bravo"), (13, "Alfa")):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=n, shift=1))
        self.db.commit()
        per = {12: {10: {"yellow": 18, "bucket": 4}}, 13: {10: {"yellow": 12}, 11: {"grey": 5}}}
        r = ContainerRequest(day=DAY, hour=10, lines={"yellow": 20, "bucket": 6, "grey": 3},
                             logistics_key="x", status="requested", due_at=self.at(9))
        with mock.patch.object(flow, "units_hours", return_value=per):
            rows = flow.split_hint(self.db, r)
        # sorted by name; yellow 20 shared 8:12 by the limits 12:18; bucket only up to
        # Bravo's limit of 4 (never past it — the rest stays unsplit); grey is nobody's at 10:00
        self.assertEqual([(x["unit"], x["counts"]) for x in rows],
                         [("Alfa", {"yellow": 8}), ("Bravo", {"yellow": 12, "bucket": 4})])
        self.assertEqual(rows[1]["need"], {"yellow": 18, "bucket": 4})

    def test_a_brigadir_never_gets_past_the_limit(self):
        """The limit is the unit's «Konteynerlar» figure for the hour, less
        what other splits of that hour already gave it; past it a split is
        refused, and the hint never offers more."""
        from app.models import ProfilePermission, RoleProfile
        for t in ("container_request_parts", "container_requests", "profile_permissions"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        for i in (1, 2, 3):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        self.hours = {1: {10: {"yellow": 18}}, 2: {10: {"yellow": 6, "bucket": 4}}}
        r1 = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30}, "", "axo", "guest:1")
        self.db.commit()
        # the hint: both whole (18 + 6 = 24), 6 of the 30 asked stay unsplit
        self.assertEqual({x["manager_id"]: x["counts"] for x in flow.split_hint(self.db, r1)},
                         {1: {"yellow": 18}, 2: {"yellow": 6}})
        with self.assertRaises(flow.FlowError) as e:                       # 19 > unit 1's 18
            flow.assign_request(self.db, r1.id, [{"manager_id": 1, "counts": {"yellow": 19}}],
                                "short", None, "n", nk, False)
        self.assertEqual(e.exception.code, "limit")
        self.db.rollback()
        flow.assign_request(self.db, r1.id, [{"manager_id": 1, "counts": {"yellow": 10}}],
                            "short", None, "n", nk, False)
        self.db.commit()
        # a second request for the same hour: unit 1 has 8 left, unit 2 all 6
        r2 = flow.create_request(self.db, DAY, 10, nk, {"yellow": 20, "bucket": 2}, "", "axo", "guest:1")
        self.db.commit()
        lim = flow.unit_limits(self.db, DAY, 10, r2.id)
        self.assertEqual((lim[1]["given"], lim[1]["left"]), ({"yellow": 10}, {"yellow": 8}))
        self.assertEqual(lim[2]["left"], {"yellow": 6, "bucket": 4})
        with self.assertRaises(flow.FlowError) as e:
            flow.assign_request(self.db, r2.id, [{"manager_id": 1, "counts": {"yellow": 5}},
                                                 {"manager_id": 1, "counts": {"yellow": 4}}],
                                "short", None, "n", nk, False)        # two rows of one unit: 9 > 8
        self.assertEqual(e.exception.code, "limit")
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as e:                       # a unit with no figure: 0
            flow.assign_request(self.db, r2.id, [{"manager_id": 3, "counts": {"yellow": 1}}],
                                "short", None, "n", nk, False)
        self.assertEqual(e.exception.code, "limit")
        self.db.rollback()
        flow.assign_request(self.db, r2.id, [{"manager_id": 1, "counts": {"yellow": 8}},
                                             {"manager_id": 2, "counts": {"yellow": 6, "bucket": 2}}],
                            "short", None, "n", nk, False)
        self.db.commit()
        # a cancelled split gives its containers back to the limit
        r3 = flow.create_request(self.db, DAY, 10, nk, {"yellow": 1}, "", "axo", "guest:1")
        self.db.commit()
        self.assertEqual(flow.unit_limits(self.db, DAY, 10, r3.id)[1]["left"], {"yellow": 0})
        flow.cancel_request(self.db, r1.id, "xato", "axo")
        self.db.commit()
        self.assertEqual(flow.unit_limits(self.db, DAY, 10, r3.id)[1]["left"], {"yellow": 10})

    def _logistics(self):
        from app.models import ProfilePermission, RoleProfile
        for t in ("container_request_parts", "container_requests", "profile_permissions"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        for i in (1, 2, 3):
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        return nk

    def test_the_limit_carries_over_and_never_passes_the_day(self):
        """An hour that got nothing is not lost: its need can go with a later
        hour's request — and a later split that used it is counted, so an
        earlier hour's request cannot take it twice."""
        nk = self._logistics()
        self.hours = {1: {9: {"yellow": 10}, 10: {"yellow": 10}, 11: {"yellow": 10}}}
        lim = flow.unit_limits(self.db, DAY, 10)[1]
        self.assertEqual((lim["limit"], lim["left"]), ({"yellow": 20}, {"yellow": 20}))   # 09:00 carried
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 20}, "", "axo", "guest:1")
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 20}}], None, None, "n", nk, False)
        self.db.commit()
        self.assertEqual(flow.unit_limits(self.db, DAY, 9)[1]["left"], {"yellow": 0})     # not twice
        self.assertEqual(flow.unit_limits(self.db, DAY, 11)[1]["left"], {"yellow": 10})   # 11:00's own
        late = flow.create_request(self.db, DAY, 9, nk, {"yellow": 5}, "", "axo", "guest:1")
        with self.assertRaises(flow.FlowError) as e:
            flow.assign_request(self.db, late.id, [{"manager_id": 1, "counts": {"yellow": 1}}],
                                "short", None, "n", nk, False)
        self.assertEqual(e.exception.code, "limit")
        self.db.rollback()

    def test_prepared_hours_and_sending_them_in_one_go(self):
        nk = self._logistics()
        self.hours = {1: {9: {"yellow": 10}, 10: {"yellow": 12, "bucket": 3}, 11: {"yellow": 8}},
                      2: {10: {"yellow": 6}}}
        flow._hours_cache.clear()
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 10}, "", "axo", "guest:1")
        self.db.commit()
        got = flow.prepared(self.db, DAY, self.at(10, 5))        # 09:00 is over; 10:00 was partly asked
        self.assertEqual([(x["hour"], x["counts"]) for x in got],
                         [(10, {"yellow": 8, "bucket": 3}), (11, {"yellow": 8})])
        self.assertTrue(got[0]["late"])
        with self.assertRaises(flow.FlowError):                  # one hour twice: all refused
            flow.create_requests(self.db, DAY, nk, [{"hour": 11, "counts": {"yellow": 8}},
                                                     {"hour": 11, "counts": {"yellow": 1}}], "", "axo", "guest:1")
        self.db.rollback()
        rs = flow.create_requests(self.db, DAY, nk, [{"hour": x["hour"], "counts": x["counts"]} for x in got],
                                  "", "axo", "guest:1")
        self.db.commit()
        self.assertEqual([x.hour for x in rs], [10, 11])
        self.assertEqual(flow.prepared(self.db, DAY, self.at(10, 6)), [])       # nothing left to ask
        self.assertEqual(r.status, "requested")

    def test_short_split_names_dispatch_and_silent_brigadir_escalates(self):
        """2026-11-20: AXO's «Kam taqsimlandi» counts what went to dispatch, and
        a brigadir who got NO reminder (the brigadirs' switch off) is still
        escalated, from the moment the reminder was due."""
        from app.models import RoleProfile
        from app.routers import staff
        nk = self._logistics()
        self.db.add(RoleProfile(role="shift-manager", name="SM Two"))
        self.db.commit()
        sent = []
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=lambda db, key, nkey, params, **kw:
                               sent.append((key, nkey, params))):
            r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30, "send": 100}, "", "axo", "guest:7")
            self.db.commit()
            with mock.patch.object(flow, "now", return_value=self.at(9, 20)):
                flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 24}}],
                                    "short", None, "n", nk, False, dispatch={"send": 100})
            self.db.commit()
            self.assertEqual(flow.alert_short_split(r.id), 1)
            self.assertEqual(sent[-1][2]["counts"], flow.counts_text({"yellow": 24, "send": 100}))
            flow.save_settings(self.db, None, False, None, True)        # no reminders; managers on
            self.db.commit()
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(10, 1)), 0)
            self.assertEqual(flow.escalate_unconfirmed(self.db, self.at(10, 20)), 0)   # due 10:00 — too early
            self.assertGreaterEqual(flow.escalate_unconfirmed(self.db, self.at(10, 40)), 1)
            self.assertEqual(sent[-1][1], "container_unconfirmed")
            self.assertEqual(flow.escalate_unconfirmed(self.db, self.at(10, 45)), 0)   # once

    def test_alerts_to_axo_and_the_shift_managers(self):
        from app.models import RoleProfile
        from app.routers import staff
        nk = self._logistics()
        self.db.add(RoleProfile(role="shift-manager", name="SM One"))
        self.db.commit()
        cfg = flow.settings(self.db)
        self.assertEqual((cfg["notify_axo"], cfg["notify_managers"]), (True, False))   # AXO on, managers off
        sent = []
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=lambda db, key, nkey, params, **kw:
                               sent.append((key, nkey, kw["html_fn"]("uz")))):
            with mock.patch.object(flow, "now", return_value=self.at(8)):
                r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30}, "", "axo", "guest:7")
            self.db.commit()                                        # due 09:00
            self.assertEqual(flow.alert_overdue(self.db, self.at(8, 59)), 0)
            self.assertEqual(flow.alert_overdue(self.db, self.at(9, 5)), 1)       # AXO only: managers are off
            self.assertEqual(sent[-1][:2], ("guest:7", "container_request_overdue"))
            self.assertEqual(flow.alert_overdue(self.db, self.at(9, 10)), 0)      # once
            # a short split and a short receipt go to the author
            with mock.patch.object(flow, "now", return_value=self.at(9, 20)):
                flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 24}}],
                                    "damaged", None, "n", nk, False)
            self.db.commit()
            self.assertEqual(flow.alert_short_split(r.id), 1)
            self.assertIn("Shikastlangan", sent[-1][2])
            self.assertEqual(flow.alert_short_receipt(r.id, 1), 0)             # nothing confirmed yet
            # the escalation: reminded at 10:00, still silent 30 min later — managers only when on
            flow.save_settings(self.db, None, True)
            self.db.add(__import__("app.models", fromlist=["ProfilePermission"]).ProfilePermission(
                profile_key="supervisor:1", capability=flow.RECEIVE_CAP, mode="grant", scope="all"))
            self.db.commit()
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(10, 1)), 1)
            self.assertEqual(flow.escalate_unconfirmed(self.db, self.at(10, 40)), 0)   # switch off
            flow.save_settings(self.db, None, None, None, True)
            self.assertEqual(flow.escalate_unconfirmed(self.db, self.at(10, 20)), 0)   # too early
            n = flow.escalate_unconfirmed(self.db, self.at(10, 40))
            self.assertGreaterEqual(n, 1)
            self.assertEqual(sent[-1][1], "container_unconfirmed")
            self.assertTrue(sent[-1][0].startswith("shift-manager:"))
            self.assertEqual(flow.escalate_unconfirmed(self.db, self.at(10, 45)), 0)   # once
            flow.receive(self.db, r.id, 1, {"yellow": 20}, "short", None, "b")
            self.db.commit()
            self.assertEqual(flow.alert_short_receipt(r.id, 1), 1)
            self.assertEqual(sent[-1][:2], ("guest:7", "container_short_receipt"))

    def test_notify_switch_and_message(self):
        from app.models import ContainerRequest
        self.assertFalse(flow.settings(self.db)["notify"])            # off by default
        flow.save_settings(self.db, True)
        self.assertTrue(flow.settings(self.db)["notify"])
        flow.save_settings(self.db)                                    # an older tab keeps it
        self.assertTrue(flow.settings(self.db)["notify"])
        r = ContainerRequest(day=DAY, hour=20, lines={"yellow": 30, "bucket": 8}, note="tez",
                             logistics_key="x", status="requested", due_at=self.at(19),
                             created_by="Fozilova Dilafruz")
        body = flow._tg_body(r, "new", "uz")
        for bit in ("20:00–21:00", "To'rtburchak 30, Chelak 8", "19:00", "Fozilova Dilafruz", "tez"):
            self.assertIn(bit, body)
        self.assertIn("Прямоугольный 30", flow._tg_body(r, "new", "ru"))

    def test_request_to_logistics_split_across_brigadirs(self):
        from app.models import ProfilePermission, RoleProfile
        self.db.execute(flow.text("DELETE FROM container_request_parts"))
        self.db.execute(flow.text("DELETE FROM container_requests"))
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        if self.db.get(Manager, 2) is None:
            self.db.add(Manager(id=2, name="Unit Two", shift=1))
        p = RoleProfile(role="idle-owner", name="Nuriddin aka")
        self.db.add(p)
        self.db.flush()
        nk = f"idle-owner:{p.id}"
        self.db.add(ProfilePermission(profile_key=nk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        self.assertEqual(flow.logistics_people(self.db), [{"key": nk, "name": "Nuriddin aka"}])
        with self.assertRaises(flow.FlowError) as e:                       # only a logistics person
            flow.create_request(self.db, DAY, 10, "guest:99", {"yellow": 40}, "", "axo", "guest:1")
        self.assertEqual(e.exception.code, "logistics")
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 40, "bucket": 12, "grey": 0}, "tez", "axo", "guest:1")
        self.db.commit()
        self.assertEqual((r.lines, r.status, r.logistics_name), ({"yellow": 40, "bucket": 12}, "requested", "Nuriddin aka"))
        self.assertIsNone(flow.requests_of(self.db, DAY, nk)[0]["seen_at"])     # new to him
        self.assertFalse(flow.mark_seen(self.db, r.id, "guest:1"))             # AXO opening it clears nothing
        self.assertFalse(flow.mark_seen(self.db, r.id, None))
        self.assertTrue(flow.mark_seen(self.db, r.id, nk))                     # he opened it
        first = r.seen_at
        self.assertFalse(flow.mark_seen(self.db, r.id, nk))                    # the first open stays
        self.assertEqual(r.seen_at, first)
        self.db.commit()
        self.assertIsNotNone(flow.requests_of(self.db, DAY, nk)[0]["seen_at"])
        with self.assertRaises(flow.FlowError) as e:                       # somebody else's request
            flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 40}}], None, None, "x", "idle-owner:0", False)
        self.assertEqual(e.exception.code, "not_yours")
        with self.assertRaises(flow.FlowError) as e:                       # more than asked
            flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 30}},
                                                {"manager_id": 2, "counts": {"yellow": 20}}], None, None, "n", nk, False)
        self.assertEqual(e.exception.code, "over")
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as e:                       # fewer needs a reason
            flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 20}}], None, None, "n", nk, False)
        self.assertEqual(e.exception.code, "reason")
        self.db.rollback()
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 20, "bucket": 12}},
                                            {"manager_id": 2, "counts": {"yellow": 20}}], None, None, "n", nk, False)
        self.db.commit()
        got = flow.requests_of(self.db, DAY, nk)[0]
        self.assertEqual(got["status"], "assigned")
        self.assertEqual({p["manager_id"]: p["counts"] for p in got["parts"]},
                         {1: {"yellow": 20, "bucket": 12}, 2: {"yellow": 20}})
        self.assertEqual(flow.requests_of(self.db, DAY, "idle-owner:0"), [])   # not addressed to them
        r2 = flow.create_request(self.db, DAY, 11, nk, {"box": 3}, "", "axo", "guest:1")
        with self.assertRaises(flow.FlowError):
            flow.cancel_request(self.db, r2.id, " ", "axo")
        flow.cancel_request(self.db, r2.id, "kerak emas", "axo")
        self.assertEqual(r2.status, "cancelled")
        # a brigadir's receipt: only on a split request, once, never over, fewer with a reason
        self.db.commit()
        with self.assertRaises(flow.FlowError) as e:
            flow.receive(self.db, r2.id, 1, None, None, None, "b")          # cancelled
        self.assertEqual(e.exception.code, "state")
        with self.assertRaises(flow.FlowError) as e:
            flow.receive(self.db, r.id, 3, None, None, None, "b")           # not one of its units
        self.assertEqual(e.exception.code, "unit")
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as e:
            flow.receive(self.db, r.id, 1, {"yellow": 21}, None, None, "b")
        self.assertEqual(e.exception.code, "over")
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as e:
            flow.receive(self.db, r.id, 1, {"yellow": 18}, None, None, "b")
        self.assertEqual(e.exception.code, "reason")
        self.db.rollback()
        flow.receive(self.db, r.id, 1, {"yellow": 18}, "damaged", None, "Brigadir One")
        self.db.commit()
        with self.assertRaises(flow.FlowError):
            flow.receive(self.db, r.id, 1, None, None, None, "b")           # once
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as e:                       # containers reached a line:
            flow.cancel_request(self.db, r.id, "x", "axo")                 # no cancel any more
        self.assertEqual(e.exception.code, "received")
        self.db.rollback()
        got = flow.requests_of(self.db, DAY)
        one = next(x for x in got if x["id"] == r.id)
        self.assertEqual(one["receipt"], {"units": 2, "confirmed": 1, "short": True})
        mine = flow.receipts_of(self.db, DAY, 1)
        self.assertEqual([(x["request_id"], x["received"], x["received_reason"]) for x in mine],
                         [(r.id, {"yellow": 18, "bucket": 12}, "damaged")])
        flow.receive(self.db, r.id, 2, None, None, None, "Brigadir Two")
        self.db.commit()
        self.assertEqual(len(flow.receipts_of(self.db, DAY)), 2)
        # the report: one split in full, one cancelled; 52 asked and given, 50 received
        rep = flow.requests_report(self.db, DAY, DAY)
        sm = rep["summary"]
        self.assertEqual((sm["requests"], sm["cancelled"], sm["assigned"], sm["short"]), (2, 1, 1, 0))
        self.assertEqual((sm["asked"], sm["given"], sm["received"], sm["missing"]), (52, 52, 50, 2))
        self.assertEqual((sm["units"], sm["confirmed"]), (2, 2))
        self.assertEqual(rep["reasons"]["short"], 0)
        self.assertEqual(rep["days"][0]["requests"], 2)
        self.assertEqual(rep["people"][0]["name"], "Nuriddin aka")
        # «Tahlil»: the same period per hour, type and brigadir; its summary IS the report's
        an = flow.analytics(self.db, DAY, DAY)
        self.assertEqual({k: an["summary"][k] for k in sm}, sm)
        self.assertEqual([(h["hour"], h["requests"], h["asked"], h["given"]) for h in an["hours"]], [(10, 1, 52, 52)])
        self.assertEqual({x["ctype"]: (x["asked"], x["given"], x["received"]) for x in an["types"]},
                         {"yellow": (40, 40, 38), "bucket": (12, 12, 12)})
        by = {u["manager_id"]: u for u in an["units"]}
        self.assertEqual((by[1]["given"], by[1]["received"], by[1]["missing"], by[1]["confirm_pct"]), (32, 30, 2, 100))
        self.assertEqual((by[2]["given"], by[2]["received"], by[2]["missing"]), (20, 20, 0))
        self.assertEqual(an["receipt_reasons"]["damaged"], 1)
        self.assertEqual((an["days"][0]["assigned"], an["days"][0]["on_time_pct"]), (1, 100))
        self.assertEqual((an["summary"]["confirm_pct"], an["summary"]["received_pct"]), (100, 96))
        self.db.query(ProfilePermission).filter_by(profile_key=nk).update({"mode": "deny"})
        self.db.commit()
        self.assertEqual(flow.logistics_people(self.db), [])                 # a deny takes them off the list

    # ── AXO edits a waiting request ──
    def test_axo_edits_a_waiting_request(self):
        from app.models import ProfilePermission, RoleProfile
        from app.routers import staff
        nk = self._logistics()
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 30}, "tez", "Dilafruz", "guest:1")
        r.created_at = self.at(6)
        r.due_at = self.at(9)
        self.db.commit()
        flow.mark_seen(self.db, r.id, nk)
        self.db.commit()
        # nothing changed: nothing to tell
        _r, changes, _old = flow.edit_request(self.db, r.id, 10, nk, {"yellow": 30}, " tez ")
        self.assertEqual(changes, [])
        # the counts, the hour and the note: «new» again for its logistics person, a deadline from the new hour
        with mock.patch.object(flow, "now", return_value=self.at(6, 30)):
            r, changes, old = flow.edit_request(self.db, r.id, 11, nk, {"yellow": 24, "grey": 3}, "")
        self.db.commit()
        self.assertEqual([c[0] for c in changes], ["hour", "counts", "note"])
        self.assertEqual((r.hour, r.lines, r.note, r.seen_at, r.due_at, old), (11, {"yellow": 24, "grey": 3}, None, None, self.at(10), nk))
        # to everybody instead
        y = RoleProfile(role="idle-owner", name="Third Logist")
        self.db.add(y)
        self.db.flush()
        yk = f"idle-owner:{y.id}"
        self.db.add(ProfilePermission(profile_key=yk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        r, changes, old = flow.edit_request(self.db, r.id, 11, flow.ALL_KEY, {"yellow": 24, "grey": 3}, "")
        self.db.commit()
        self.assertEqual((changes, old, r.logistics_name), ([("to", "Nuriddin aka", "*")], nk, None))
        for bad, code in (({"hour": 48}, "hour"), ({"key": "nobody:1"}, "logistics"), ({"counts": {}}, "count")):
            with self.assertRaises(flow.FlowError) as cm:
                flow.edit_request(self.db, r.id, bad.get("hour", 11), bad.get("key", nk), bad.get("counts", {"yellow": 1}), "")
            self.assertEqual(cm.exception.code, code)
            self.db.rollback()
        # who is told: the same people «changed», a new addressee «new», the one it left «moved»
        sent = []

        def capture(db, key, nkey, params, **kw):
            sent.append((key, nkey, kw["html_fn"]("uz")))
            return {len(sent)}
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=capture):
            flow.save_settings(self.db, True)
            self.assertTrue(flow.notify_request(r.id, "edited"))
            self.assertTrue(flow.notify_request(r.id, "moved", [nk]))
        self.assertEqual(sorted((k, n) for k, n, _h in sent),
                         sorted([(nk, "container_request_edited"), (yk, "container_request_edited"),
                                 (nk, "container_request_moved")]))
        self.assertIn("endi siz taqsimlamaysiz", [h for k, n, h in sent if n == "container_request_moved"][0])
        # once split it is the brigadirs' — cancelling stays the tool
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 24, "grey": 3}}],
                            None, None, "Nuriddin aka", nk, False)
        self.db.commit()
        with self.assertRaises(flow.FlowError) as cm:
            flow.edit_request(self.db, r.id, 11, nk, {"yellow": 1}, "")
        self.assertEqual(cm.exception.code, "state")
        self.db.rollback()

    def test_editing_an_approved_extra_keeps_its_hour_and_cap(self):
        nk = self._extras()
        e = self._ask(counts={"yellow": 8, "grey": 2})
        e, x = flow.approve_extra(self.db, e.id, {"yellow": 6}, nk, "", "Dilafruz", "guest:1")
        self.db.commit()
        for kw, code in ((dict(hour=11), "extra_hour"), (dict(counts={"yellow": 9}), "over_ask"),
                         (dict(counts={"bucket": 1}), "over_ask")):
            with self.assertRaises(flow.FlowError) as cm:
                flow.edit_request(self.db, x.id, kw.get("hour", 10), nk, kw.get("counts", {"yellow": 6}), "")
            self.assertEqual(cm.exception.code, code, kw)
            self.db.rollback()
        flow.edit_request(self.db, x.id, 10, nk, {"yellow": 8, "grey": 2}, "")
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(self.db.get(flow.ContainerExtra, e.id).approved, {"yellow": 8, "grey": 2})

    # ── a request to every logistics person ──
    def test_request_to_everybody_goes_to_whoever_splits_it_first(self):
        from app.models import ProfilePermission, RoleProfile
        from app.routers import staff
        nk = self._logistics()
        y = RoleProfile(role="idle-owner", name="Second Logist")
        self.db.add(y)
        self.db.flush()
        yk = f"idle-owner:{y.id}"
        self.db.add(ProfilePermission(profile_key=yk, capability=flow.LOGISTICS_CAP, mode="grant", scope="all"))
        self.db.commit()
        r = flow.create_request(self.db, DAY, 10, flow.ALL_KEY, {"yellow": 30}, "", "Dilafruz", "guest:1")
        self.db.commit()
        self.assertEqual((r.logistics_key, r.logistics_name), (flow.ALL_KEY, None))
        # both see it as theirs
        self.assertEqual([q["id"] for q in flow.requests_of(self.db, DAY, nk)], [r.id])
        self.assertEqual([q["id"] for q in flow.requests_of(self.db, DAY, yk)], [r.id])
        # both are told, once each, and the card says the first to split takes it
        sent = []

        def capture(db, key, nkey, params, **kw):
            sent.append((key, nkey, kw["html_fn"]("uz")))
            return {len(sent)}
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=capture):
            flow.save_settings(self.db, True)
            self.assertTrue(flow.notify_request(r.id, "new"))
        self.assertEqual(sorted(k for k, _n, _h in sent), sorted([nk, yk]))
        self.assertIn("birinchi taqsimlagan oladi", sent[0][2])
        # somebody who is not a logistics person cannot take it
        with self.assertRaises(flow.FlowError) as cm:
            flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 30}}],
                                None, None, "Stranger", "idle-owner:99999", False)
        self.assertEqual(cm.exception.code, "not_yours")
        self.db.rollback()
        # the first opener clears «new» for everybody
        self.assertTrue(flow.mark_seen(self.db, r.id, yk))
        self.db.commit()
        # the second person splits it first: it is theirs from now on
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 30}}],
                            None, None, "Second Logist", yk, False)
        self.db.commit()
        self.db.refresh(r)
        self.assertEqual((r.status, r.logistics_key, r.logistics_name), ("assigned", yk, "Second Logist"))
        # Nuriddin aka, a moment late, finds it taken — and it leaves his list
        with self.assertRaises(flow.FlowError) as cm:
            flow.assign_request(self.db, r.id, [{"manager_id": 2, "counts": {"yellow": 30}}],
                                None, None, "Nuriddin aka", nk, False)
        self.assertEqual(cm.exception.code, "taken")
        self.db.rollback()
        self.assertEqual(flow.requests_of(self.db, DAY, nk), [])
        self.assertEqual([q["id"] for q in flow.requests_of(self.db, DAY, yk)], [r.id])
        # an approved extra can be sent to everybody too
        e = flow.ask_extra(self.db, DAY, 12, 1, {"grey": 4}, "plan", "", "Brig", "supervisor:1", self.at(9))
        _e, x = flow.approve_extra(self.db, e.id, {"grey": 4}, flow.ALL_KEY, "", "Dilafruz", "guest:1")
        self.db.commit()
        self.assertEqual(x.logistics_key, flow.ALL_KEY)

    def test_request_to_everybody_needs_somebody_to_go_to(self):
        self._logistics()
        self.db.execute(flow.text("DELETE FROM profile_permissions"))
        self.db.commit()
        with self.assertRaises(flow.FlowError) as cm:
            flow.create_request(self.db, DAY, 10, flow.ALL_KEY, {"yellow": 30}, "", "Dilafruz", "guest:1")
        self.assertEqual(cm.exception.code, "logistics")
        self.db.rollback()

    # ── a brigadir's extra request ──
    def _extras(self):
        self.db.execute(flow.text("DELETE FROM container_extras"))
        self.db.commit()
        return self._logistics()

    def _ask(self, mid=1, hour=10, counts=None, reason="plan", comment="", at=None):
        e = flow.ask_extra(self.db, DAY, hour, mid, counts or {"yellow": 8}, reason, comment,
                           "Brig One", f"supervisor:{mid}", at or self.at(9))
        self.db.commit()
        return e

    def test_extra_ask_is_checked(self):
        self._extras()
        for kw, code in ((dict(at=self.at(11)), "hour"),                 # the hour is over
                         (dict(hour=48), "hour"), (dict(mid=999), "unit"),
                         (dict(counts={"yellow": 0}), "count"), (dict(counts={"pallet": 3}), "count"),
                         (dict(reason="why"), "reason"), (dict(reason="other", comment=" "), "comment")):
            with self.assertRaises(flow.FlowError, msg=kw) as cm:
                self._ask(**kw)
            self.assertEqual(cm.exception.code, code, kw)
            self.db.rollback()
        e = self._ask(reason="other", comment="  yangi mahsulot ")
        self.assertEqual((e.status, e.lines, e.comment), ("asked", {"yellow": 8}, "yangi mahsulot"))
        with self.assertRaises(flow.FlowError) as cm:                     # one waiting ask per unit and hour
            self._ask(counts={"grey": 2})
        self.assertEqual(cm.exception.code, "extra_dup")
        self.db.rollback()
        self._ask(hour=11)                                                # another hour is another ask

    def test_extra_goes_past_the_limit_to_its_unit_only(self):
        nk = self._extras()
        self.hours[1] = {10: {"yellow": 10}}                              # unit 1 needs 10 at 10:00
        r = flow.create_request(self.db, DAY, 10, nk, {"yellow": 10}, "", "axo", "guest:1")
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"yellow": 10}}], None, None, "n", nk, False)
        self.db.commit()
        self.assertEqual(flow.unit_limits(self.db, DAY, 10)[1]["left"], {"yellow": 0})   # the plan is used up
        e = self._ask(counts={"yellow": 8, "grey": 2})
        with self.assertRaises(flow.FlowError) as cm:                     # never more than was asked
            flow.approve_extra(self.db, e.id, {"yellow": 9}, nk, "", "Dilafruz", "guest:1")
        self.assertEqual(cm.exception.code, "over_ask")
        self.db.rollback()
        with self.assertRaises(flow.FlowError) as cm:                     # a logistics person must be named
            flow.approve_extra(self.db, e.id, {"yellow": 6}, "nobody:1", "", "Dilafruz", "guest:1")
        self.assertEqual(cm.exception.code, "logistics")
        self.db.rollback()
        e, x = flow.approve_extra(self.db, e.id, {"yellow": 6}, nk, " ertaga ko'proq ", "Dilafruz", "guest:1")
        self.db.commit()
        self.assertEqual((e.status, e.approved, e.request_id, e.decision_note), ("approved", {"yellow": 6}, x.id, "ertaga ko'proq"))
        self.assertEqual((x.status, x.lines, x.hour, x.logistics_key), ("requested", {"yellow": 6}, 10, nk))
        with self.assertRaises(flow.FlowError) as cm:                     # answered once
            flow.reject_extra(self.db, e.id, "yo'q", "Dilafruz", "guest:1")
        self.assertEqual(cm.exception.code, "state")
        self.db.rollback()
        row, = flow.extras_of(self.db, DAY, 1)
        self.assertEqual((row["stage"], row["request"]["id"], row["unit"]), ("logistics", x.id, self.db.get(Manager, 1).name))
        listed = {q["id"]: q for q in flow.requests_of(self.db, DAY)}
        self.assertEqual((listed[x.id]["extra"]["manager_id"], listed[r.id]["extra"]), (1, None))
        # the extra is not the hour's own request: «Tayyor so'rovlar» still counts only the plain one
        h10 = next(h for h in flow.prepared(self.db, DAY, self.at(9)) if h["hour"] == 10)
        self.assertEqual(h10["asked"], {"yellow": 10})
        with self.assertRaises(flow.FlowError) as cm:                     # to its own unit only
            flow.assign_request(self.db, x.id, [{"manager_id": 2, "counts": {"yellow": 6}}], None, None, "n", nk, False)
        self.assertEqual(cm.exception.code, "extra_unit")
        self.db.rollback()
        flow.assign_request(self.db, x.id, [{"manager_id": 1, "counts": {"yellow": 6}}], None, None, "n", nk, False)
        self.db.commit()                                                  # past the limit, by what AXO approved
        lim = flow.unit_limits(self.db, DAY, 10)[1]
        self.assertEqual((lim["given"], lim["left"]), ({"yellow": 10}, {"yellow": 0}))    # the plan's room is untouched
        self.assertEqual(flow.extras_of(self.db, DAY)[0]["stage"], "split")
        flow.receive(self.db, x.id, 1, None, None, None, "Brig One")
        self.db.commit()
        row, = flow.extras_of(self.db, DAY)
        self.assertEqual((row["stage"], row["received"]), ("received", {"yellow": 6}))

    def test_extra_rejected_cancelled_and_withdrawn(self):
        nk = self._extras()
        a = self._ask()
        with self.assertRaises(flow.FlowError) as cm:                     # a no always carries its reason
            flow.reject_extra(self.db, a.id, "  ", "Dilafruz", "guest:1")
        self.assertEqual(cm.exception.code, "note")
        self.db.rollback()
        flow.reject_extra(self.db, a.id, "Zaxira yo'q", "Dilafruz", "guest:1")
        self.db.commit()
        b = self._ask(mid=2)
        with self.assertRaises(flow.FlowError) as cm:                     # a brigadir withdraws only their own
            flow.cancel_extra(self.db, b.id, 1, "Brig One")
        self.assertEqual(cm.exception.code, "not_yours")
        self.db.rollback()
        flow.cancel_extra(self.db, b.id, 2, "Brig Two")
        self.db.commit()
        with self.assertRaises(flow.FlowError) as cm:
            flow.cancel_extra(self.db, a.id, 1, "Brig One")               # already answered
        self.assertEqual(cm.exception.code, "state")
        self.db.rollback()
        c = self._ask(hour=12)
        c, x = flow.approve_extra(self.db, c.id, {"yellow": 8}, nk, "", "Dilafruz", "guest:1")
        self.db.commit()
        flow.cancel_request(self.db, x.id, "xato", "Dilafruz")            # AXO withdrew the request it became
        self.db.commit()
        stages = {e["id"]: e["stage"] for e in flow.extras_of(self.db, DAY)}
        self.assertEqual((stages[a.id], stages[b.id], stages[c.id]), ("rejected", "cancelled", "withdrawn"))
        d = self._ask(hour=13)
        d, y = flow.approve_extra(self.db, d.id, {"yellow": 8}, nk, "", "Dilafruz", "guest:1")
        self.db.commit()
        flow.delete_request(self.db, y.id)                                 # an admin deleted it outright
        self.db.commit()
        self.db.expire_all()
        self.assertIsNone(self.db.get(flow.ContainerExtra, d.id).request_id)
        self.assertEqual({e["id"]: e["stage"] for e in flow.extras_of(self.db, DAY)}[d.id], "withdrawn")
        rep = flow.extras_report(self.db, DAY, DAY)
        self.assertEqual({k: rep["summary"][k] for k in ("asks", "approved", "rejected", "waiting", "cancelled",
                                                         "asked_n", "approved_n")},
                         {"asks": 3, "approved": 2, "rejected": 1, "waiting": 0, "cancelled": 1,
                          "asked_n": 24, "approved_n": 16})
        u1, = rep["units"]
        self.assertEqual((u1["manager_id"], u1["asks"], u1["top_reason"]), (1, 3, "plan"))
        self.assertEqual(rep["reasons"]["plan"], 3)

    def test_extra_notices(self):
        from app.models import ProfilePermission, RoleProfile
        from app.routers import staff
        nk = self._extras()
        ax = RoleProfile(role="idle-owner", name="Dilafruz")
        self.db.add(ax)
        self.db.flush()
        axo = f"idle-owner:{ax.id}"
        self.db.add(ProfilePermission(profile_key=axo, capability="page.view.container-flow", mode="grant", scope="all"))
        self.db.commit()
        e = self._ask(counts={"yellow": 8}, reason="damaged")
        sent = []

        def capture(db, key, nkey, params, **kw):
            sent.append((key, nkey, kw["html_fn"]("uz"), kw["markup_fn"]("uz").to_dict()))
        with mock.patch("app.database.SessionLocal", self.pg.Session), \
             mock.patch.object(staff, "notify_profile", side_effect=capture):
            self.assertEqual(flow.notify_extra_new(e.id), 1)              # ON unless switched off
            key, nkey, html, kb = sent[-1]
            self.assertEqual((key, nkey), (axo, "container_extra_new"))
            self.assertIn("Konteyner yaroqsiz", html)
            self.assertIn("tab=requests", kb["inline_keyboard"][0][0]["web_app"]["url"])
            flow.save_settings(self.db, notify_extra=False)
            self.assertEqual(flow.notify_extra_new(e.id), 0)
            flow.save_settings(self.db, notify_brigadirs=True)
            flow.approve_extra(self.db, e.id, {"yellow": 5}, nk, "", "Dilafruz", axo)
            self.db.commit()
            from app.permissions import get_page_access, set_page_access
            m = get_page_access(self.db)
            m["container-extra"] = []                                     # the role closed …
            set_page_access(self.db, m)
            self.assertFalse(flow.notify_extra_decided(e.id))              # … so the brigadir cannot open it
            self.db.add(ProfilePermission(profile_key="supervisor:1", capability=flow.EXTRA_CAP,
                                          mode="grant", scope="all"))     # … unit 1 by a personal grant
            self.db.commit()
            self.assertTrue(flow.notify_extra_decided(e.id))
            key, nkey, html, kb = sent[-1]
            self.assertEqual((key, nkey), ("supervisor:1", "container_extra_approved"))
            self.assertIn("5", html)
            self.assertIn("tab=receive", kb["inline_keyboard"][0][0]["web_app"]["url"])
        self.assertEqual(len(sent), 2)

    # ── AXO's stock ──
    def _stock(self):
        nk = self._logistics()
        self.db.execute(flow.text("DELETE FROM container_stock_moves"))
        self.db.commit()
        return nk

    def _split(self, nk, hour, counts, at, day=DAY):
        r = flow.create_request(self.db, day, hour, nk, counts, "", "axo", "guest:1")
        flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": counts}], None, None, "n", nk, False)
        r.assigned_at = at
        self.db.commit()
        return r

    def _count(self, at, **over):
        m = flow.record_stock(self.db, "count", {**{k: 100 for k in flow.KEYS}, **over}, "", "Dilafruz", "guest:1", at)
        self.db.commit()
        return m

    def test_stock_is_unknown_until_axo_counts(self):
        nk = self._stock()
        self._split(nk, 10, {"yellow": 20}, self.at(9))
        flow.record_stock(self.db, "in", {"yellow": 5}, "", "axo", "guest:1", self.at(11))
        self.db.commit()
        s = flow.stock(self.db, DAY, DAY, self.at(12))
        self.assertFalse(s["counted"])
        self.assertIsNone(s["now"])
        self.assertEqual((s["days"], s["moves"], s["today"]), ([], [], None))   # no figure, so no history of one

    def test_stock_follows_what_leaves_and_what_axo_records(self):
        nk = self._stock()
        with mock.patch.object(flow, "prepared", return_value=[]):
            self._split(nk, 9, {"yellow": 40}, self.at(7, 30))      # split BEFORE the count — already off the shelf
            self._count(self.at(8))
            a = self._split(nk, 10, {"yellow": 30, "bucket": 4}, self.at(9))
            flow.record_stock(self.db, "in", {"yellow": 10}, "yuvilgan", "Dilafruz", "guest:1", self.at(11))
            self.db.commit()
            s = flow.stock(self.db, DAY, DAY, self.at(12))
            self.assertTrue(s["counted"])
            self.assertEqual((s["now"]["yellow"], s["now"]["bucket"], s["now"]["grey"]), (80, 96, 100))
            self.assertEqual((s["today"]["given"]["yellow"], s["today"]["returned"]["yellow"]), (30, 10))
            row, = s["days"]
            self.assertIsNone(row["open"])                           # the first count was made this day
            self.assertEqual((row["given"]["yellow"], row["returned"]["yellow"], row["adjust"]["yellow"],
                              row["close"]["yellow"], row["counted"]), (30, 10, 0, 80, True))
            self.assertEqual([(m["kind"], m["by"], m["note"]) for m in s["moves"]],
                             [("in", "Dilafruz", "yuvilgan"), ("count", "Dilafruz", None)])   # newest first
            # asked but not split yet: still on the shelf, and named as promised
            flow.create_request(self.db, DAY, 14, nk, {"grey": 7}, "", "axo", "guest:1")
            self.db.commit()
            s = flow.stock(self.db, DAY, DAY, self.at(12))
            self.assertEqual((s["now"]["grey"], s["today"]["reserved"]["grey"]), (100, 7))
            # a split request that is cancelled gives its containers back
            flow.cancel_request(self.db, a.id, "xato", "axo")
            self.db.commit()
            s = flow.stock(self.db, DAY, DAY, self.at(12))
            self.assertEqual((s["now"]["yellow"], s["now"]["bucket"]), (110, 100))
            # the figure is as of the moment asked for
            self.assertEqual(flow.stock(self.db, DAY, DAY, self.at(10))["now"]["yellow"], 100)

    def test_stock_days_carry_over_and_a_recount_corrects(self):
        nk = self._stock()
        d2 = DAY + timedelta(days=1)
        nxt = lambda hh: self.at(hh) + timedelta(days=1)             # noqa: E731
        with mock.patch.object(flow, "prepared", return_value=[]):
            self._count(self.at(8))
            self._split(nk, 10, {"yellow": 30}, self.at(9))
            self._split(nk, 10, {"yellow": 25}, nxt(9), day=d2)
            self._count(nxt(15), yellow=50)                          # the book said 45
            s = flow.stock(self.db, DAY - timedelta(days=3), d2, nxt(18))
            self.assertEqual([r["day"] for r in s["days"]], [DAY.isoformat(), d2.isoformat()])   # none before the first count
            one, two = s["days"]
            self.assertEqual((one["open"], one["close"]["yellow"]), (None, 70))
            self.assertEqual((two["open"]["yellow"], two["given"]["yellow"], two["adjust"]["yellow"],
                              two["close"]["yellow"], two["counted"]), (70, 25, 5, 50, True))
            for k in flow.KEYS:
                self.assertEqual(two["open"][k] - two["given"][k] + two["returned"][k] + two["adjust"][k],
                                 two["close"][k], k)
            self.assertEqual((s["now"]["yellow"], s["last_count"]["counts"]["yellow"]), (50, 50))
            # a later period opens on the last count before it; a past one still answers «now»
            d3 = d2 + timedelta(days=1)
            row, = flow.stock(self.db, d3, d3, nxt(18) + timedelta(days=1))["days"]
            self.assertEqual((row["open"]["yellow"], row["close"]["yellow"], row["counted"]), (50, 50, False))
            self.assertEqual(flow.stock(self.db, DAY, DAY, nxt(18))["now"]["yellow"], 50)

    def test_stock_names_what_today_still_takes(self):
        nk = self._stock()
        self._count(self.at(8))
        need = {13: {"yellow": 40}, 14: {"yellow": 30, "grey": 5}}
        with mock.patch.object(flow, "plant_hours", side_effect=lambda db, day: need if day == DAY else {}):
            flow.create_request(self.db, DAY, 13, nk, {"yellow": 40}, "", "axo", "guest:1")   # asked, waiting
            self.db.commit()
            t = flow.stock(self.db, DAY, DAY, self.at(12))["today"]
            self.assertEqual((t["reserved"]["yellow"], t["ahead"]["yellow"], t["ahead"]["grey"]), (40, 30, 5))
            t = flow.stock(self.db, DAY, DAY, self.at(15))["today"]                # both hours are over
            self.assertEqual((t["reserved"]["yellow"], t["ahead"]["yellow"]), (0, 0))
        with mock.patch.object(flow, "prepared", side_effect=RuntimeError("no plan")):
            s = flow.stock(self.db, DAY, DAY, self.at(12))
            self.assertIsNone(s["today"]["ahead"])                                 # said, not guessed …
            self.assertEqual(s["now"]["yellow"], 100)                              # … and the rest stands

    def test_stock_today_is_the_production_day(self):
        """2026-11-20: «Bugun yana ketadi» is the production day running now
        (08:00 → 08:00) — never the next one after midnight, never a request
        made ahead for tomorrow."""
        nk = self._stock()
        self._count(self.at(8))
        nxt = DAY + timedelta(days=1)
        need = {DAY: {13: {"yellow": 40}, 26: {"yellow": 7}}, nxt: {9: {"yellow": 500}}}
        with mock.patch.object(flow, "plant_hours", side_effect=lambda db, day: need.get(day, {})):
            flow.create_request(self.db, nxt, 10, nk, {"yellow": 50}, "", "axo", "guest:1")   # tomorrow's, made ahead
            self.db.commit()
            t = flow.stock(self.db, DAY, DAY, self.at(12))["today"]
            self.assertEqual((t["reserved"]["yellow"], t["ahead"]["yellow"]), (0, 47))
            past_midnight = self.at(0, 30) + timedelta(days=1)                    # still DAY's night
            t = flow.stock(self.db, DAY, DAY, past_midnight)["today"]
            self.assertEqual((t["reserved"]["yellow"], t["ahead"]["yellow"]), (0, 7))   # not tomorrow's 500 / 50
            t = flow.stock(self.db, nxt, nxt, self.at(9) + timedelta(days=1))["today"]
            self.assertEqual((t["reserved"]["yellow"], t["ahead"]["yellow"]), (50, 500))
        self.assertEqual(flow.production_day(self.at(7, 59)), DAY - timedelta(days=1))
        self.assertEqual(flow.production_day(self.at(8)), DAY)

    # ── «Jo'natish» — the dispatch areas (2026-11-19) ──────────────────────
    def _areas(self):
        self.db.execute(flow.text("DELETE FROM container_send_areas"))
        self.db.commit()
        self.assertEqual(flow.seed_send_areas(self.db), 6)
        self.db.commit()
        self.assertEqual(flow.seed_send_areas(self.db), 0)          # only into an empty schedule
        return {(a.name, a.shift): a for a in flow.send_areas(self.db)}

    def test_send_schedule_puts_each_round_at_its_start(self):
        """2026-11-20: a round's share is asked for WHOLE at the hour the round
        starts — nothing in the hours after it (10:00 carried the 09:00
        round's second hour)."""
        areas = self._areas()
        night = flow.area_hours(areas[("Сдоба Слойка Мясной", 2)])
        self.assertEqual(sorted(night), [20, 24, 27])                          # 20:00 · 00:00 · 03:30, past midnight from 24
        self.assertEqual(night[20], {"send": 2667, "lid": 2667})
        self.assertEqual(sum(e["send"] for e in night.values()), 8000)         # the rounds add up to the shift
        day = flow.area_hours(areas[("Бургер", 1)])
        self.assertEqual(sorted(day), [9, 12, 30])                             # 06:00 ends the production day (opens 08:00)
        self.assertEqual([day[h]["send"] for h in (30, 9, 12)], [1000, 1000, 1000])
        self.assertNotIn(10, day)
        self.assertEqual(sum(e["lid"] for e in day.values()), 3000)
        pie = flow.area_hours(areas[("Пирог печенья", 1)])
        self.assertEqual([pie[h]["send"] for h in (30, 9, 12)], [167, 167, 166])
        # kept on the page: checked, changed, archived
        for bad in (dict(name=" ", shift=1, send=1, lid=1, rounds=[["06:00", "09:00"]]),
                    dict(name="X", shift=3, send=1, lid=1, rounds=[["06:00", "09:00"]]),
                    dict(name="X", shift=1, send=0, lid=0, rounds=[["06:00", "09:00"]]),
                    dict(name="X", shift=1, send=1, lid=1, rounds=[]),
                    dict(name="X", shift=1, send=1, lid=1, rounds=[["25:00", "09:00"]])):
            with self.assertRaises(flow.FlowError, msg=bad):
                flow.save_area(self.db, None, actor="a", **bad)
        a = flow.save_area(self.db, None, "Tort", 1, 90, 0, [["08:00", "11:00"]], "Dilafruz")
        self.assertEqual(flow.area_hours(a), {8: {"send": 90}})
        flow.remove_area(self.db, a.id, "Dilafruz")
        self.db.commit()
        self.assertNotIn(a.id, [x.id for x in flow.send_areas(self.db)])
        with self.assertRaises(flow.FlowError):
            flow.create_request(self.db, DAY, 8, "*", {"send": 1}, "", "axo", "guest:1", area_id=a.id)

    def test_area_request_is_delivered_and_counted_together(self):
        nk = self._stock()
        areas = self._areas()
        burger = areas[("Бургер", 1)]
        self.db.execute(flow.text("DELETE FROM container_requests WHERE day = :d"), {"d": DAY})
        self.db.commit()
        with mock.patch.object(flow, "plant_hours", return_value={}):
            self._count(self.at(5))
            # «Tayyor»: ONE item per hour — every area's need of the hour together
            # (Бургер 1000 + Сдоба Фасовка 500 + Пирог печенья 167: the 06:00
            # round, hour 30 — the end of the production day)
            hour6 = lambda: next(i for i in flow.prepared(self.db, DAY, self.at(5)) if i["hour"] == 30)  # noqa: E731
            self.assertEqual(hour6()["counts"], {"send": 1667, "lid": 1667})
            # a request FOR the area: only its two types; the crates are another request's
            r = flow.create_request(self.db, DAY, 30, nk, {"send": 334, "lid": 334, "yellow": 5}, "", "axo",
                                    "guest:1", area_id=burger.id)
            self.db.commit()
            self.assertEqual((r.lines, r.area_name), ({"send": 334, "lid": 334}, "Бургер"))
            self.assertEqual(hour6()["counts"], {"send": 1333, "lid": 1333})    # an area's own request counts as asked
            with self.assertRaises(flow.FlowError):
                flow.create_request(self.db, DAY, 6, nk, {"yellow": 5}, "", "axo", "guest:1", area_id=burger.id)
            # waiting: promised in the stock, not gone
            t = flow.stock(self.db, DAY, DAY, self.at(9))         # hour 30 is DAY's own (06:00 next morning)
            self.assertEqual((t["now"]["send"], t["today"]["reserved"]["send"]), (0, 334))
            # delivered, not split: fewer needs a reason; never more than asked
            with self.assertRaises(flow.FlowError):
                flow.assign_request(self.db, r.id, [{"manager_id": 1, "counts": {"send": 1}}], None, None, "n", nk, False)
            with self.assertRaises(flow.FlowError):
                flow.deliver_request(self.db, r.id, {"send": 400}, None, None, "n", nk, False)
            with self.assertRaises(flow.FlowError):
                flow.deliver_request(self.db, r.id, {"send": 300, "lid": 334}, None, None, "n", nk, False)
            self.db.rollback()
            d = flow.deliver_request(self.db, r.id, {"send": 300, "lid": 334}, "short", None, "Nuriddin", nk, False)
            d.assigned_at = self.at(5, 40)
            self.db.commit()
            row = next(x for x in flow.requests_of(self.db, DAY) if x["id"] == r.id)
            self.assertEqual((row["status"], row["area"], row["given"], row["parts"], row["receipt"]),
                             ("assigned", "Бургер", {"send": 300, "lid": 334}, [], None))
            # inside, split as ever — and the stock subtracts BOTH, apart
            self._split(nk, 7, {"yellow": 20}, self.at(5, 50))
            s = flow.stock(self.db, DAY, DAY, self.at(6))
            self.assertEqual((s["now"]["yellow"], s["now"]["send"], s["now"]["lid"]), (80, -300, -334))
            self.assertEqual((s["today"]["given"]["yellow"], s["today"]["sent"]["send"]), (20, 300))
            day_row, = s["days"]
            self.assertEqual((day_row["given"]["send"], day_row["sent"]["send"], day_row["sent"]["yellow"]), (0, 300, 0))
            # a count that leaves the dispatch types out keeps their book figure
            self._count(self.at(6, 30))
            self.assertEqual(flow.stock(self.db, DAY, DAY, self.at(7))["now"]["send"], -300)
            flow.record_stock(self.db, "count", {**{k: 100 for k in flow.KEYS}, "send": 5000, "lid": 5000},
                              "", "Dilafruz", "guest:1", self.at(7))
            self.db.commit()
            self.assertEqual(flow.stock(self.db, DAY, DAY, self.at(8))["now"]["send"], 5000)
            # «Hisobot» / «Tahlil»: one total, split into the brigadirs' and the areas'
            rep = flow.requests_report(self.db, DAY, DAY)["summary"]
            self.assertEqual((rep["given"], rep["in_given"], rep["send_given"], rep["send_requests"]),
                             (654, 20, 634, 1))
            self.assertEqual(flow.sending_report(self.db, DAY, DAY)["days"], 0)     # before the schedule existed
            with mock.patch.object(flow, "SEND_FROM", DAY):
                an = flow.analytics(self.db, DAY, DAY)
            self.assertEqual({t["ctype"]: t["given"] for t in an["types"]}, {"yellow": 20, "send": 300, "lid": 334})
            b = next(a for a in an["sending"]["areas"] if a["area_id"] == burger.id)
            self.assertEqual(b["need"], {"send": 3000, "lid": 3000})
            self.assertEqual((an["sending"]["total"]["asked"], an["sending"]["total"]["given"]),
                             ({"send": 334, "lid": 334}, {"send": 300, "lid": 334}))
            # the message names the area
            self.assertIn("Бургер", flow._tg_body(r, "new", "ru"))
            self.assertIn("Krishka 334", flow.counts_text(r.lines))

    def test_one_request_for_the_hour_splits_to_brigadirs_and_dispatch(self):
        """2026-11-19: ONE request carries the hour's crates and the dispatch
        containers and lids; logistics splits the crates to brigadirs (their
        limits) and gives dispatch ONE amount — any type, no limit, nobody
        confirms; it is what left AXO for dispatch."""
        nk = self._stock()
        self._areas()
        with mock.patch.object(flow, "plant_hours", return_value={20: {"yellow": 30}}):
            self._count(self.at(8))
            r = flow.create_request(self.db, DAY, 20, nk, {"yellow": 30, "send": 1223, "lid": 1223}, "", "axo",
                                    "guest:1")
            self.db.commit()
            self.assertEqual((r.lines, r.area_id), ({"yellow": 30, "send": 1223, "lid": 1223}, None))
            # the 20:00 rounds whole at 20:00 (2667 + 500 + 500): the rest still to ask
            self.assertEqual([i["counts"] for i in flow.prepared(self.db, DAY, self.at(18)) if i["hour"] == 20],
                             [{"send": 2444, "lid": 2444}])
            parts = [{"manager_id": 1, "counts": {"yellow": 25}}]
            with self.assertRaises(flow.FlowError):                     # short without a reason
                flow.assign_request(self.db, r.id, parts, None, None, "n", nk, False,
                                    dispatch={"send": 1223, "lid": 1223})
            self.db.rollback()
            with self.assertRaises(flow.FlowError):                     # more than asked in all
                flow.assign_request(self.db, r.id, parts, None, None, "n", nk, False,
                                    dispatch={"yellow": 6, "send": 1223, "lid": 1223})
            self.db.rollback()
            a = flow.assign_request(self.db, r.id, parts, "short", None, "Nuriddin", nk, False,
                                    dispatch={"yellow": 5, "send": 1200, "lid": 1223})
            a.assigned_at = self.at(19)
            self.db.commit()
            row = next(x for x in flow.requests_of(self.db, DAY) if x["id"] == r.id)
            self.assertEqual((row["given"], [p["counts"] for p in row["parts"]]),
                             ({"yellow": 5, "send": 1200, "lid": 1223}, [{"yellow": 25}]))
            s = flow.stock(self.db, DAY, DAY, self.at(21))
            self.assertEqual((s["now"]["yellow"], s["now"]["send"]), (70, -1200))
            self.assertEqual((s["today"]["given"]["yellow"], s["today"]["sent"]["yellow"], s["today"]["sent"]["lid"]),
                             (25, 5, 1223))
            rep = flow.requests_report(self.db, DAY, DAY)["summary"]
            self.assertEqual((rep["in_asked"], rep["send_asked"], rep["in_given"], rep["send_given"], rep["given"]),
                             (30, 2446, 25, 2428, 2453))
            with mock.patch.object(flow, "SEND_FROM", DAY):
                snd = flow.sending_report(self.db, DAY, DAY)
            self.assertEqual((snd["total"]["asked"], snd["total"]["given"]),
                             ({"send": 1223, "lid": 1223}, {"send": 1200, "lid": 1223}))
        # nothing to brigadirs is fine; nothing at all is not
        r2 = flow.create_request(self.db, DAY, 21, nk, {"send": 10}, "", "axo", "guest:1")
        self.db.commit()
        with self.assertRaises(flow.FlowError):
            flow.assign_request(self.db, r2.id, [], None, None, "n", nk, False, dispatch={})
        self.db.rollback()
        flow.assign_request(self.db, r2.id, [], None, None, "n", nk, False, dispatch={"send": 10})
        self.db.commit()
        self.assertEqual(self.db.get(type(r2), r2.id).given, {"send": 10})

    def test_area_request_edit_keeps_its_kind(self):
        nk = self._stock()
        areas = self._areas()
        a, b = areas[("Бургер", 1)], areas[("Сдоба Фасовка", 1)]
        r = flow.create_request(self.db, DAY, 9, nk, {"send": 100}, "", "axo", "guest:1", area_id=a.id)
        self.db.commit()
        r, changes, _ = flow.edit_request(self.db, r.id, 9, nk, {"send": 120, "lid": 120}, "", area_id=b.id)
        self.db.commit()
        self.assertEqual((r.area_id, r.area_name, r.lines), (b.id, "Сдоба Фасовка", {"send": 120, "lid": 120}))
        self.assertIn("area", [c[0] for c in changes])
        with self.assertRaises(flow.FlowError):           # crates never ride on an area's request
            flow.edit_request(self.db, r.id, 9, nk, {"yellow": 5}, "")
        self.db.rollback()
        inside = flow.create_request(self.db, DAY, 9, nk, {"yellow": 5}, "", "axo", "guest:1")
        self.db.commit()
        inside, _c, _k = flow.edit_request(self.db, inside.id, 9, nk, {"yellow": 6}, "", area_id=a.id)
        self.assertIsNone(inside.area_id)                  # a brigadirs' request stays theirs
        with self.assertRaises(flow.FlowError):
            flow.deliver_request(self.db, inside.id, {"send": 1}, None, None, "n", nk, False)
        self.db.rollback()
        # several at once: one per area and hour
        rs = flow.create_requests(self.db, DAY, nk, [{"hour": 10, "counts": {"send": 5}, "area_id": a.id},
                                                     {"hour": 10, "counts": {"send": 5}, "area_id": b.id},
                                                     {"hour": 10, "counts": {"yellow": 5}}], "", "axo", "guest:1")
        self.assertEqual([x.area_id for x in rs], [a.id, b.id, None])
        with self.assertRaises(flow.FlowError):
            flow.create_requests(self.db, DAY, nk, [{"hour": 11, "counts": {"send": 5}, "area_id": a.id},
                                                    {"hour": 11, "counts": {"send": 5}, "area_id": a.id}],
                                 "", "axo", "guest:1")
        self.db.rollback()

    def test_stock_record_is_checked(self):
        self._stock()
        for kind, counts in (("count", {"yellow": 5}),                             # a count names every type
                             ("in", {}), ("in", {"yellow": 0}), ("in", {"yellow": -1}),
                             ("in", {"yellow": True}), ("out", {"yellow": 1}), ("in", {"pallet": 3})):
            with self.assertRaises(flow.FlowError, msg=(kind, counts)):
                flow.record_stock(self.db, kind, counts, "", "a", "k")
        m = flow.record_stock(self.db, "count", {k: 0 for k in flow.KEYS}, " ", "a", "k")
        self.assertEqual((m.counts, m.note), ({k: 0 for k in flow.KEYS}, None))
        m = flow.record_stock(self.db, "in", {"yellow": 3, "grey": 0}, "", "a", "k")
        self.assertEqual(m.counts, {"yellow": 3})


class PlantHoursTest(unittest.TestCase):
    """The request form's default is the «Konteynerlar» page's hour: every
    configured, non-archived unit's `unit_hours`, summed."""

    def test_sums_configured_units_and_keeps_a_minute(self):
        from unittest import mock as m
        from app.routers import production
        dashes = {1: ({9: {"yellow": 18}, 25: {"box": 2}}, {}), 2: ({9: {"yellow": 6, "round": 3}}, {})}
        db = m.MagicMock()
        flow._hours_cache.clear()
        with m.patch.object(flow, "flow_unit_ids", return_value=[1, 2, 3]), \
             m.patch.object(production, "_configured_manager_ids", return_value={1, 2}), \
             m.patch.object(production, "_build_dashboard", side_effect=lambda db, mid, day: mid), \
             m.patch.object(flow.hourly_containers, "unit_hours", side_effect=lambda mid: dashes[mid]) as uh:
            got = flow.plant_hours(db, DAY)
            self.assertEqual(got, {9: {"yellow": 24, "round": 3}, 25: {"box": 2}})
            flow.plant_hours(db, DAY)
            self.assertEqual(uh.call_count, 2)          # unit 3 has no «Zagruzka fayli»; the 2nd read is kept
        flow._hours_cache.clear()


class PageKeyTest(unittest.TestCase):
    """«Konteyner berish» is a grantable page (admin-only by default), and its
    capability exists — Dilafruz's one-shot grants it by that id."""

    def test_page_key_and_capability(self):
        from app import capabilities
        from app.permissions import DEFAULT_PAGE_ACCESS, PAGE_KEYS
        for key in ("container-flow", "container-logistics", "container-receive", "container-extra"):
            self.assertIn(key, PAGE_KEYS)
            self.assertEqual(DEFAULT_PAGE_ACCESS[key],
                             ["supervisor"] if key == "container-receive" else [])
            self.assertIn(f"page.view.{key}", {c["key"] for c in capabilities.CAPABILITIES})
        # the managers watch the whole page and press nothing on it
        self.assertIn("container-watch", PAGE_KEYS)
        # …the top-managers; the shift managers see only the board since 2026-11-21
        self.assertEqual(DEFAULT_PAGE_ACCESS["container-watch"], ["top-manager"])
        self.assertIn("shift-manager", DEFAULT_PAGE_ACCESS["containers"])

    def test_axo_doors_and_admin_doors(self):
        """AXO's steps and the reads take the page key; the settings write and
        deleting a request take the page's admin grant (admins, and
        `page.admin.container-flow` since 2026-11-19); the batches' doors are gone."""
        from app.routers import container_flow as r
        guard = {}
        for route in r.router.routes:
            deps = [d.call for d in route.dependant.dependencies]
            guard[(next(iter(route.methods)), route.path)] = (
                "admin" if r.ADMIN in deps else "axo" if r.PAGE in deps
                else "logistics" if r.LOGI in deps else "any" if r.ANY in deps
                else "receive" if r.RECV in deps else "receive+watch" if r.RECW in deps
                else "extra" if r.EXT in deps else "extra+read" if r.EXTR in deps
                else "who" if r.WHO in deps else "?")
        p = "/api/container-flow"
        for k in [("POST", f"{p}/requests"), ("PUT", f"{p}/requests/{{request_id}}"),
                  ("POST", f"{p}/requests/{{request_id}}/cancel"),
                  ("GET", f"{p}/logistics"), ("GET", f"{p}/requests/prepared"),
                  ("POST", f"{p}/requests/bulk"), ("POST", f"{p}/stock"),
                  ("POST", f"{p}/extras/{{extra_id}}/approve"), ("POST", f"{p}/extras/{{extra_id}}/reject")]:
            self.assertEqual(guard[k], "axo", k)
        for k in [("POST", f"{p}/requests/{{request_id}}/assign"), ("POST", f"{p}/seen/{{request_id}}"),
                  ("GET", f"{p}/units"), ("GET", f"{p}/requests/{{request_id}}/split-hint")]:
            self.assertEqual(guard[k], "logistics", k)
        self.assertEqual(guard[("POST", f"{p}/requests/{{request_id}}/receive")], "receive")
        self.assertEqual(guard[("GET", f"{p}/receipts")], "receive+watch")
        # a brigadir asks and withdraws; everybody on the page reads
        self.assertEqual(guard[("POST", f"{p}/extras")], "extra")
        self.assertEqual(guard[("POST", f"{p}/extras/{{extra_id}}/cancel")], "extra")
        self.assertEqual(guard[("GET", f"{p}/extras")], "extra+read")
        self.assertEqual(guard[("GET", f"{p}/hour-need")], "any")
        # watching opens no write: every POST / PUT but the Excel export keeps a door the watch key is not on
        for (method, path), g in guard.items():
            if method in ("POST", "PUT") and not path.endswith("/report.xlsx"):
                self.assertNotIn(g, ("any", "who", "receive+watch", "extra+read"), (method, path))
        self.assertEqual(guard[("GET", f"{p}/settings")], "who")
        for k in [("GET", f"{p}/requests"), ("GET", f"{p}/report"), ("GET", f"{p}/analytics"),
                  ("GET", f"{p}/stock"), ("GET", f"{p}/readiness")]:
            self.assertEqual(guard[k], "any", k)
        for k in [("PUT", f"{p}/settings"), ("DELETE", f"{p}/requests/{{request_id}}")]:
            self.assertEqual(guard[k], "admin", k)
        self.assertNotIn("?", guard.values())
        # «Partiyalar» was removed on 2026-11-18: none of its doors is left
        gone = ("/board", "/issue", "/batches/", "/teams")
        self.assertEqual([k for k in guard if any(g in k[1] for g in gone)], [])


if __name__ == "__main__":
    unittest.main()


class CellBreakdownTest(unittest.TestCase):
    """To which cell how many (2026-11-20): a brigadir's part is shared across
    their cells (a team's cell by its verifix code, else its work centre) by
    what each still needs."""

    def test_team_hours_go_under_their_cell(self):
        teams = [{"cell": {"id": 1, "verifix_code": "9123"}, "work_center": "A1", "group": "A",
                  "hours": {8: {"yellow": 30}, 9: {"yellow": 10}}},
                 {"cell": {"id": 1, "verifix_code": "9123"}, "work_center": "A1", "group": "B",
                  "hours": {9: {"round": 2}}},                         # same cell → added up
                 {"cell": {"id": 3, "verifix_code": "7331"}, "work_center": "B2", "group": "",
                  "hours": {8: {"yellow": 10, "round": 4}}},
                 {"cell": None, "work_center": "C3", "group": "A", "hours": {9: {"grey": 2}}}]
        out = flow._cell_hours(teams)
        self.assertEqual(out, {"9123": {8: {"yellow": 30}, 9: {"yellow": 10, "round": 2}},
                               "7331": {8: {"yellow": 10, "round": 4}},
                               "C3 · A": {9: {"grey": 2}}})

    def test_split_follows_the_need_and_adds_up(self):
        entry = {"names": ["7331", "9123"], "w": {"yellow": [["9123", 30], ["7331", 10]], "round": [["7331", 4]]}}
        self.assertEqual(flow.cell_split(entry, "yellow", 190), {"9123": 143, "7331": 47})
        self.assertEqual(flow.cell_split(entry, "round", 3), {"7331": 3})
        self.assertEqual(flow.cell_split(entry, "grey", 5), {})            # no need, several cells → no breakdown
        self.assertEqual(flow.cell_split({"names": ["9123"], "w": {}}, "grey", 5), {"9123": 5})
        self.assertEqual(flow.cell_split(entry, "yellow", 0), {})
        self.assertEqual(flow.cell_split(None, "yellow", 5), {})

    def test_card_names_each_cell_with_its_workshop(self):
        from app.models import ContainerRequest
        r = ContainerRequest(hour=9, logistics_name="Yusuf aka", assigned_at=None)
        body = flow._brig_body(r, {"yellow": 232}, "uz",
                               cells={"7416": {"yellow": 200}, "A2894 · A": {"yellow": 32}},
                               workshops={"7416": {"ru": "Центр. Мойка 1 смена"}})
        self.assertIn("<b>7416</b> · Tsentr. Moyka 1 smena — ", body)    # Russian → the reader's script
        self.assertIn("<b>A2894 · A</b> — ", body)                       # no cell: the key alone

    def test_logistics_card_opens_the_logistics_page(self):
        """21 Nov: logistics has a page of its own («Konteyner taqsimlash») —
        a card sent to a logistics person opens it; AXO's and the managers'
        alerts keep «Konteyner berish»."""
        url = lambda kb: kb.keyboard[0][0].web_app.url                       # noqa: E731
        self.assertTrue(url(flow._logi_markup("uz")).endswith("/containers/split"))
        self.assertTrue(url(flow._tg_markup("uz")).endswith("/containers/flow"))

    def test_requests_answer_names_each_split_cell(self):
        """The logistics row prints a workshop name under every split cell:
        the day's answer carries {code: {lang: name}} for the cells of its
        parts — one lookup, none when nothing is split by cell."""
        from app.routers import container_flow as r
        rows = [{"id": 1, "parts": [{"manager_id": 1, "cells": {"7416": {"yellow": 30}, "A2894 · A": {"yellow": 2}}},
                                    {"manager_id": 2, "cells": {}}]},
                {"id": 2, "parts": []}]
        roles = {"admin": False, "axo": False, "logistics": True, "watch": False}
        with mock.patch.object(r, "_roles", return_value=roles), \
                mock.patch.object(r, "_me", return_value="idle_owner:1"), \
                mock.patch.object(r.flow, "requests_of", return_value=rows) as req, \
                mock.patch.object(r.flow, "logistics_people", return_value=[{"key": "idle_owner:1"}]), \
                mock.patch.object(r.flow, "cell_workshops", return_value={"7416": {"ru": "Мойка"}}) as shops:
            out = r.get_requests(day=DAY, db=None, payload={})
            self.assertEqual(out["workshops"], {"7416": {"ru": "Мойка"}})
            self.assertEqual(shops.call_args[0][1], {"7416", "A2894 · A"})
            self.assertEqual(req.call_args[0][2], "idle_owner:1")       # a logistics person: their own requests
            self.assertTrue(out["logistics"])
            shops.reset_mock()
            req.return_value = [{"id": 2, "parts": []}]
            self.assertEqual(r.get_requests(day=DAY, db=None, payload={})["workshops"], {})
            shops.assert_not_called()

    def test_workshop_name_prefers_the_readers_language(self):
        self.assertEqual(flow.workshop_name({"uz": "Yuvish", "ru": "Мойка"}, "uz"), "Yuvish")
        self.assertEqual(flow.workshop_name({"ru": "Мойка"}, "ru"), "Мойка")
        self.assertEqual(flow.workshop_name(None, "uz"), "")
