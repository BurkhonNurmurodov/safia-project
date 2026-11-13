"""A leader who left before being tied is tied by the pass and then ended
(docs/cells-and-org.md «A leader who left is ENDED by Verifix»). Pure rule —
no database: `_gone_leader` against a hand-built org.

    ./venv/bin/python -m unittest tests.test_verifix_gone_leader
"""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import verifix_org, verifix_sync
from app.services.name_map import _name_tokens


def row(eid, name, status="W", dismissed=None):
    toks = _name_tokens(name)
    return {"id": eid, "name": name, "status": status, "dismissed": dismissed, "cell": None,
            "toks": toks, "full": " ".join(toks), "two": " ".join(toks[:2])}


def ctx(rows, tied=()):
    work = [r for r in rows if r["status"] == "W"]
    return SimpleNamespace(
        hand={}, own_keys=lambda p: set(), unit_keys=lambda mid: set(),
        working=verifix_org.index(work), gone=verifix_org.index([r for r in rows if r["status"] != "W"]),
        working_rows=work, prof_by_emp={e: 1 for e in tied}, shared_emp={}, unit_by_emp={})


class Plan:
    def __init__(self):
        self.auto = []

    def act(self, kind, cap=None, **kw):
        self.auto.append({"kind": kind, **kw})


LEADER = SimpleNamespace(id=7, name="Karimova Dilnoza", manager_id=3,
                         created_at=datetime(2026, 9, 10, tzinfo=timezone.utc))


class GoneLeader(unittest.TestCase):
    def plan(self, rows, **kw):
        pl = Plan()
        got = verifix_sync._gone_leader(pl, ctx(rows, **kw), LEADER)
        return got, pl.auto

    def test_one_dismissed_namesake_is_tied(self):
        got, acts = self.plan([row("e1", "KARIMOVA DILNOZA ALISHER QIZI", "D", "2026-11-02")])
        self.assertTrue(got)
        self.assertEqual(acts[0]["kind"], "tie_gone")
        self.assertEqual(acts[0]["emp"]["id"], "e1")

    def test_working_namesake_wins(self):
        got, _ = self.plan([row("e1", "KARIMOVA DILNOZA", "D", "2026-11-02"),
                            row("e2", "KARIMOVA DILNOZA")])
        self.assertFalse(got)

    def test_two_dismissed_namesakes_are_nobody(self):
        got, _ = self.plan([row("e1", "KARIMOVA DILNOZA ALISHER QIZI", "D", "2026-11-02"),
                            row("e2", "KARIMOVA DILNOZA BAXTIYOR QIZI", "D", "2026-10-02")])
        self.assertFalse(got)

    def test_left_long_before_the_profile_is_somebody_else(self):
        got, _ = self.plan([row("e1", "KARIMOVA DILNOZA", "D", "2024-03-01")])
        self.assertFalse(got)

    def test_already_tied_to_another_profile(self):
        got, _ = self.plan([row("e1", "KARIMOVA DILNOZA", "D", "2026-11-02")], tied=("e1",))
        self.assertFalse(got)


if __name__ == "__main__":
    unittest.main()
