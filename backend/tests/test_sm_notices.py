"""Which unit notices still reach shift-managers (shift_scope.sm_told, 2026-11-11)."""
import unittest

from app.services.shift_scope import SM_QUIET, sm_told


class SmToldTest(unittest.TestCase):
    def test_requests_waiting_on_them_still_arrive(self):
        for k in ("live_role_change_new", "live_delete_request", "new_edit_request",
                  "new_delete_request", "bulk_delete_request", "new_role_change",
                  "live_day_still_open"):
            self.assertTrue(sm_told(k, {}), k)

    def test_exchange_to_a_task_arrives_to_a_brigadir_does_not(self):
        for k in ("live_exchange_created", "worker_exchange_created"):
            self.assertTrue(sm_told(k, {"target_kind": "task"}))
            self.assertFalse(sm_told(k, {"target_kind": "supervisor"}))

    def test_news_of_a_decision_is_quiet(self):
        for k in SM_QUIET:
            self.assertFalse(sm_told(k, {}), k)
        self.assertIn("live_exchange_approved", SM_QUIET)
        self.assertIn("live_day_closed", SM_QUIET)

    def test_every_quiet_key_is_a_real_template(self):
        from app.routers.staff import _NOTIF_STRINGS
        self.assertEqual(sorted(k for k in SM_QUIET if k not in _NOTIF_STRINGS), [])


if __name__ == "__main__":
    unittest.main()
