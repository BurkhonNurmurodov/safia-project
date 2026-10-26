"""A leader whose cells end up in TWO units after a move (2026-10-26, fix set 3
of docs/plan-catalog-follows-cells.md).

A cell's positions follow it to its new brigadir (`catalog_follow`). A leader
L who runs c (moves X → Y, carries the plan) and c2 (stays in X, no plan) then
has a catalog in BOTH units from the move day. `cells_unit_for_leader` answers
None for them, and until this fix their /production page and the automatic
checks #1 / #9 / #11 read L's own profile unit X — where c's positions no
longer are — so #1 and #9 failed `no_plan` every day after the move (before
this feature the moved cell's lines stayed in X, so it is a regression the
follow introduced). Now:

* `cell_lookup.cells_units_for_leader` lists every unit, most cells first, ties
  by unit id; `cells_unit_for_leader` keeps its contract;
* the page opens on the first of them, can switch to the other
  (`?manager_id=`, `leader_units` on the dashboard), and each unit's page and
  writes are cut to the leader's cells standing there;
* the checks read every unit (`_Ctx.by_unit`) and pass on any one cell;
* a leader with one unit reads exactly what they read before.

Runs over the REAL follow (the engine's world, `test_catalog_follow_engine`)
against a scratch Postgres database (`SAFIA_TEST_PG`, see `pg_scratch`).

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_leader_two_units
"""
from __future__ import annotations

import unittest
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

try:
    from tests.pg_scratch import SERVER
    from tests.test_catalog_follow_engine import _World, C, D, TZ
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER
    from test_catalog_follow_engine import _World, C, D, TZ

from app.routers import production
from app.services import cell_lookup, leader_auto, pp_catalog

# Y's id is the LOWER one: c and c2 are one cell each, so the tie is broken by
# the unit id and L's page opens on Y — the unit carrying the plan.
X, Y = 7, 6
B = "B100"          # c2's work centre, staying in X
E = "E200"          # a single-unit leader's work centre in X
BEFORE = D - timedelta(days=1)


