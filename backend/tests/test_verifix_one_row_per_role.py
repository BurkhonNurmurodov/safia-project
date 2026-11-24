"""One Verifix person may hold one profile per ROLE (2026-11-24): each is
followed; two of the same role are followed for neither. Pure rule.

    ./venv/bin/python -m unittest tests.test_verifix_one_row_per_role
"""
from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services.verifix_sync import profiles_by_emp


def prof(pid, role, eid="4112"):
    return SimpleNamespace(id=pid, role=role, vfx_employee_id=eid)


class OneRowPerRole(unittest.TestCase):
    def test_leader_and_top_manager_both_followed_leader_read_by_seats(self):
        top, lead = prof(9, "top-manager"), prof(241, "leader")
        shared, one = profiles_by_emp([top, lead])
        self.assertEqual(shared, {})
        self.assertIs(one["4112"], lead)

    def test_two_profiles_of_one_role_followed_for_neither(self):
        shared, one = profiles_by_emp([prof(1, "leader"), prof(2, "leader"), prof(3, "admin")])
        self.assertEqual([p.id for p in shared["4112"]], [1, 2, 3])
        self.assertNotIn("4112", one)

    def test_untied_profiles_ignored(self):
        shared, one = profiles_by_emp([prof(1, "leader", None), prof(2, "guest", "7")])
        self.assertEqual((shared, list(one)), ({}, ["7"]))


if __name__ == "__main__":
    unittest.main()
