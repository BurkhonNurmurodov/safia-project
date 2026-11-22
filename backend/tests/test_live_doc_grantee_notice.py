"""A live document's DECISION reaches the «Ko'chirish so'rovlarini ko'rib
chiqish» grantees too (2026-11-22, Abdukarimov Sanjar); its DRAFT reaches
them only as the one-tap card. No database: the fan-out is stubbed.

    ./venv/bin/python -m unittest tests.test_live_doc_grantee_notice
"""
from __future__ import annotations

import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

from app.routers import staff_live


def _doc():
    return SimpleNamespace(
        id=7, doc_type="people_exchange", manager_id=11, day=date(2026, 11, 22),
        created_by_name="Niyozov Izzatilla", created_by_telegram_id=5,
        payload={"target_type": "task", "task_name": "Chak-chakga",
                 "employees": [{"employee_id": 1}], "transfer_time": "10:10"})


class GranteeNotice(unittest.TestCase):
    def _run(self, event):
        with mock.patch.object(staff_live, "_grantee_profiles",
                               return_value=("supervisor:42",)) as gp, \
             mock.patch.object(staff_live, "_notify") as nt, \
             mock.patch("app.approvals.send_live_document_to_admins", return_value=set()):
            staff_live._notify_doc(object(), _doc(), event, 9)
        return gp, nt.call_args

    def test_decisions_reach_the_grantees(self):
        for event, nkey in (("approved", "live_exchange_approved"),
                            ("cancelled", "live_exchange_cancelled")):
            gp, call = self._run(event)
            gp.assert_called_once()
            self.assertEqual(call.args[1], nkey)
            self.assertEqual(call.kwargs["profiles"], ("supervisor:42",))

    def test_a_draft_reaches_them_as_the_card_only(self):
        gp, call = self._run("created")
        gp.assert_not_called()
        self.assertEqual(call.kwargs["profiles"], ())


if __name__ == "__main__":
    unittest.main()