class _Base(_World):
    def setUp(self):
        from app import models as m
        db = self.pg.Session()
        # Rows the engine's fixture does not clear, before the tables they
        # point at.
        for t in (m.LeaderAutoCheck, m.ActionLog, m.CellArchiveSpan, m.CellLinkEvent,
                  m.Cell, m.RoleProfile):
            db.query(t).delete()
        db.commit()
        db.close()
        super().setUp()

    def leader(self, name, unit, *cells):
        from app.models import RoleProfile
        p = RoleProfile(role="leader", name=name, manager_id=unit)
        self.db.add(p)
        self.db.flush()
        for c in cells:
            c.leader_id = p.id
        self.db.flush()
        return p

    def world(self, c2_plan=None):
        """L runs c (C, X → Y on D, its line F001 planned 20 / made 10, its
        people typed) and c2 (B, staying in X; F003 planned only with
        `c2_plan` = (plan, made)). L2 runs c3 (E, X) alone — the single-unit
        control."""
        self.units(X, Y)
        self.enable()
        c = self.cell("0701", X)
        c2 = self.cell("0702", X, sap=B)
        c3 = self.cell("0703", X, sap=E)
        lead = self.leader("Lider Bir", X, c, c2)
        lead2 = self.leader("Lider Ikki", X, c3)
        self.line(X, "F001", "Tort", wc=C, labor=60, sort=0)
        self.line(X, "F003", "Non", wc=B, labor=60, sort=1)
        self.line(X, "F005", "Pirog", wc=E, labor=60, sort=2)
        for day in (BEFORE, D):
            self.daily(X, day, "F001", wc=C, plan=20, actual=10)
            self.daily(X, day, "F005", wc=E, plan=10, actual=8)
            if c2_plan:
                self.daily(X, day, "F003", wc=B, plan=c2_plan[0], actual=c2_plan[1])
            self.pin(X, day, wc=C, people=3)
            self.pin(X, day, wc=E, people=2)
        self.db.flush()
        self.event(c, Y)
        self.db.commit()
        self.land()
        self.assertEqual(self.follow().state, "moved")
        return lead, lead2, c, c2, c3

    def check(self, lead, day, check):
        from app.models import Manager
        due = datetime.combine(day, time(14), tzinfo=TZ)
        return leader_auto.evaluate(
            self.db, prof=lead, manager=self.db.get(Manager, lead.manager_id), shift=1,
            date=day.isoformat(), cell=None, check=check, target=30.0, due=due, now=due)

    def ctx(self, lead, day, unit=None):
        from app.models import Manager
        due = datetime.combine(day, time(14), tzinfo=TZ)
        return leader_auto._Ctx(self.db, lead, self.db.get(Manager, lead.manager_id), 1,
                                day.isoformat(), None, due, due, unit=unit)

    @staticmethod
    def payload(lead):
        return {"role": "leader", "role_id": lead.manager_id, "sub": "1",
                "full_name": lead.name}

    @contextmanager
    def as_leader(self, lead):
        with mock.patch.object(production, "viewer_leader_profile_id",
                               lambda db, payload: lead.id), \
                mock.patch.object(production, "page_scope_is_all",
                                  lambda db, payload, page: False):
            yield


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class TheUnitsOfALeader(_Base):
    def test_most_cells_first_ties_by_id(self):
        self.units(3, 9)
        lead = self.leader("Lider Bir", 3)
        a = self.cell("0901", 9)
        b = self.cell("0902", 9, sap=B)
        c = self.cell("0301", 3, sap=E)
        for x in (a, b, c):
            x.leader_id = lead.id
        self.db.commit()
        self.forget()
        # Two cells in 9, one in 3: 9 first, by count — dated or not.
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id), [9, 3])
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [9, 3])
        self.assertIsNone(cell_lookup.cells_unit_for_leader(self.db, lead.id, D))
        b.manager_id = 3
        self.db.commit()
        self.forget()
        # One each: the lower id.
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id), [3, 9])
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, None), [])
        # The scope cut to one unit.
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, lead.id, unit=9), {C})
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, lead.id, D, unit=3), {B, E})
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, lead.id, D, unit=9),
                         {(C, None)})

    def test_the_move_puts_the_cells_in_two_units(self):
        lead, lead2, c, c2, _c3 = self.world()
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [Y, X])
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, BEFORE), [X])
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id), [Y, X])
        # The one-unit answer keeps its contract: None for two, the unit for one.
        self.assertIsNone(cell_lookup.cells_unit_for_leader(self.db, lead.id, D))
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, lead.id, BEFORE), X)
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead2.id, D), [X])
        self.assertEqual([x.id for x in cell_lookup.leader_cells_in(self.db, lead.id, X, D)],
                         [c2.id])
        self.assertEqual([x.id for x in cell_lookup.leader_cells_in(self.db, lead.id, X, BEFORE)],
                         sorted([c.id, c2.id]))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class TheChecksReadEveryUnit(_Base):
    def test_plan_staffing_passes_on_the_moved_cell(self):
        lead, *_ = self.world()
        v = self.check(lead, D, "plan_staffing")
        self.assertEqual((v.outcome, v.code), (leader_auto.PASSED, "ok"), v)
        self.assertEqual(v.facts["filled"], ["0701"])
        self.assertEqual(v.facts["untyped"], ["0702"])
        self.assertEqual((v.facts["lines"], v.facts["with_plan"], v.facts["cells"]), (2, 1, 2))
        self.assertEqual(v.facts["units"], [
            {"unit": Y, "unit_name": f"Unit {Y}", "lines": 1, "with_plan": 1, "cells": 1,
             "untyped": [], "filled": ["0701"]},
            {"unit": X, "unit_name": f"Unit {X}", "lines": 1, "with_plan": 0, "cells": 1,
             "untyped": ["0702"], "filled": []},
        ])
        # Read in X alone — what the check did before the fix, falling back to
        # L's profile unit — the moved cell's plan is nowhere.
        alone = leader_auto._RUNNERS["plan_staffing"](self.ctx(lead, D, unit=X), None)
        self.assertEqual((alone.outcome, alone.code), (leader_auto.FAILED, "no_plan"))

    def test_plan_pct_passes_on_the_moved_cell(self):
        lead, *_ = self.world()
        v = self.check(lead, D, "plan_pct")
        self.assertEqual((v.outcome, v.code), (leader_auto.PASSED, "ok"), v)
        self.assertEqual((v.facts["best"], v.facts["best_pct"]), ("0701", 50.0))
        self.assertEqual((v.facts["pct"], v.facts["plan_min"], v.facts["fact_min"]),
                         (50.0, 20.0, 10.0))
        self.assertEqual(v.facts["by_cell"], [{"cell": "0701", "pct": 50.0, "plan_min": 20.0,
                                               "fact_min": 10.0}])
        self.assertEqual([(u["unit"], u["pct"], u["plan_min"], u["cells"])
                          for u in v.facts["units"]],
                         [(Y, 50.0, 20.0, ["0701"]), (X, 0.0, 0.0, [])])
        alone = leader_auto._RUNNERS["plan_pct"](self.ctx(lead, D, unit=X), 30.0)
        self.assertEqual(alone.code, "no_plan")

    def test_combined_figure_and_any_cell(self):
        """c2 carries a plan too (8 of 10 in X): the combined «Bajarish %» is
        Σ fact ÷ Σ plan over both units, and the best cell — c2's 80% — is in
        the unit the page does NOT open on."""
        lead, *_ = self.world(c2_plan=(10, 8))
        v = self.check(lead, D, "plan_pct")
        self.assertEqual((v.outcome, v.facts["best"], v.facts["best_pct"]),
                         (leader_auto.PASSED, "0702", 80.0))
        self.assertEqual((v.facts["pct"], v.facts["plan_min"], v.facts["fact_min"]),
                         (60.0, 30.0, 18.0))
        v1 = self.check(lead, D, "plan_staffing")
        # c2 has a plan but no people: only c is filled.
        self.assertEqual((v1.outcome, v1.facts["filled"], v1.facts["with_plan"]),
                         (leader_auto.PASSED, ["0701"], 2))

    def test_staff_list_reads_each_cell_in_its_unit(self):
        """#11 judges every planned cell against its OWN unit's page: c is
        planned (in Y), c2 is not (in X). Read in X alone, c would be «no
        plan» and skipped."""
        lead, *_ = self.world()
        v = self.check(lead, D, "staff_list")
        self.assertEqual(v.facts["no_plan"], ["0702"])
        self.assertEqual(v.facts["empty"], ["0701"])      # planned, nobody on its list
        self.assertEqual([(u["unit"], u["cells"], u["planned"]) for u in v.facts["units"]],
                         [(Y, ["0701"], ["0701"]), (X, ["0702"], [])])
        self.assertEqual(v.outcome, leader_auto.PASSED)

    def test_the_day_before_the_move_is_one_unit(self):
        lead, *_ = self.world()
        ctx = self.ctx(lead, BEFORE)
        self.assertEqual(ctx.by_unit(), [ctx])
        self.assertEqual(ctx.unit_id, X)
        for chk in ("plan_staffing", "plan_pct"):
            v = self.check(lead, BEFORE, chk)
            self.assertEqual(v.outcome, leader_auto.PASSED, (chk, v))
            self.assertNotIn("units", v.facts)
        v = self.check(lead, BEFORE, "plan_staffing")
        self.assertEqual((v.facts["filled"], v.facts["cells"]), (["0701"], 2))
        v = self.check(lead, BEFORE, "staff_list")
        self.assertNotIn("units", v.facts)
        self.assertEqual(v.facts["no_plan"], ["0702"])

    def test_context_over_two_units(self):
        """The context's single-page attributes — what the warning card, the
        objection timing and the restore replay read — name the unit the page
        opens on, and each per-unit context its own."""
        lead, _l2, c, c2, _c3 = self.world()
        ctx = self.ctx(lead, D)
        self.assertTrue(ctx.several)
        self.assertEqual(ctx.unit_id, Y)
        subs = ctx.by_unit()
        self.assertEqual([s.unit_id for s in subs], [Y, X])
        self.assertEqual([[x.id for x in s.cells] for s in subs], [[c.id], [c2.id]])
        self.assertEqual([s.pairs for s in subs], [{(C, None)}, {(B, None)}])
        self.assertEqual(ctx.pairs, {(C, None), (B, None)})
        self.assertEqual({r["sap_code"] for r in ctx.dashboard["rows"]}, {"F001"})
        self.assertEqual(ctx.code_totals(B)["total_plan_labor"], 0)
        self.assertEqual(ctx.code_totals(C)["total_plan_labor"], 20.0)

    def test_single_unit_leader_unchanged(self):
        _lead, lead2, *_ = self.world()
        from app.routers.production import _build_dashboard
        for day in (BEFORE, D):
            ctx = self.ctx(lead2, day)
            self.assertFalse(ctx.several)
            self.assertIs(ctx.by_unit()[0], ctx)
            self.assertEqual(ctx.unit_id, X)
            direct = _build_dashboard(self.db, X, day, wc_scope={E}, payload=None,
                                      group_scope={(E, None)})
            self.assertEqual(ctx.dashboard["rows"], direct["rows"])
            v = self.check(lead2, day, "plan_staffing")
            self.assertEqual(v.facts, {"lines": 1, "with_plan": 1, "cells": 1,
                                       "untyped": [], "filled": ["0703"]})
            v = self.check(lead2, day, "plan_pct")
            self.assertEqual(v.facts, {"target": 30.0, "pct": 80.0, "plan_min": 10.0,
                                       "fact_min": 8.0,
                                       "by_cell": [{"cell": "0703", "pct": 80.0,
                                                    "plan_min": 10.0, "fact_min": 8.0}],
                                       "best": "0703", "best_pct": 80.0})

    def test_warning_card_counts_every_unit(self):
        from app.models import Manager
        from app.services import leader_auto_rich
        lead, *_ = self.world(c2_plan=(10, 8))
        due = datetime.combine(D, time(14), tzinfo=TZ)
        snap = leader_auto_rich.snapshot(self.db, lead, self.db.get(Manager, X), "plan_pct",
                                         30.0, due, due, date=D.isoformat())
        self.assertNotIn("error", snap)
        self.assertEqual(snap["positions"], 2)            # F001 in Y, F003 in X

    def _timing(self, c2_plan):
        from app.models import LeaderAutoCheck
        from app.services import auto_check_timing, leader_dispute
        lead, *_ = self.world(c2_plan=c2_plan)
        due = datetime.combine(D, time(14), tzinfo=TZ)
        self.db.add(LeaderAutoCheck(leader_id=lead.id, date=D.isoformat(), task_id=9,
                                    manager_id=X, check="plan_pct", due_at=due,
                                    checked_at=due, outcome=leader_auto.FAILED,
                                    code="under_target", facts={"target": 90},
                                    entry_id=8123))
        self.db.commit()
        entry = SimpleNamespace(id=8123)
        with mock.patch.object(leader_dispute, "auto_entry", lambda db, d: entry):
            got = auto_check_timing.for_dispute(self.db, SimpleNamespace(ref="bot:1"),
                                                now=due + timedelta(hours=1))
        self.assertEqual(got["check"], "plan_pct")
        return got

    def test_objection_timing_reads_every_unit(self):
        # c2's 80% is X's page: read in Y alone (the unit the page opens on)
        # it would not be there.
        self.assertEqual(self._timing((10, 8))["now_pct"], 80.0)

    def test_objection_timing_reads_the_moved_cell(self):
        # c's 50% is Y's page: read in L's profile unit X alone (before the
        # fix) only c2's 20% would be there.
        self.assertEqual(self._timing((10, 2))["now_pct"], 50.0)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class ThePageSwitchesUnits(_Base):
    def dash(self, lead, day, mid=None):
        with self.as_leader(lead):
            return production.get_dashboard(date=day.isoformat(), manager_id=mid,
                                            payload=self.payload(lead), db=self.db)

    @staticmethod
    def rows(dash):
        return {r["sap_code"] for r in dash["rows"]}

    def test_opens_on_the_unit_with_the_plan_and_switches(self):
        lead, *_ = self.world()
        on = self.dash(lead, D)
        self.assertEqual(on["manager_id"], Y)
        self.assertEqual(self.rows(on), {"F001"})
        self.assertEqual(on["scope"]["cells"], [C])
        self.assertEqual(on["leader_units"], [
            {"id": Y, "name": f"Unit {Y}", "cells": ["0701"]},
            {"id": X, "name": f"Unit {X}", "cells": ["0702"]},
        ])
        other = self.dash(lead, D, X)
        self.assertEqual(other["manager_id"], X)
        # X's page is cut to the cell L runs THERE: c2's work centre, not c's.
        self.assertEqual(other["scope"]["cells"], [B])
        self.assertEqual(self.rows(other), {"F003"})
        self.assertEqual(other["leader_units"], on["leader_units"])
        # A unit that is not one of theirs: the default.
        self.assertEqual(self.dash(lead, D, 999)["manager_id"], Y)

    def test_the_day_before_is_one_unit(self):
        lead, *_ = self.world()
        before = self.dash(lead, BEFORE)
        self.assertEqual(before["manager_id"], X)
        self.assertNotIn("leader_units", before)
        self.assertEqual(before["scope"]["cells"], sorted([C, B]))
        self.assertEqual(self.rows(before), {"F001", "F003"})
        # Y is not theirs that day.
        self.assertEqual(self.dash(lead, BEFORE, Y)["manager_id"], X)

    def test_single_unit_leader_unchanged(self):
        _lead, lead2, *_ = self.world()
        d = self.dash(lead2, D)
        self.assertEqual(d["manager_id"], X)
        self.assertNotIn("leader_units", d)
        self.assertEqual(d["scope"]["cells"], [E])
        self.assertEqual(self.rows(d), {"F005"})

    def test_writes_follow_the_chosen_unit(self):
        from app.models import PPLineDaily
        lead, *_ = self.world()
        pl = self.payload(lead)

        def key(unit, sap):
            lines = pp_catalog.at(self.db, unit, D).lines
            p = next(p for p in lines if p.sap_code == sap)
            return production.line_keys(lines)[p.id]

        body = lambda sap, wc, val, k: production.OverrideBody(  # noqa: E731
            date=D.isoformat(), sap_code=sap, work_center=wc, field="plan", value=val,
            line_key=k)
        with self.as_leader(lead):
            production.set_override(body=body("F001", C, 21, key(Y, "F001")),
                                    manager_id=None, payload=pl, db=self.db)
            production.set_override(body=body("F003", B, 4, key(X, "F003")),
                                    manager_id=X, payload=pl, db=self.db)
            # c's work centre is not L's on X's page.
            with self.assertRaises(HTTPException) as err:
                production.set_override(body=body("F001", C, 5, key(Y, "F001")),
                                        manager_id=X, payload=pl, db=self.db)
        self.assertEqual(err.exception.status_code, 403)
        got = {(r.manager_id, r.work_center): float(r.plan_override)
               for r in self.db.query(PPLineDaily).filter(PPLineDaily.date == D).all()}
        self.assertEqual(got, {(Y, C): 21.0, (X, B): 4.0})

    def test_staffing_follows_the_chosen_unit(self):
        """The «Bugungi fakt» save is cut like the page: c's people go to Y,
        c2's to X, and c's work centre is refused on X's page. c2 is given a
        plan: a headcount is typed only where the day plans (v4.332)."""
        from app.models import PPWorkCenterDaily
        lead, *_ = self.world(c2_plan=(5, 1))
        pl = self.payload(lead)

        def body(wc, people):
            return production.StaffingBody(
                date=D.isoformat(), rows=[production.StaffingRow(work_center=wc, people=people)])

        with self.as_leader(lead):
            production.save_staffing(body=body(C, 4), manager_id=None, payload=pl, db=self.db)
            production.save_staffing(body=body(B, 2), manager_id=X, payload=pl, db=self.db)
            with self.assertRaises(HTTPException) as err:
                production.save_staffing(body=body(C, 7), manager_id=X, payload=pl, db=self.db)
        self.assertEqual(err.exception.status_code, 403)
        got = {(r.manager_id, r.work_center): r.people
               for r in self.db.query(PPWorkCenterDaily).filter(
                   PPWorkCenterDaily.date == D, PPWorkCenterDaily.people.isnot(None)).all()}
        self.assertEqual(got[(Y, C)], 4)
        self.assertEqual(got[(X, B)], 2)
        self.assertNotEqual(got.get((X, C)), 7)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class ArchivedCellsDoNotMakeAUnit(_Base):
    """An archived cell keeps its `leader_id` and its brigadir. Counted, it
    made a leader whose OLD cell was archived in another unit a «two-unit»
    leader: their page opened on that unit — somebody else's positions at the
    old cell's work centre — and #9 passed on that work centre's 90% while
    their own cell stood at 10%. Only the cells that exist on the day count
    (the cells `leader_auto.cells_run_on` checks); the leader reads exactly
    what they read before this fix set."""

    def world(self, archived=D - timedelta(days=5)):
        """L runs a (E, in X, 1 of 10 made, people typed) and ran b (B, in Y,
        archived on `archived`); L4 now runs b4 at B in Y, 9 of 10 made."""
        self.units(X, Y)
        self.enable()
        a = self.cell("0801", X, sap=E)
        b = self.cell("0802", Y, sap=B)
        b4 = self.cell("0804", Y, sap=B)
        lead = self.leader("Lider Bir", X, a, b)
        self.leader("Lider Tort", Y, b4)
        if archived is not None:
            b.archived_at = datetime.combine(archived, time(10), tzinfo=TZ)
        self.line(X, "F005", "Pirog", wc=E, labor=60, sort=0)
        self.line(Y, "F003", "Non", wc=B, labor=60, sort=0)
        self.daily(X, D, "F005", wc=E, plan=10, actual=1)
        self.daily(Y, D, "F003", wc=B, plan=10, actual=9)
        self.pin(X, D, wc=E, people=2)
        self.db.commit()
        self.forget()
        return lead, a, b

    def test_an_archived_cell_is_not_a_unit(self):
        lead, *_ = self.world()
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [X])
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id), [X])
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, lead.id, D), X)
        with self.as_leader(lead):
            page = production.get_dashboard(date=D.isoformat(), manager_id=None,
                                            payload=self.payload(lead), db=self.db)
            # Y is not one of theirs to switch to either.
            other = production.get_dashboard(date=D.isoformat(), manager_id=Y,
                                             payload=self.payload(lead), db=self.db)
        self.assertEqual((page["manager_id"], other["manager_id"]), (X, X))
        self.assertNotIn("leader_units", page)
        self.assertEqual({r["sap_code"] for r in page["rows"]}, {"F005"})
        # #9 judges THEIR cell's 10%, never b4's 90% at the old cell's work centre.
        v = self.check(lead, D, "plan_pct")
        self.assertEqual((v.outcome, v.code), (leader_auto.FAILED, "under_target"), v)
        self.assertEqual(v.facts["by_cell"], [{"cell": "0801", "pct": 10.0, "plan_min": 10.0,
                                               "fact_min": 1.0}])
        self.assertNotIn("units", v.facts)
        v = self.check(lead, D, "plan_staffing")
        self.assertEqual(v.facts, {"lines": 1, "with_plan": 1, "cells": 1,
                                   "untyped": [], "filled": ["0801"]})

    def test_alive_on_its_archive_day(self):
        """The archive day itself still counts the cell (`cell_archive.alive`):
        that day is a two-unit day."""
        lead, *_ = self.world(archived=D)
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [Y, X])

    def test_every_cell_archived_counts_them_all(self):
        """A leader whose every cell is archived is placed by all of them, as
        before: the unit they last stood in."""
        lead, a, _b = self.world()
        a.archived_at = datetime.combine(D - timedelta(days=5), time(10), tzinfo=TZ)
        a.manager_id = Y
        self.db.commit()
        self.forget()
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [Y])
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, lead.id, D), Y)

    def test_switch_lists_only_cells_that_exist(self):
        """Two live units plus an archived cell in one of them: the switch names
        the live cells only."""
        lead, a, b = self.world()
        c = self.cell("0803", Y, sap=C)
        c.leader_id = lead.id
        self.db.commit()
        self.forget()
        # One live cell each: the lower id first.
        self.assertEqual(cell_lookup.cells_units_for_leader(self.db, lead.id, D), [Y, X])
        with self.as_leader(lead):
            page = production.get_dashboard(date=D.isoformat(), manager_id=None,
                                            payload=self.payload(lead), db=self.db)
        self.assertEqual(page["leader_units"], [
            {"id": Y, "name": f"Unit {Y}", "cells": ["0803"]},
            {"id": X, "name": f"Unit {X}", "cells": ["0801"]},
        ])


if __name__ == "__main__":
    unittest.main()
