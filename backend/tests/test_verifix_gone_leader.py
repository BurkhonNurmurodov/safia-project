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

    def test_egasi_released_owning_and_running_nothing_stops_counting(self):
        acts = verifix_sync.no_cell_acts([leader(260)], {}, {}, set(), {260: self.NOV20}, set())
        self.assertEqual(acts, [("no_cell", {"profile": 260, "name": "L260", "unit": 14,
                                             "date": "2026-11-20"})])

    def test_egasi_released_but_owning_another_cell_is_left(self):
        self.assertEqual(verifix_sync.no_cell_acts(
            [leader(260)], {}, {}, set(), {260: self.NOV20}, {260}), [])

    def test_moved_from_the_transfer_start_hr_dated_back(self):
        # Farrux: released 20 Nov, transferred into 7005 from 16 Nov.
        tr = [(self._d(2025, 3, 1), "171"), (self._d(2026, 11, 16), "7005")]
        self.assertEqual(verifix_sync.move_date("2026-11-20", "7005", tr), "2026-11-16")

    def test_moved_without_a_matching_journal_keeps_the_release_day(self):
        d = self._d
        for tr in ([],                                   # no journal at all
                   [(d(2026, 11, 16), "999")],           # into another unit
                   [(d(2026, 11, 20), "7005")],          # starting on the release day
                   [(d(2026, 11, 25), "7005")],          # starting after it
                   [(d(2026, 9, 1), "7005")]):           # further back than the bound
            self.assertEqual(verifix_sync.move_date("2026-11-20", "7005", tr), "2026-11-20", tr)

    def test_moved_takes_the_latest_start_into_the_unit(self):
        tr = [(self._d(2026, 11, 2), "7005"), (self._d(2026, 11, 16), "7005")]
        self.assertEqual(verifix_sync.move_date("2026-11-20", "7005", tr), "2026-11-16")

    def test_transfer_journal_keeps_posted_rows_of_the_asked_ids(self):
        from contextlib import nullcontext
        from unittest import mock
        page = [{"journal_posted": "Y", "transfers": [
                    {"employee_id": "3172", "org_unit_id": "7005", "transfer_begin": "16.11.2026",
                     "wage": 1},
                    {"employee_id": "9", "org_unit_id": "1", "transfer_begin": "01.11.2026"}]},
                {"journal_posted": "N", "transfers": [
                    {"employee_id": "3172", "org_unit_id": "8", "transfer_begin": "18.11.2026"}]}]
        with mock.patch("app.services.verifix.client", lambda cfg: nullcontext()), \
                mock.patch("app.services.verifix.each_page", lambda *a, **k: iter([page])):
            got = verifix_sync._transfers({}, {"3172"})
        self.assertEqual(got, {"3172": [(self._d(2026, 11, 16), "7005")]})

    def test_unread_journal_holds_recent_acts_and_lets_old_ones_through(self):
        from datetime import timedelta
        from unittest import mock
        today = verifix_sync._today()
        new = {"kind": "no_cell", "profile": 1, "date": today.isoformat()}
        old = {"kind": "no_cell", "profile": 2, "date": (today - timedelta(days=5)).isoformat()}
        other = {"kind": "photo"}
        pl = verifix_sync.Plan()
        pl.auto = [new, old, other]
        ctx = SimpleNamespace(prof_by_id={1: leader(1), 2: leader(2)}, by_emp={})
        ctx.prof_by_id[1].vfx_employee_id, ctx.prof_by_id[2].vfx_employee_id = "e1", "e2"
        db = SimpleNamespace(commit=lambda: None, rollback=lambda: None)

        def down(cfg, emps):
            raise RuntimeError("verifix down")
        with mock.patch.object(verifix_sync, "_transfers", down), \
                mock.patch("app.services.verifix.config", lambda db, **k: {}):
            verifix_sync._date_moves(db, ctx, pl)
        self.assertEqual(pl.deferred, [new])
        self.assertEqual(pl.auto, [old, other])

    def _pick(self, now="7005", was="171", status="W", held=False, cell=None):
        p = SimpleNamespace(id=280, role="leader", vfx_employee_id="e280", vfx_meta={"unit": was})
        ctx = SimpleNamespace(prof_by_id={280: p}, prof_by_emp={"e280": p}, org={},
                              held={("profile", 280)} if held else set(),
                              by_emp={"e280": {"status": status, "unit_id": now, "cell": cell}},
                              unit_keys=lambda mid: {"9123", "9124"} if mid == 10 else set())
        cell = SimpleNamespace(vfx_division_id="171", manager_id=10)
        cache = {10: {"171": "9123", "172": "9124"}}
        return verifix_sync._pick_left(None, ctx, cell, 280, {}, cache)

    def test_hand_pick_moved_out_of_the_units_cells_is_released(self):
        self.assertTrue(self._pick(now="7005"))

    def test_hand_pick_kept_while_still_in_the_unit_or_unchanged(self):
        self.assertFalse(self._pick(now="172"))              # moved to another cell of the unit
        self.assertFalse(self._pick(now="888", cell="9124"))  # a cell Verifix re-made under a new id
        self.assertFalse(self._pick(now="7005", was="7005"))  # always stood there (an «o'rnida»)
        self.assertFalse(self._pick(now="7005", was=None))    # nothing recorded to compare
        self.assertFalse(self._pick(status="D"))              # dismissal has its own path
        self.assertFalse(self._pick(held=True))               # a doubtful tie: nothing automatic

    def test_ended_and_other_roles_untouched(self):
        self.assertEqual(verifix_sync.no_cell_acts(
            [leader(1, ended=self.NOV5), leader(2, role="supervisor")],
            {1: self.NOV5, 2: self.NOV5}, {}, set()), [])


if __name__ == "__main__":
    unittest.main()
