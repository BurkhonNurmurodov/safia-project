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

    def tearDown(self):
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
        with self.assertRaises(flow.FlowError):
            flow.cancel_request(self.db, r.id, "x", "axo")                 # done — no cancel
        r2 = flow.create_request(self.db, DAY, 11, nk, {"box": 3}, "", "axo", "guest:1")
        with self.assertRaises(flow.FlowError):
            flow.cancel_request(self.db, r2.id, " ", "axo")
        flow.cancel_request(self.db, r2.id, "kerak emas", "axo")
        self.assertEqual(r2.status, "cancelled")
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
        for key in ("container-flow", "container-logistics"):
            self.assertIn(key, PAGE_KEYS)
            self.assertEqual(DEFAULT_PAGE_ACCESS[key], [])
            self.assertIn(f"page.view.{key}", {c["key"] for c in capabilities.CAPABILITIES})

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
                else "logistics" if r.LOGI in deps else "any" if r.ANY in deps else "?")
        p = "/api/container-flow"
        for k in [("POST", f"{p}/issue"), ("POST", f"{p}/batches/{{batch_id}}/settle"),
                  ("POST", f"{p}/requests"), ("POST", f"{p}/requests/{{request_id}}/cancel"),
                  ("GET", f"{p}/logistics"), ("GET", f"{p}/hour-need")]:
            self.assertEqual(guard[k], "axo", k)
        for k in [("POST", f"{p}/batches/{{batch_id}}/deliver"), ("POST", f"{p}/batches/{{batch_id}}/return"),
                  ("POST", f"{p}/requests/{{request_id}}/assign"), ("GET", f"{p}/units")]:
            self.assertEqual(guard[k], "logistics", k)
        for k in [("GET", f"{p}/board"), ("GET", f"{p}/requests"), ("GET", f"{p}/report"),
                  ("GET", f"{p}/settings"), ("GET", f"{p}/teams"), ("GET", f"{p}/batches/{{batch_id}}/history")]:
            self.assertEqual(guard[k], "any", k)
        for k in [("POST", f"{p}/batches/{{batch_id}}/answer"), ("POST", f"{p}/batches/{{batch_id}}/close"),
                  ("PUT", f"{p}/settings")]:
            self.assertEqual(guard[k], "admin", k)
        self.assertNotIn("?", guard.values())


if __name__ == "__main__":
    unittest.main()
