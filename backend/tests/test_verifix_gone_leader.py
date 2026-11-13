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


def leader(pid, meta=None, ended=None, role="leader"):
    return SimpleNamespace(id=pid, name=f"L{pid}", manager_id=14, role=role,
                           ended_on=ended, vfx_meta=meta)


class NoCell(unittest.TestCase):
    """A leader who runs no cell owes nothing (Jozilov Diyor, 13 Nov)."""
    from datetime import date as _d
    NOV5, NOV20 = _d(2026, 11, 5), _d(2026, 11, 20)

    def test_released_and_running_nothing_stops_counting(self):
        acts = verifix_sync.no_cell_acts([leader(309)], {309: self.NOV5}, {}, set())
        self.assertEqual(acts, [("no_cell", {"profile": 309, "name": "L309", "unit": 14,
                                             "date": "2026-11-05"})])

    def test_still_running_a_cell_owes(self):
        self.assertEqual(verifix_sync.no_cell_acts([leader(309)], {309: self.NOV5}, {}, {309}), [])

    def test_never_had_a_cell_is_left_to_leader_load(self):
        self.assertEqual(verifix_sync.no_cell_acts([leader(309)], {}, {}, set()), [])

    def test_marked_once(self):
        p = leader(309, {"nocell_from": "2026-11-05"})
        self.assertEqual(verifix_sync.no_cell_acts([p], {309: self.NOV5}, {}, set()), [])

    def test_a_cell_again_counts_again_from_its_day(self):
        p = leader(309, {"nocell_from": "2026-11-05"})
        acts = verifix_sync.no_cell_acts([p], {309: self.NOV5}, {309: self.NOV20}, {309})
        self.assertEqual(acts[0][0], "cell_back")
        self.assertEqual((acts[0][1]["date"], acts[0][1]["back"]), ("2026-11-05", "2026-11-20"))

    def test_ended_and_other_roles_untouched(self):
        self.assertEqual(verifix_sync.no_cell_acts(
            [leader(1, ended=self.NOV5), leader(2, role="supervisor")],
            {1: self.NOV5, 2: self.NOV5}, {}, set()), [])


if __name__ == "__main__":
    unittest.main()
