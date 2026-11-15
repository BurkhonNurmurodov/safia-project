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

from app.models import ContainerBatch, ContainerShare, Manager
from app.services import container_flow as flow

DAY = date(2026, 11, 16)


def team(wc, group, hours, cell=None):
    return {"work_center": wc, "group": group, "rest": False, "cell": cell,
            "people": 4, "hours": hours, "untimed": {}}


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
    back together it is the same answer, so a batch's need is the «Soatlik»
    figure and nothing else."""

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
        need = flow.need_by_hour(teams)
        first = min(need)
        self.assertEqual(need[first][0][0]["cell_code"], "9002")     # a group's own cell names its leader
        self.assertEqual(sum(sum(c.values()) for teams_ in need.values() for _m, c in teams_),
                         sum(sum(e.values()) for e in hours.values()))


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
                  "container_batches", "app_settings"):
            self.db.execute(flow.text(f"DELETE FROM {t}"))
        if self.db.get(Manager, 1) is None:
            self.db.add(Manager(id=1, name="Unit One", shift=1))
        self.db.commit()
        flow.save_settings(self.db, [1], 2)
        self.teams = [team("A2894", "A", {9: {"yellow": 18, "round": 6}},
                           {"id": 7, "verifix_code": "9422", "leader": "Leader A"}),
                      team("A2894", "B", {9: {"yellow": 6}})]
        self._p = mock.patch.object(flow, "unit_teams", side_effect=lambda db, mid, day: self.teams)
        self._p.start()
        # every unit's «Konteynerlar» figure — a brigadir's LIMIT for an hour;
        # generous here, so only the limit tests meet it
        big = {k: 100 for k in flow.KEYS}
        self.hours = {mid: {h: dict(big) for h in range(48)} for mid in (1, 2, 3)}
        self._h = mock.patch.object(flow, "units_hours", side_effect=lambda db, day: self.hours)
        self._h.start()

    def tearDown(self):
        self._h.stop()
        self._p.stop()
        self.db.close()

    def at(self, hh, mm=0):
        return datetime.combine(DAY, datetime.min.time(), flow.TZ) + timedelta(hours=hh, minutes=mm)

    def draft(self, hh, mm=0):
        return flow.draft_due(self.db, self.at(hh, mm))

    def batches(self):
        return self.db.query(ContainerBatch).order_by(ContainerBatch.id).all()

    # ── drafting ──
    def test_nothing_before_the_window_and_no_unit_no_batch(self):
        self.assertEqual(self.draft(6, 55), 0)          # H − 125 min
        flow.save_settings(self.db, [], 2)
        self.assertEqual(self.draft(7), 0)

    def test_draft_freezes_the_need_and_is_due_an_hour_ahead(self):
        self.assertEqual(self.draft(7), 1)
        self.assertEqual(self.draft(7, 5), 0)           # once
        b = self.batches()[0]
        self.assertEqual((b.kind, b.status, b.hour), ("regular", "requested", 9))
        self.assertEqual(b.due_at, self.at(8))
        got = flow.one(self.db, b)
        self.assertEqual({ln["ctype"]: ln["need"] for ln in got["lines"]}, {"yellow": 24, "round": 6})
        self.assertEqual(got["teams"][0]["cell_code"], "9422")

    def test_a_late_draft_is_due_an_hour_after_it(self):
        self.draft(8, 30)
        self.assertEqual(self.batches()[0].due_at, self.at(9, 30))

    def test_topup_only_from_the_threshold(self):
        self.draft(7)
        self.teams[1]["hours"][9]["yellow"] = 7          # +1 — under the threshold
        self.assertEqual(self.draft(7, 10), 0)
        self.teams[1]["hours"][9]["yellow"] = 9          # +3
        self.assertEqual(self.draft(7, 15), 1)
        top = self.batches()[1]
        self.assertEqual(top.kind, "topup")
        self.assertEqual([(s.wc_group, s.ctype, s.due) for s in
                          self.db.query(ContainerShare).filter_by(batch_id=top.id)], [("B", "yellow", 3)])
        self.assertEqual(self.draft(7, 20), 0)           # the top-up is frozen too
        self.teams[1]["hours"][9]["yellow"] = 2          # a shrinking plan takes nothing back
        self.assertEqual(self.draft(7, 25), 0)

    # ── the steps ──
    def flow_to_delivery(self, issued=None, delivered=None, reason=None):
        self.draft(7)
        b = self.batches()[0]
        flow.issue(self.db, b.id, issued, reason, None, "axo")
        flow.deliver(self.db, b.id, delivered, reason, None, "mitsu")
        self.db.commit()
        return b

    def test_full_flow_closes(self):
        b = self.flow_to_delivery()
        self.assertEqual(b.status, "delivered")
        flow.answer(self.db, b.id, "A2894|A|0", "all", None, None, None, "leader")
        self.assertEqual(b.status, "delivered")          # team B has not answered
        flow.answer(self.db, b.id, "A2894|B|0", "all", None, None, None, "leader")
        self.assertEqual(b.status, "closed")
        self.assertIsNotNone(b.closed_at)

    def test_a_lower_number_needs_a_reason_at_every_step(self):
        self.draft(7)
        b = self.batches()[0]
        with self.assertRaises(flow.FlowError) as e:
            flow.issue(self.db, b.id, {"yellow": 20}, None, None, "axo")
        self.assertEqual(e.exception.code, "reason")
        with self.assertRaises(flow.FlowError) as e:
            flow.issue(self.db, b.id, {"yellow": 20}, "other", " ", "axo")
        self.assertEqual(e.exception.code, "comment")
        self.db.rollback()
        flow.issue(self.db, b.id, {"yellow": 20}, "short", None, "axo")
        with self.assertRaises(flow.FlowError):
            flow.deliver(self.db, b.id, {"yellow": 15}, None, None, "mitsu")

    def test_short_delivery_is_split_by_need(self):
        b = self.flow_to_delivery(issued={"yellow": 15}, reason="short")
        got = {t["key"]: t for t in flow.one(self.db, b)["teams"]}
        self.assertEqual(got["A2894|A|0"]["sent"], {"yellow": 11, "round": 6})
        self.assertEqual(got["A2894|B|0"]["sent"], {"yellow": 4})

    def test_dispute_then_settle(self):
        b = self.flow_to_delivery()
        with self.assertRaises(flow.FlowError):
            flow.answer(self.db, b.id, "A2894|A|0", "actual", {"yellow": 19}, None, None, "l")   # more than sent
        self.db.rollback()
        b = self.batches()[0]
        flow.answer(self.db, b.id, "A2894|A|0", "actual", {"yellow": 10}, "damaged", None, "l")
        self.assertEqual(b.status, "disputed")
        flow.answer(self.db, b.id, "A2894|B|0", "refuse", None, "wrong_type", None, "l")
        with self.assertRaises(flow.FlowError):
            flow.settle(self.db, b.id, "", "admin")
        flow.settle(self.db, b.id, "replaced", "admin")
        self.assertEqual(b.status, "closed")
        self.db.commit()
        rep = flow.report(self.db, DAY, DAY)
        y = next(r for r in rep["rows"] if r["ctype"] == "yellow")
        self.assertEqual((y["need"], y["issued"], y["delivered"], y["accepted"], y["gap_dispute"]),
                         (24, 24, 24, 10, 14))

    def test_send_back_and_force_close(self):
        self.draft(7)
        b = self.batches()[0]
        flow.issue(self.db, b.id, None, None, None, "axo")
        with self.assertRaises(flow.FlowError):
            flow.send_back(self.db, b.id, "", "mitsu")
        flow.send_back(self.db, b.id, "wrong unit", "mitsu")
        self.assertEqual((b.status, b.returned), ("requested", 1))
        with self.assertRaises(flow.FlowError):
            flow.force_close(self.db, b.id, " ", "admin")
        flow.force_close(self.db, b.id, "line stopped", "admin")
        self.assertTrue(b.forced)
        with self.assertRaises(flow.FlowError):
            flow.issue(self.db, b.id, None, None, None, "axo")

    def test_late_is_read_from_the_delivery(self):
        self.draft(7)
        b = self.batches()[0]
        flow.issue(self.db, b.id, None, None, None, "axo")
        with mock.patch.object(flow, "now", return_value=self.at(8, 1)):
            flow.deliver(self.db, b.id, None, None, None, "mitsu")
        self.assertTrue(b.late)

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
            flow.save_settings(self.db, [1], 2, False)   # an admin switches it off, unticks the roles
            matrix_with([])
            startup.container_flow_notify_on()
            startup.containers_tv_managers()
            self.db.expire_all()
            self.assertFalse(flow.settings(self.db)["notify"])
            self.assertEqual(access(), [])
            self.assertEqual(dm.call_count, 2)           # one note each, the first time only

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
            flow.save_settings(self.db, [1], 2, None, True)
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
        flow.save_settings(self.db, [1], 2, None, True)

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
            flow.save_settings(self.db, [1], 2, None, False)
            r3 = split(12, self.at(9))
            self.assertEqual(flow.remind_unconfirmed(self.db, self.at(12, 1)), 0)
            flow.save_settings(self.db, [1], 2, None, True)

            # cancel after the split: allowed while nobody confirmed; brigadirs told, no buttons
            flow.cancel_request(self.db, r3.id, "reja o'zgardi", "axo")
            self.db.commit()
            n = len(sent)
            self.assertEqual(flow.notify_split_cancelled(r3.id), 2)
            self.assertEqual({s[1] for s in sent[n:]}, {"container_split_cancelled"})
            self.assertIn("reja o'zgardi", sent[-1][2])
            self.assertFalse(sent[-1][3])
        self.assertEqual(flow.receive_from_bot(self.db, r3.id, 1, 5001)[0], "cancelled")

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
            flow.save_settings(self.db, [1], 2, None, False)
            startup.container_receive_brigadirs()
            self.db.expire_all()
            self.assertFalse(flow.settings(self.db)["notify_brigadirs"])   # an «off» sticks
            self.assertEqual(dm.call_count, 1)

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

    def test_notify_switch_and_message(self):
        from app.models import ContainerRequest
        self.assertFalse(flow.settings(self.db)["notify"])            # off by default
        flow.save_settings(self.db, [1], 2, True)
        self.assertTrue(flow.settings(self.db)["notify"])
        flow.save_settings(self.db, [1], 3)                            # an older tab keeps it
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


class PlantHoursTest(unittest.TestCase):
    """The request form's default is the «Konteynerlar» page's hour: every
    configured, non-archived unit's `unit_hours`, summed."""

    def test_sums_configured_units_and_keeps_a_minute(self):
        from unittest import mock as m
        from app.routers import production
        dashes = {1: ({9: {"yellow": 18}, 25: {"box": 2}}, {}), 2: ({9: {"yellow": 6, "round": 3}}, {})}
        db = m.MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [(1,), (2,), (3,)]
        flow._hours_cache.clear()
        with m.patch.object(production, "_configured_manager_ids", return_value={1, 2}), \
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
        for key in ("container-flow", "container-logistics", "container-receive"):
            self.assertIn(key, PAGE_KEYS)
            self.assertEqual(DEFAULT_PAGE_ACCESS[key], ["supervisor"] if key == "container-receive" else [])
            self.assertIn(f"page.view.{key}", {c["key"] for c in capabilities.CAPABILITIES})
        # the managers watch the whole page and press nothing on it
        self.assertIn("container-watch", PAGE_KEYS)
        self.assertEqual(DEFAULT_PAGE_ACCESS["container-watch"], ["top-manager", "shift-manager"])

    def test_axo_doors_and_admin_doors(self):
        """AXO's steps and the reads take the page key; Logistics', a
        leader's, a forced close and the settings write stay admin-only."""
        from app.routers import container_flow as r
        from app.routers.admin import verify_admin
        guard = {}
        for route in r.router.routes:
            deps = [d.call for d in route.dependant.dependencies]
            guard[(next(iter(route.methods)), route.path)] = (
                "admin" if verify_admin in deps else "axo" if r.PAGE in deps
                else "logistics" if r.LOGI in deps else "any" if r.ANY in deps
                else "receive" if r.RECV in deps else "receive+watch" if r.RECW in deps
                else "who" if r.WHO in deps else "?")
        p = "/api/container-flow"
        for k in [("POST", f"{p}/issue"), ("POST", f"{p}/batches/{{batch_id}}/settle"),
                  ("POST", f"{p}/requests"), ("POST", f"{p}/requests/{{request_id}}/cancel"),
                  ("GET", f"{p}/logistics")]:
            self.assertEqual(guard[k], "axo", k)
        for k in [("POST", f"{p}/batches/{{batch_id}}/deliver"), ("POST", f"{p}/batches/{{batch_id}}/return"),
                  ("POST", f"{p}/requests/{{request_id}}/assign"), ("POST", f"{p}/seen/{{request_id}}"),
                  ("GET", f"{p}/units"), ("GET", f"{p}/requests/{{request_id}}/split-hint")]:
            self.assertEqual(guard[k], "logistics", k)
        self.assertEqual(guard[("POST", f"{p}/requests/{{request_id}}/receive")], "receive")
        self.assertEqual(guard[("GET", f"{p}/receipts")], "receive+watch")
        self.assertEqual(guard[("GET", f"{p}/hour-need")], "any")
        # watching opens no write: every POST / PUT but the Excel export keeps a door the watch key is not on
        for (method, path), g in guard.items():
            if method in ("POST", "PUT") and not path.endswith("/report.xlsx"):
                self.assertNotIn(g, ("any", "who", "receive+watch"), (method, path))
        self.assertEqual(guard[("GET", f"{p}/settings")], "who")
        for k in [("GET", f"{p}/board"), ("GET", f"{p}/requests"), ("GET", f"{p}/report"), ("GET", f"{p}/analytics"),
                  ("GET", f"{p}/teams"), ("GET", f"{p}/batches/{{batch_id}}/history")]:
            self.assertEqual(guard[k], "any", k)
        for k in [("POST", f"{p}/batches/{{batch_id}}/answer"), ("POST", f"{p}/batches/{{batch_id}}/close"),
                  ("PUT", f"{p}/settings"), ("DELETE", f"{p}/requests/{{request_id}}")]:
            self.assertEqual(guard[k], "admin", k)
        self.assertNotIn("?", guard.values())


if __name__ == "__main__":
    unittest.main()
