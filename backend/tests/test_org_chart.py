"""The org chart's access answer is the guards' answer (services/org_chart.py)."""
import unittest

from app.services.org_chart import resolve_access

# The Access matrix: supervisors open /staff and /zagruzka, guests nothing.
MATRIX = {"staff": ["supervisor"], "zagruzka": ["supervisor"], "cells": []}


def pages(access):
    return {p["page"] for p in access["pages"]}


class ResolveAccess(unittest.TestCase):
    def test_role_pages_alone(self):
        got = resolve_access("supervisor", MATRIX)
        self.assertEqual(pages(got), {"staff", "zagruzka"})
        self.assertTrue(all(p["role"] and not p["grant"] for p in got["pages"]))
        self.assertEqual(got["denied"], [])

    def test_admin_opens_everything(self):
        self.assertTrue(resolve_access("admin", MATRIX)["all"])

    def test_position_grant_opens_a_page_for_a_guest(self):
        got = resolve_access("guest", MATRIX, {"page.view.cells": "all"})
        self.assertEqual(pages(got), {"cells"})
        row = got["pages"][0]
        self.assertFalse(row["role"])
        self.assertEqual(row["grant"], "all")

    def test_position_deny_closes_a_role_page(self):
        got = resolve_access("supervisor", MATRIX, None, ["page.view.staff"])
        self.assertEqual(pages(got), {"zagruzka"})
        self.assertEqual(got["denied"], ["staff"])

    def test_account_grant_reopens_a_position_deny(self):
        got = resolve_access("supervisor", MATRIX, None, ["page.view.staff"],
                             {"page.view.staff": "own"}, None, account=True)
        self.assertIn("staff", pages(got))
        self.assertEqual(got["denied"], [])

    def test_account_deny_closes_a_role_page_and_a_position_grant(self):
        got = resolve_access("supervisor", MATRIX, {"page.view.cells": "all"}, None,
                             None, ["page.view.staff", "page.view.cells"], account=True)
        self.assertEqual(pages(got), {"zagruzka"})
        self.assertEqual(got["denied"], ["cells", "staff"])

    def test_account_entries_are_ignored_for_the_position(self):
        # A password session holds the position's entries only.
        got = resolve_access("guest", MATRIX, None, None, {"page.view.cells": "all"})
        self.assertEqual(pages(got), set())

    def test_action_capability_implies_its_page_and_tab(self):
        got = resolve_access("guest", MATRIX, {"staff.documents.approve": "own",
                                              "admin.users.manage": "all"})
        self.assertEqual(pages(got), {"staff"})
        self.assertEqual(got["pages"][0]["caps"], ["staff.documents.approve"])
        self.assertEqual(got["tabs"], ["users"])
        self.assertEqual(got["caps"]["staff.documents.approve"], "own")

    def test_leaders_admin_reads_the_page_whole(self):
        got = resolve_access("guest", MATRIX, {"leaders.admin": "all"})
        row = next(p for p in got["pages"] if p["page"] == "leaders")
        self.assertEqual(row["grant"], "all")
        self.assertEqual(set(got["tabs"]), {"ltasks", "ltdaily", "ltexclude", "ltcutoff"})

    def test_unknown_capability_is_dropped(self):
        got = resolve_access("guest", MATRIX, {"gone.capability": "all"})
        self.assertEqual(got["caps"], {})


if __name__ == "__main__":
    unittest.main()
