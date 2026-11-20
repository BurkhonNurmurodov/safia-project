"""A leader deletes no concern at all (the operator, 2026-11-20).

`DELETE /api/concerns/{id}` refuses the role «leader» before it reads the row —
with the page's admin grant too — and the row's `can_delete` never offers it to
a leader. Runs without Postgres: the refusal must not touch the database.
"""
import unittest

from fastapi import HTTPException

from app.routers import concerns


class _NoDB:
    """A session that fails the test the moment anything asks it a question."""

    def __getattr__(self, name):
        raise AssertionError(f"the leader's refusal touched the database ({name})")


class _EmptyDB:
    """A session whose every lookup finds nothing (→ the 404 after the rule)."""

    def query(self, *_a, **_k):
        return self

    def filter(self, *_a, **_k):
        return self

    def first(self):
        return None


class LeaderDeleteTest(unittest.TestCase):
    def test_leader_is_refused_before_the_row_is_read(self):
        with self.assertRaises(HTTPException) as hit:
            concerns.delete_concern(
                concern_id=1, db=_NoDB(),
                payload={"role": "leader", "role_id": 5, "role_ref": "leader:5"},
            )
        self.assertEqual(hit.exception.status_code, 403)
        self.assertEqual(hit.exception.detail, concerns.LEADER_DELETE_REFUSED)
        self.assertIn("leader", hit.exception.detail.lower())

    def test_other_roles_pass_the_role_rule(self):
        # They reach the row lookup — here an empty one, so a 404, never the
        # leader's 403. The row's own check still decides after that.
        for role in ("admin", "supervisor", "shift-manager", "top-manager"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as hit:
                concerns.delete_concern(concern_id=1, db=_EmptyDB(),
                                        payload={"role": role, "role_id": 1})
            self.assertEqual(hit.exception.status_code, 404)

    def test_may_delete_is_everybody_but_a_leader(self):
        self.assertFalse(concerns.may_delete("leader"))
        for role in ("admin", "supervisor", "shift-manager", "top-manager", None):
            self.assertTrue(concerns.may_delete(role))


if __name__ == "__main__":
    unittest.main()
