"""«The catalog follows its cells», END TO END (2026-10-26, WP7 of
docs/plan-catalog-follows-cells.md, §4).

The per-package tests drive each piece directly. These drive the platform the
way a day does: a brigadir change is asked through a real door
(`cell_register.set_unit`, the /cells form's PUT, a «Verifix sinxron» tap), it
lands through `cell_links.apply_due` at its opening, the positions follow
through the minute job `catalog_follow.run_sweep` (on, as once the
retroactive one-shot reads `done`), and every figure is then READ through the
platform's own readers — the «Zagruzka fayli» dashboard (unit and leader),
`zagruzka_source`, «Yacheyka zagruzkasi», /live's plan, «Plan Bajarish» (see
`catalog_follow_fixtures`).

What every move scenario proves, beside its own assertions:

* every day before the move reads exactly what it read before the move was
  even asked — in every reader, for both units;
* from the move day the cell's minutes, people, letters and pins are the new
  unit's and gone from the old one, the cell's own figures unchanged;
* Σ over the units of each reader's minutes and typed people is conserved
  per day (a join may only lower it);
* no catalog id sits in two units' catalogs on one day (§1.2).

A failing assertion that exposes a defect in the merged code is NOT fixed
here: it is left failing, marked «DEFECT», and reported.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_catalog_follow_e2e
"""
from __future__ import annotations

import unittest
from datetime import timedelta
from decimal import Decimal

try:
    from tests.catalog_follow_fixtures import (
        ADMIN, B, C, D, E, SERVER, World, X, Y, Z, at_, dash_figures, days, dumps,
    )
except ImportError:  # run from inside tests/
    from catalog_follow_fixtures import (
        ADMIN, B, C, D, E, SERVER, World, X, Y, Z, at_, dash_figures, days, dumps,
    )

from fastapi import HTTPException

from app.services import catalog_follow as cf
from app.services import pp_catalog

ASK = at_(D - timedelta(days=1))        # the move is asked on D−1 at 14:00 → lands D 08:00
HIST = (D - timedelta(days=3), D - timedelta(days=1))
POST = (D, D + timedelta(days=2))


class _E2E(World):
    """Assertions the scenarios share."""

    def assert_history_kept(self, before: dict, units, a=HIST[0], b=HIST[1]):
        """Every reader, read over the days before the move, answers what it
        answered before the move was asked. «Plan Bajarish»'s `cells` is its
        FILTER's option list — the register as it stands now (each cell's
        current brigadir), not a figure of those days — and is left out."""
        after = self.reads(units, a, b)
        for r in (before, after):
            r["plan"] = {k: v for k, v in r["plan"].items() if k != "cells"}
        for name in before:
            self.assertEqual(dumps(after[name]), dumps(before[name]), f"{name}: days < D moved")

    def assert_span_consistent(self, units, a, mid, b, *, zc_letter=True):
        """A range read ACROSS a move day answers each day exactly what a
        range on its own side answers — the day-keyed readers, «Yacheyka
        zagruzkasi»'s cell inputs and «Plan Bajarish»'s days alike.
        `zc_letter=False` compares «Yacheyka zagruzkasi»'s figures without the
        letter it prints beside each cell (see `test_t5_letter_printed_across_the_move`)."""
        whole = self.reads(units, a, b)
        left = self.reads(units, a, mid - timedelta(days=1))
        right = self.reads(units, mid, b)
        for name in ("at", "wc_labor", "unit_labor", "wc_group_labor", "cell_labor", "typed_pins",
                     "typed_people", "cell_pins", "dashboard", "live", "fleet", "idle"):
            joined = {**left[name], **right[name]}
            self.assertEqual(dumps(whole[name]), dumps(joined), f"{name} read across {mid}")
        for u in units:
            joined = {}
            for part in (left, right):
                for code, by_day in (part["zagruzka_cell"][u].get("inputs") or {}).items():
                    joined.setdefault(code, {}).update(by_day)
            got = {code: by_day for code, by_day in
                   (whole["zagruzka_cell"][u].get("inputs") or {}).items() if by_day}
            joined = {code: by_day for code, by_day in joined.items() if by_day}
            if not zc_letter:
                got, joined = ({code: {k: {f: v for f, v in inp.items() if f != "wc_group"}
                                       for k, inp in by_day.items()}
                                for code, by_day in r.items()} for r in (got, joined))
            self.assertEqual(dumps(got), dumps(joined), f"zagruzka_cell {u} read across {mid}")

        def plan_days(r):
            out = {}
            for row in r["plan"]["units"] + r["plan"]["cell_rows"]:
                for day, pa in zip(r["plan"]["days"], row["daily"]):
                    out[(row.get("manager_id"), row.get("cell_id"), day)] = pa
            return out
        self.assertEqual(dumps(plan_days(whole)), dumps({**plan_days(left), **plan_days(right)}),
                         f"plan read across {mid}")

    READERS = {"wc_labor", "unit_labor", "people", "dashboard", "dashboard_people", "live",
               "plan", "zagruzka_cell", "fleet", "fleet_people", "idle"}

    def assert_conserved(self, before: dict, after: dict, a=POST[0], b=POST[1], *, lower=()):
        """Σ over the units of every reader, per day of [a, b]. A reader in
        `lower` may only fall (a join counts one copy)."""
        s0, s1 = self.sums(before), self.sums(after)
        self.assertEqual(set(s0), self.READERS, "a reader answered nothing to compare")
        for name in s0:
            for d in days(a, b):
                iso = d.isoformat()
                p0, a0 = s0[name].get(iso, (0.0, 0.0))
                p1, a1 = s1.get(name, {}).get(iso, (0.0, 0.0))
                # Plan Bajarish rounds its days; an ojidaniya mean is rounded
                # to 2 places before it is multiplied back by its N.
                tol = {"plan": 1.0, "idle": 0.2}.get(name, 0.02)
                if name in lower:
                    self.assertLessEqual(p1, p0 + tol, f"{name} plan on {iso}")
                    self.assertLessEqual(a1, a0 + tol, f"{name} actual on {iso}")
                    continue
                self.assertAlmostEqual(p1, p0, delta=tol, msg=f"{name} plan on {iso}")
                self.assertAlmostEqual(a1, a0, delta=tol, msg=f"{name} actual on {iso}")

    def stays_at_b(self):
        """A cell of X at another work centre, with a line, people and a
        list on every day — X goes on working while c moves (a unit-day
        nobody is on the list for has no fleet загрузка at all)."""
        e = self.cell("0999", X, sap=B)
        self.line(X, "F099", "Boshqa", wc=B, labor=6, sort=9)
        for day in days(*self.SPAN):
            self.daily(X, day, "F099", wc=B, plan=10, actual=10)
            self.pin(X, day, wc=B, people=1)
            self.att(e, day, X, n=1)
        return e

    def heatmap(self, d) -> dict:
        """/api/heatmap for one day, as an admin — the kept answer included."""
        from app.routers import heatmap
        return heatmap.get_heatmap(date_from=d, date_to=d, shift=None, manager_id=[],
                                   include_pending=True, factory=None, units=False,
                                   db=self.db, payload=ADMIN)["data"]

    def dash(self, unit, d):
        from app.routers import production as prod
        return prod._build_dashboard(self.db, unit, d)

    def wc_codes(self, dash) -> set:
        return {w["work_center"] for w in dash["work_centers"]}

    def rows_at(self, dash, wc=C) -> dict:
        return {r["sap_code"]: r for r in dash["rows"] if r["work_center"] == wc}

    def zc_inputs(self, page, code) -> dict:
        return (page.get("inputs") or {}).get(code) or {}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class NoMove(_E2E):
    """T1 — nothing moved: the sweep is a no-op and every reader answers byte
    for byte what it answered."""

    def test_t1_sweep_without_events(self):
        w = self.world_lone()
        lo, hi = self.SPAN
        r0 = dumps(self.reads([X, Y], lo, hi))
        t0 = self.table_fingerprint()
        self.assertEqual(self.land(D), [])            # nothing due either
        jurnal, dm = self.sweep()
        self.assertEqual(self.table_fingerprint(), t0)
        self.assertEqual(dumps(self.reads([X, Y], lo, hi)), r0)
        self.assertEqual(self.move_rows(), [])
        jurnal.assert_not_called()
        dm.assert_not_called()
        self.assertEqual(cf.unsettled(self.db, [w.c.id, w.d.id, w.y.id], hi), set())


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class LiveMove(_E2E):
    """T2 — a live move: cell c, alone at its work centre in X, goes to Y
    through the /cells form."""

    def test_t2_live_move_end_to_end(self):
        from app.models import PPDaily, PPLineDaily
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)

        out = self.put_cell(w.c, at=ASK, manager_id=Y)
        self.assertEqual(out["pending"]["manager_id"], {"value": Y, "from": D.isoformat()})
        # Asked, not landed: no unit figure moves on any day — the catalog
        # follows only once the change has landed. (A per-cell reader of a
        # day still to come reads the cell where the waiting change puts it:
        # the dated links' own rule, 2026-10-12.)
        asked = self.reads([X, Y], *POST)
        for name in ("at", "wc_labor", "unit_labor", "typed_pins", "typed_people"):
            self.assertEqual(dumps(asked[name]), dumps(post0[name]), name)
        self.assertEqual(dumps(self.reads([X, Y], *HIST)), dumps(hist0))
        self.assertEqual(self.land(D), [("0101", "manager_id", X, Y)])
        self.assertEqual(cf.unsettled(self.db, [w.c.id], D), set())   # the sweep is off yet
        self.enable()
        self.assertEqual(cf.unsettled(self.db, [w.c.id], D), {w.c.id})
        # /zagruzka opened in the gap keeps its answer a minute (`kept_answer`)
        # — the follow must drop it, or the page goes on showing the gap.
        gap = self.heatmap(D)
        self.assertEqual(gap[f"Unit {Y}"][D.strftime("%d.%m.%Y")]["prod_plan"], 10.0)
        jurnal, dm = self.sweep()
        self.assertEqual(cf.unsettled(self.db, [w.c.id], D), set())
        hm = self.heatmap(D)[f"Unit {Y}"][D.strftime("%d.%m.%Y")]
        self.assertAlmostEqual(hm["prod_plan"], 10.0 + post0["wc_labor"][(X, D.isoformat(), C)][0],
                               places=2)

        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.from_unit, row.to_unit, row.home_from,
                          row.storage_from, row.whole_code),
                         ("moved", "live", X, Y, D, D, True))
        self.assertEqual(jurnal.call_args.args[:2], ("org", "org.catalog_moved"))
        dm.assert_not_called()

        # Days < D: every reader, both units, as before the move was asked.
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], D - timedelta(days=3), D + timedelta(days=3))
        mine = {w.l1.id, w.l2.id}
        for d in days(*POST):
            iso = d.isoformat()
            # The catalog: c's lines and the work-centre row in Y, gone from X.
            self.assertEqual(self.ids_on(Y, d), mine | {w.ly.id})
            self.assertEqual(self.ids_on(X, d), {w.l3.id})
            self.assertEqual({r.id for r in pp_catalog.at(self.db, Y, d).work_centers},
                             {w.w_c.id, w.w_y.id})
            # The minutes and the people: X's figures at C are Y's now.
            self.assertEqual(post1["wc_labor"][(Y, iso, C)], post0["wc_labor"][(X, iso, C)])
            self.assertNotIn((X, iso, C), post1["wc_labor"])
            self.assertEqual(post1["typed_people"][(Y, iso, C)], 4.0)
            self.assertNotIn((X, iso, C), post1["typed_people"])
            # The cell's own figures did not move a minute.
            for name in ("cell_labor", "cell_pins"):
                self.assertEqual(dumps(post1[name][(w.c.id, iso)]),
                                 dumps(post0[name][(w.c.id, iso)]), name)
            self.assertEqual(post1["live"][iso]["cells"][w.c.id], post0["live"][iso]["cells"][w.c.id])
            # The «Zagruzka fayli» page: X lists nothing of C and no unknown
            # SKU; Y lists c's positions with X's figures.
            dx, dy = post1["dashboard"][(X, iso)], post1["dashboard"][(Y, iso)]
            dx0 = post0["dashboard"][(X, iso)]
            self.assertEqual(self.wc_codes(dx), {B})
            self.assertEqual(dx["unknown_skus"], [])
            self.assertEqual(dy["unknown_skus"], [])
            self.assertEqual(self.wc_codes(dy), {C, E})
            for sap in ("F001", "F002"):
                ry, rx0 = self.rows_at(dy)[sap], self.rows_at(dx0)[sap]
                for k in ("plan_qty", "actual_qty", "minutes", "total_labor", "actual_labor",
                          "line_key", "people"):
                    self.assertEqual(ry[k], rx0[k], (sap, k, iso))
            wy = next(x for x in dy["work_centers"] if x["work_center"] == C)
            wx0 = next(x for x in dx0["work_centers"] if x["work_center"] == C)
            for k in ("people", "shtatka", "shtatka_cfg", "load", "total_labor", "actual_labor"):
                self.assertEqual(wy[k], wx0[k], (k, iso))
            self.assertEqual(wy["cell"]["id"], w.c.id)
            # «Yacheyka zagruzkasi»: the cell is on Y's page with its figures.
            key = d.strftime("%d.%m.%Y")
            zy = self.zc_inputs(post1["zagruzka_cell"][Y], "0101")
            zx0 = self.zc_inputs(post0["zagruzka_cell"][X], "0101")
            self.assertEqual(zy[key]["trud_plan"], zx0[key]["trud_plan"])
            self.assertEqual(zy[key]["o_soni"], zx0[key]["o_soni"])
            self.assertNotIn(key, self.zc_inputs(post1["zagruzka_cell"][X], "0101"))
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        # The typed per-line value on D followed the line; the one on D−1 stayed.
        ld = {(r.manager_id, r.date): float(r.plan_override)
              for r in self.db.query(PPLineDaily).all()}
        self.assertEqual(ld, {(Y, D): 77.0, (X, D - timedelta(days=1)): 55.0})
        self.assertEqual(self.rows_at(post1["dashboard"][(Y, D.isoformat())])["F001"]["plan_qty"], 77.0)
        # X's SAP rows at C left with the positions, from D on only.
        xd = {(r.sap_code, r.date) for r in self.db.query(PPDaily).filter(PPDaily.manager_id == X)}
        self.assertFalse({k for k in xd if k[0] in ("F001", "F002") and k[1] >= D})
        self.assertIn(("F001", D - timedelta(days=1)), xd)
        # The ojidaniya: c's stop is weighed in Y by the people that came with
        # it (4), d's stays X's (2 × 12 minutes).
        iso = D.isoformat()
        self.assertEqual((post1["idle"][(X, iso)]["n_sum"], post1["idle"][(X, iso)]["total"]),
                         (2.0, 12.0))
        self.assertEqual(post1["idle"][(Y, iso)]["n_sum"], 7.0)
        self.assertAlmostEqual(post1["idle"][(Y, iso)]["total"] * 7, 4 * 30, delta=0.1)
        # «Plan Bajarish»: the units split moved, the cell's own row did not.
        p0 = {u["manager_id"]: u for u in post0["plan"]["units"]}
        p1 = {u["manager_id"]: u for u in post1["plan"]["units"]}
        moved = p0[X]["plan"] - p1[X]["plan"]
        self.assertGreater(moved, 0)
        self.assertAlmostEqual(p1[Y]["plan"] - p0[Y]["plan"], moved, delta=0.2)
        c0 = {r["cell_id"]: r for r in post0["plan"]["cell_rows"]}
        c1 = {r["cell_id"]: r for r in post1["plan"]["cell_rows"]}
        self.assertEqual((c1[w.c.id]["plan"], c1[w.c.id]["actual"]),
                         (c0[w.c.id]["plan"], c0[w.c.id]["actual"]))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Lettered(_E2E):
    """T3 — X: c(A), d(B); Y: y1(A). c moves through `set_unit`: it takes B
    in Y, its A lines take B with it, d and its line are untouched."""

    def test_t3_lettered(self):
        from app.models import PPWorkCenterDaily
        from app.services import cell_links
        w = self.world_lettered()
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        ev = self.move(w.c, Y, at=ASK)                       # not refused: nothing shared
        self.assertEqual((ev.value, ev.prev, ev.effective_from), (Y, X, D))
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.letter_from, row.letter_to, row.whole_code),
                         ("moved", "A", "B", False))
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], *self.SPAN)
        self.db.refresh(w.c)
        self.assertEqual(w.c.wc_group, "B")
        self.assertEqual(cell_links.letter_on(w.c, D - timedelta(days=1)), "A")
        self.assertEqual(cell_links.letter_on(w.c, D), "B")
        for d in days(*POST):
            iso = d.isoformat()
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, d).lines},
                             {w.la1.id: "B", w.la2.id: "B", w.ly.id: "A"})
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, X, d).lines},
                             {w.lb.id: "B"})
            # Both work-centre rows stay where they were: cells stay at C in both.
            self.assertEqual([r.id for r in pp_catalog.at(self.db, X, d).work_centers], [w.w_x.id])
            self.assertEqual([r.id for r in pp_catalog.at(self.db, Y, d).work_centers], [w.w_y.id])
            # The pages: X keeps d's group, Y carries both groups, each its cell.
            gx = {g["group"]: g for g in self.dash_wc(post1["dashboard"][(X, iso)])["groups"]}
            gy = {g["group"]: g for g in self.dash_wc(post1["dashboard"][(Y, iso)])["groups"]}
            self.assertEqual(set(gx), {"B"})
            self.assertEqual(gx["B"]["cell"]["id"], w.d.id)
            self.assertEqual(set(gy), {"A", "B"})
            self.assertEqual((gy["A"]["cell"]["id"], gy["B"]["cell"]["id"]), (w.y1.id, w.c.id))
            self.assertEqual(gy["B"]["people"], 3)
            for name in ("cell_labor", "cell_pins"):
                for cid in (w.c.id, w.d.id, w.y1.id):
                    self.assertEqual(dumps(post1[name][(cid, iso)][:1] if name == "cell_pins"
                                           else post1[name][(cid, iso)]),
                                     dumps(post0[name][(cid, iso)][:1] if name == "cell_pins"
                                           else post0[name][(cid, iso)]), (name, cid, iso))
            key = d.strftime("%d.%m.%Y")
            zy = self.zc_inputs(post1["zagruzka_cell"][Y], "0301")[key]
            zx0 = self.zc_inputs(post0["zagruzka_cell"][X], "0301")[key]
            self.assertEqual((zy["trud_plan"], zy["o_soni"], zy["wc_group"]),
                             (zx0["trud_plan"], zx0["o_soni"], "B"))
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        # The day before, X's page still splits by the letters of that day.
        gx_old = {g["group"]: g for g in self.dash_wc(self.dash(X, D - timedelta(days=1)))["groups"]}
        self.assertEqual(set(gx_old), {"A", "B"})
        self.assertEqual(gx_old["A"]["cell"]["id"], w.c.id)
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "B"): 3, (Y, "A"): 5, (X, "B"): 2})

    def dash_wc(self, dash, code=C):
        return next(x for x in dash["work_centers"] if x["work_center"] == code)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Refusal(_E2E):
    """T4 — a move over a SHARED position is refused on the real doors with a
    structured 409, and nothing is written; once the position is lettered the
    same door passes, a withdrawal passes, and the follow moves exactly what
    is the cell's."""

    def _world(self):
        self.unit(X, Y, Z)
        c = self.cell("0401", X, letter="A")
        d_ = self.cell("0402", X, letter="B")
        self.cell("0201", Y, sap=E)
        la = self.line(X, "F001", "Tort", letter="A", sort=0)
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        ls = self.line(X, "F003", "Non", sort=2)                     # both cells make it
        ly = self.line(Y, "F005", "Pirog", wc=E, sort=0)
        self.wc_row(X, C, shtatka=4)
        for day in days(*self.SPAN):
            for sap in ("F001", "F002", "F003"):
                self.daily(X, day, sap, plan=10, actual=9)
            self.daily(Y, day, "F005", wc=E, plan=6, actual=6)
            self.pin(X, day, group="A", people=2)
            self.pin(X, day, group="B", people=3)
            self.pin(Y, day, wc=E, people=1)
            self.att(c, day, Y if day >= D else X, n=2)
            self.att(d_, day, X, n=3)
        self.settle()
        return c, d_, la, lb, ls, ly

    def test_t4_refused_then_lettered_then_followed(self):
        from app.services import cell_register
        c, d_, la, lb, ls, ly = self._world()
        t0 = self.table_fingerprint()
        r0 = dumps(self.reads([X, Y], *self.SPAN))
        # The /cells form: a structured 409 naming what to letter.
        with self.assertRaises(HTTPException) as cm:
            self.put_cell(c, at=ASK, manager_id=Y)
        self.assertEqual(cm.exception.status_code, 409)
        det = cm.exception.detail
        self.assertEqual((det["code"], det["params"]["kind"]), ("shared_positions", "shared"))
        self.assertEqual([x["id"] for x in det["params"]["lines"]], [ls.id])
        self.assertEqual([s["id"] for s in det["params"]["staying"]], [d_.id])
        self.assertIsInstance(det["message"], str)
        # «Doimiy qilish» on the «Davomat» tab: the whole PUT refused.
        self._doimiy_refused(c)
        # A «Verifix sinxron» tap: the same refusal, raised to the router.
        with self.assertRaises(cell_register.Refused) as cm2:
            self.verifix_tap(c, Y, at=ASK)
        self.assertEqual(cm2.exception.code, "shared_positions")
        self.db.rollback()
        from app.models import VerifixSyncItem
        self.db.query(VerifixSyncItem).delete()
        self.settle()
        self.assertEqual(self.table_fingerprint(), t0)                 # nothing written
        self.assertEqual(dumps(self.reads([X, Y], *self.SPAN)), r0)
        # A person letters the shared position — the «Pozitsiyalar» row edit.
        self.edit_line(ls, at=ASK, wc_group="A")
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        out = self.put_cell(c, at=ASK, manager_id=Y)
        self.assertEqual(out["pending"]["manager_id"]["value"], Y)
        # A withdrawal is never refused — and lands nothing.
        self.edit_line(ls, at=ASK, wc_group="")                         # shared again
        out = self.put_cell(c, at=ASK, manager_id=X)
        self.assertNotIn("manager_id", out["pending"])
        self.edit_line(ls, at=ASK, wc_group="A")
        self.put_cell(c, at=ASK, manager_id=Y)
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.from_unit, row.to_unit, row.storage_from), ("moved", X, Y, D))
        self.assertEqual(set(row.line_ids), {la.id, ls.id})
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], *self.SPAN)
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        for d in days(*POST):
            self.assertEqual(self.ids_on(Y, d), {la.id, ls.id, ly.id})
            self.assertEqual(self.ids_on(X, d), {lb.id})
            self.assertEqual(post1["dashboard"][(X, d.isoformat())]["unknown_skus"], [])
        # Clearing the brigadir of a cell that owns positions: refused.
        with self.assertRaises(HTTPException) as cm3:
            self.put_cell(d_, at=at_(D + timedelta(days=1)), manager_id=0)
        self.assertEqual(cm3.exception.detail["code"], "positions_need_unit")

    def _doimiy_refused(self, c):
        from unittest import mock
        from app.models import AttendanceBatch, AttendanceBatchCell
        from app.routers import attendance_batch as ab
        old_day = D - timedelta(days=12)                 # a file day, before the live floor
        b = AttendanceBatch(date=old_day, status="draft")
        self.db.add(b)
        self.db.flush()
        self.db.add(AttendanceBatchCell(batch_id=b.id, verifix_code=c.verifix_code, cell_id=c.id,
                                        manager_id=c.manager_id, included=True, pending=False))
        self.settle()
        body = ab.MappingBody(date=old_day.isoformat(), permanent=True,
                              changes=[ab.CellChange(verifix_code=c.verifix_code, manager_id=Y)])
        with self.clock(ASK), self.assertRaises(HTTPException) as cm, \
                mock.patch.object(ab, "_batch_payload", return_value={"ok": True}):
            ab.update_cells(body, db=self.db, admin=ADMIN)
        self.assertEqual((cm.exception.status_code, cm.exception.detail["code"]),
                         (409, "shared_positions"))
        self.db.rollback()
        self.db.query(AttendanceBatchCell).delete()
        self.db.query(AttendanceBatch).delete()
        self.settle()

    def test_t4_team_together_and_split(self):
        """Both cells to ONE unit with «Birga ko'chirish» (`move_with`)
        passes and the shared position goes with them; sending one of them on
        to a second unit is refused as a split."""
        c, d_, la, lb, ls, ly = self._world()
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        out = self.put_cell(c, at=ASK, manager_id=Y, move_with=[d_.id])
        self.assertEqual(out["pending"]["manager_id"]["value"], Y)
        with self.assertRaises(HTTPException) as cm:
            self.put_cell(d_, at=ASK, manager_id=Z)
        self.assertEqual(cm.exception.detail["params"]["kind"], "split")
        self.land(D)
        self.sweep()
        self.assertEqual(sorted(r.state for r in self.move_rows()), ["moved", "moved"])
        self.assert_history_kept(hist0, [X, Y])
        self.assert_conserved(post0, self.reads([X, Y], *POST))
        self.assert_unique([X, Y], *self.SPAN)
        for d in days(*POST):
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, d).lines},
                             {la.id: "A", lb.id: "B", ls.id: None, ly.id: None})
            self.assertEqual(self.ids_on(X, d), set())
            self.assertEqual(self.dash(X, d)["rows"], [])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Sibling(_E2E):
    """T5 — Y's lone UNLETTERED cell y1 and its unlettered lines meet an
    arrival (a «Verifix sinxron» tap): y1 takes a free letter from D, its
    lines and its whole-centre pin with it — and keeps its own figures."""

    def _world(self):
        self.unit(X, Y)
        c = self.cell("0501", X)
        y1 = self.cell("0502", Y)
        self.stays_at_b()
        lc = self.line(X, "F001", "Tort", labor=60)
        ly = self.line(Y, "F005", "Pirog", labor=30)
        self.wc_row(Y, C, shtatka=2)
        for day in days(*self.SPAN):
            self.daily(X, day, "F001", plan=50, actual=40)
            self.daily(Y, day, "F005", plan=20, actual=20)
            self.pin(Y, day, people=6, shtatka=8)
            self.pin(X, day, people=3)
            self.att(c, day, Y if day >= D else X, n=3)
            self.att(y1, day, Y, n=6)
        self.settle()
        return c, y1, lc, ly

    def test_t5_sibling(self):
        from app.models import PPWorkCenterDaily
        from app.services import cell_links
        c, y1, lc, ly = self._world()
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        it, out = self.verifix_tap(c, Y, at=ASK)
        self.assertIsNotNone(out.get("from"))
        self.land(D)
        self.sweep()
        self.assertEqual([r.state for r in self.move_rows()], ["moved"])
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], *self.SPAN)
        # The figures only: the letter the page prints for y1 across the move
        # is `test_t5_letter_printed_across_the_move`'s (a DEFECT).
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1], zc_letter=False)
        self.db.refresh(c)
        self.db.refresh(y1)
        self.assertEqual((c.wc_group, y1.wc_group), ("A", "B"))
        self.assertIsNone(cell_links.letter_on(y1, D - timedelta(days=1)))
        for d in days(*POST):
            iso = d.isoformat()
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, d).lines},
                             {lc.id: "A", ly.id: "B"})
            # Each cell reads its OWN minutes and people from D.
            self.assertAlmostEqual(post1["cell_labor"][(y1.id, iso)][0], 30 * 20 / 60)
            self.assertAlmostEqual(post1["cell_labor"][(c.id, iso)][0], 60 * 50 / 60)
            self.assertEqual(post1["cell_pins"][(y1.id, iso)][0], 6.0)
            self.assertEqual(post1["cell_pins"][(c.id, iso)][0], 3.0)
            for cid in (c.id, y1.id):
                self.assertEqual(dumps(post1["cell_labor"][(cid, iso)]),
                                 dumps(post0["cell_labor"][(cid, iso)]))
            gy = {g["group"]: g for g in next(x for x in post1["dashboard"][(Y, iso)]["work_centers"]
                                             if x["work_center"] == C)["groups"]}
            self.assertEqual((gy["A"]["cell"]["id"], gy["B"]["cell"]["id"]), (c.id, y1.id))
            key = d.strftime("%d.%m.%Y")
            for code, cid in (("0501", c.id), ("0502", y1.id)):
                z = self.zc_inputs(post1["zagruzka_cell"][Y], code)[key]
                self.assertEqual(z["trud_plan"], round(post0["cell_labor"][(cid, iso)][0], 2))
        pins = {r.wc_group: (r.people, r.shtatka) for r in self.db.query(PPWorkCenterDaily).filter(
            PPWorkCenterDaily.manager_id == Y, PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {"B": (6, None), "A": (3, None), None: (None, 8)})


    # DEFECT — see the docstring. Expected to fail until zagruzka_cell reads
    # each day's letter; an unexpected success then fails the run.
    @unittest.expectedFailure
    def test_t5_letter_printed_across_the_move(self):
        """«Yacheyka zagruzkasi» read over a range across the move prints
        each cell with the letter of THAT day.

        DEFECT (pre-existing in routers/zagruzka_cell.py `cell_zagruzka`, the
        `_on_day` branch): once any cell of the page moved inside the range,
        EVERY cell is read with ONE letter for the whole range —
        `cell_links.with_letters_on([c], max(d for d in dates if member(c.id,
        d)))`, the letter of its last day in the unit. Y's page over
        [D−3, D+2] therefore prints the lone sibling y1 (0502) as «B» on
        D−3…D−1 (`inputs["0502"][day]["wc_group"]`, and `cells[].wc_group`)
        where a read of those days alone prints None — y1 had no letter
        before the follow gave it one. The figures agree here only because
        y1 is alone at the work centre on those days; with a cell coming back
        under another letter they do not (`test_one_read_over_both_stays`).
        Expected: `cell_links.letter_on(c, day)` per day, the rule
        `zagruzka_source.by_wc_on` and the dashboard already follow."""
        c, _y1, _lc, _ly = self._world()
        self.verifix_tap(c, Y, at=ASK)
        self.land(D)
        self.sweep()
        day = (D - timedelta(days=1)).strftime("%d.%m.%Y")
        alone = self.zagruzka_cell(Y, HIST[0], HIST[1])["inputs"]["0502"][day]["wc_group"]
        across = self.zagruzka_cell(Y, HIST[0], POST[1])["inputs"]["0502"][day]["wc_group"]
        self.assertIsNone(alone)
        self.assertIsNone(across)                       # reads «B»
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Join(_E2E):
    """T6 — y1(A) alone in Y owns «Tort»; c brings an identical file-filled
    «Tort»: the copy is archived, one quantity is shared by the two cells."""

    def test_t6_join(self):
        from app.models import PPProduct
        from app.services.pp_calc import line_keys
        self.unit(X, Y)
        c = self.cell("0601", X)
        y1 = self.cell("0602", Y, letter="A")
        self.stays_at_b()
        p = self.line(X, "F001", "Tort", labor=60, sort=3)
        m = self.line(Y, "F001", "Tort", labor=60, letter="A", sort=0)
        ly2 = self.line(Y, "F009", "Rulet", labor=30, letter="A", sort=1)
        for day in days(*self.SPAN):
            self.daily(X, day, "F001", plan=100, actual=80)
            self.daily(Y, day, "F001", plan=100, actual=80)       # one plant file
            self.daily(Y, day, "F009", plan=10, actual=10)
            self.pin(X, day, people=2)
            self.pin(Y, day, group="A", people=4)
            self.att(c, day, Y if day >= D else X, n=2)
            self.att(y1, day, Y, n=4)
        self.settle()
        keys_y0 = line_keys(pp_catalog.at(self.db, Y, D).lines)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        self.move(c, Y, at=ASK)
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.lines[0]["joined_into"]), ("moved", m.id))
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        # A join counts ONE copy: Σ minutes may only fall; people are conserved.
        self.assert_conserved(post0, post1, lower=("wc_labor", "unit_labor", "dashboard", "live",
                                                   "plan", "zagruzka_cell", "fleet"))
        s0, s1 = self.sums(post0), self.sums(post1)
        self.assertEqual(s1["people"], s0["people"])
        self.assert_unique([X, Y], *self.SPAN)
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        cp = self.db.get(PPProduct, p.id)
        self.assertEqual((cp.manager_id, cp.active, cp.archived_by, cp.archived_from),
                         (Y, False, cf.ARCHIVED_BY, D))
        self.assertIsNone(self.db.get(PPProduct, m.id).wc_group)       # m unlettered (ruling 5)
        keys_y1 = line_keys(pp_catalog.at(self.db, Y, D).lines)
        self.assertEqual({k: v for k, v in keys_y1.items() if k in keys_y0}, keys_y0)
        for d in days(*POST):
            iso = d.isoformat()
            self.assertEqual(pp_catalog.at(self.db, Y, d).lines[-1].id, p.id)   # sorted last
            # Y's unit minutes unchanged; X's lost c's and kept the rest.
            self.assertEqual(post1["unit_labor"][(Y, iso)], post0["unit_labor"][(Y, iso)])
            self.assertEqual(post1["unit_labor"][(X, iso)], (1.0, 1.0))
            self.assertNotIn((X, iso, C), post1["wc_labor"])
            # One quantity, split between the two cells.
            self.assertAlmostEqual(post1["cell_labor"][(c.id, iso)][0], 50.0)
            self.assertAlmostEqual(post1["cell_labor"][(y1.id, iso)][0], 50.0 + 30 * 10 / 60)
            dy = post1["dashboard"][(Y, iso)]
            self.assertEqual([r["sap_code"] for r in dy["rows"]].count("F001"), 1)
            self.assertEqual([(a["id"], a["twin_live"]) for a in dy["archived"]], [(p.id, True)])
            self.assertEqual(dy["unknown_skus"], [])
            self.assertEqual(post1["dashboard"][(X, iso)]["unknown_skus"], [])
            self.assertEqual(self.rows_at(post1["dashboard"][(X, iso)]), {})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Swap(_E2E):
    """T8 — a(X, A) and b(Y, A) swap units at ONE opening, two `set_unit`
    calls: the lines swap, the work-centre rows stay, nothing is joined."""

    def test_t8_swap(self):
        from app.models import PPWorkCenterDaily
        self.unit(X, Y)
        a = self.cell("0801", X, letter="A")
        b = self.cell("0802", Y, letter="A")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(Y, "F001", "Tort", letter="A")
        wx, wy = self.wc_row(X, C, shtatka=3), self.wc_row(Y, C, shtatka=4)
        for day in days(*self.SPAN):
            self.daily(X, day, "F001", plan=10, actual=9)
            self.daily(Y, day, "F001", plan=10, actual=9)
            self.pin(X, day, group="A", people=2)
            self.pin(Y, day, group="A", people=3)
            self.att(a, day, Y if day >= D else X, n=2)
            self.att(b, day, X if day >= D else Y, n=3)
        self.settle()
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        self.move(a, Y, at=ASK)
        self.move(b, X, at=ASK)
        self.land(D)
        self.sweep()
        rows = self.move_rows()
        self.assertEqual(sorted(r.state for r in rows), ["moved", "moved"])
        self.assertFalse([r for r in rows if r.lines and r.lines[0]["joined_into"]])
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], *self.SPAN)
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        for d in days(*POST):
            iso = d.isoformat()
            self.assertEqual(self.active_ids_on(Y, d), {la.id})
            self.assertEqual(self.active_ids_on(X, d), {lb.id})
            self.assertEqual([r.id for r in pp_catalog.at(self.db, X, d).work_centers], [wx.id])
            self.assertEqual([r.id for r in pp_catalog.at(self.db, Y, d).work_centers], [wy.id])
            for cid in (a.id, b.id):
                self.assertEqual(dumps(post1["cell_labor"][(cid, iso)]),
                                 dumps(post0["cell_labor"][(cid, iso)]))
            for u, cid in ((X, b.id), (Y, a.id)):
                wc = next(x for x in post1["dashboard"][(u, iso)]["work_centers"]
                          if x["work_center"] == C)
                self.assertEqual(wc["groups"][0]["cell"]["id"], cid)
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "A"): 2, (X, "A"): 3})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class LateLanding(_E2E):
    """T9 — Y's catalog was edited (counting from D+1) before the move
    landed: the follow stores from S = D+1 and rewrites the window [D, D+1)."""

    def test_t9_late(self):
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        self.put_cell(w.c, at=ASK, manager_id=Y)
        # D 21:00, the day shift over: an edit of Y counts from D+1. Its unit of
        # measure — a dated catalog field that moves no figure, so Σ before
        # the move still holds after it.
        self.edit_line(w.ly, at=at_(D, 21), uom="dona")
        self.assertEqual(pp_catalog.current_from(self.db, Y), D + timedelta(days=1))
        self.land(D, 21, 30)                                            # landed late
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.storage_from), ("moved", "late", D + timedelta(days=1)))
        self.assertEqual({v["unit"] for v in row.versions}, {X, Y})
        self.assert_history_kept(hist0, [X, Y])
        post1 = self.reads([X, Y], *POST)
        self.assert_conserved(post0, post1)
        self.assert_unique([X, Y], *self.SPAN)
        self.assert_span_consistent([X, Y], HIST[0], D, POST[1])
        for d in days(*POST):
            self.assertEqual(self.ids_on(Y, d), {w.l1.id, w.l2.id, w.ly.id}, d)
            self.assertEqual(self.ids_on(X, d), {w.l3.id}, d)
        vy = pp_catalog.versions_between(self.db, Y, D, D)
        self.assertEqual({x["id"] for x in vy[0].lines}, {w.l1.id, w.l2.id, w.ly.id})
        vx = pp_catalog.versions_between(self.db, X, D, D)
        self.assertEqual({x["id"] for x in vx[0].lines}, {w.l3.id})
        # Y's own edit still counts from D+1 only.
        uom = {d: {p.id: p.uom for p in pp_catalog.at(self.db, Y, d).lines}[w.ly.id]
               for d in days(*POST)}
        self.assertEqual(uom, {D: None, D + timedelta(days=1): "dona", D + timedelta(days=2): "dona"})
        iso = D.isoformat()
        self.assertEqual(self.rows_at(post1["dashboard"][(Y, iso)])["F001"]["plan_qty"], 77.0)
        self.assertEqual(post1["dashboard"][(X, iso)]["unknown_skus"], [])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class AfterTheMove(_E2E):
    """T13 / T14 — the doors that rebuild a day from outside the platform, used
    AFTER a real follow: a SAP upload and an ABC import."""

    def _moved(self, **kw):
        w = self.world_lettered(**kw)
        self.move(w.c, Y, at=ASK)
        self.land(D)
        self.sweep()
        self.assertEqual([r.state for r in self.move_rows()], ["moved"])
        return w

    FAZA = [("O1", C, 100), ("O2", C, 60), ("O3", C, 40), ("O4", C, 30), ("O5", "A2895", 50)]
    ZAGA = {"O1": ("F001", 90), "O2": ("F002", 55), "O3": ("F003", 35), "O4": ("F005", 30),
            "O5": ("F001", 45)}

    def _daily(self, unit, d) -> list:
        from app.models import PPDaily
        return sorted((r.sap_code, r.work_center, float(r.plan_qty), float(r.actual_qty))
                      for r in self.db.query(PPDaily).filter(PPDaily.manager_id == unit,
                                                             PPDaily.date == d).all())

    def test_t13_sap_upload_after_the_move(self):
        w = self._moved(side=True, empty_unit=True)
        d1 = D + timedelta(days=1)
        out = self.upload(d1, self.FAZA, self.ZAGA, [X, Y, Z], at=at_(d1, 21))
        self.assertEqual(out["empty_targets"], [Z])
        self.assertEqual(out["written"], {str(X): 2, str(Y): 3, str(Z): 0})
        # X: d's position and the other work centre's «Tort» — never c's
        # «Tort» at C, which left with c.
        self.assertEqual(self._daily(X, d1), [("F001", "A2895", 50.0, 45.0), ("F003", C, 40.0, 35.0)])
        self.assertEqual(self._daily(Y, d1), [("F001", C, 100.0, 90.0), ("F002", C, 60.0, 55.0),
                                              ("F005", C, 30.0, 30.0)])
        self.assertEqual(self._daily(Z, d1), [])
        r = self.reads([X, Y], d1, d1)
        iso = d1.isoformat()
        dx, dy = r["dashboard"][(X, iso)], r["dashboard"][(Y, iso)]
        self.assertEqual(dx["unknown_skus"], [])
        self.assertEqual(dy["unknown_skus"], [])
        self.assertEqual({(x["sap_code"], x["work_center"]) for x in dx["rows"]},
                         {("F003", C), ("F001", "A2895")})
        ry = self.rows_at(dy)
        self.assertEqual((ry["F001"]["plan_qty"], ry["F001"]["wc_group"]), (100.0, "B"))
        self.assertAlmostEqual(r["wc_labor"][(Y, iso, C)][0], 100 + 60 * 30 / 60 + 30 * 20 / 60)
        self.assertAlmostEqual(r["wc_labor"][(X, iso, C)][0], 40 * 12 / 60)
        self.assertAlmostEqual(r["cell_labor"][(w.c.id, iso)][0], 100 + 30)
        self.assertAlmostEqual(r["cell_labor"][(w.d.id, iso)][0], 8.0)

    def test_t14_imports_after_the_move(self):
        w = self._moved(twin=True)
        d1 = D + timedelta(days=1)
        # The day's file, so the imports' rebuild has the figures it re-joins.
        self.upload(d1, self.FAZA, self.ZAGA, [X, Y], at=at_(d1, 10))
        hist0 = self.reads([X, Y], *HIST)
        on_d = self.reads([X, Y], D, D)
        pre = self.reads([X, Y], d1, d1 + timedelta(days=1))
        # X imports its OLD sheet, «Группа» column and all: c's two rows are
        # left out (they left with c), d's twin «Tort» (B) stays.
        out = self.import_abc(X, [("F001", "Tort", C, 60, "A"), ("F002", "Keks", C, 30, "A"),
                                  ("F003", "Non", C, 12, "B"), ("F001", "Tort", C, 60, "B")],
                              at=at_(d1, 10), groups=True,
                              work_centers=[{"code": C, "shtatka": 4, "capacity": None,
                                             "sort_order": 0}])
        self.assertEqual(sorted(x["name"] for x in out["skipped_moved_out"]), ["Keks", "Tort"])
        self.assertEqual(out["kept_moved_in"], [])
        # Y imports a sheet that does not list the arrivals: they are kept, ids and all.
        out = self.import_abc(Y, [("F005", "Pirog", C, 20, "A")], at=at_(d1, 10), groups=True)
        self.assertEqual(sorted(x["name"] for x in out["kept_moved_in"]), ["Keks", "Tort"])
        self.assertTrue({w.la1.id, w.la2.id} <= self.ids_on(Y, d1))
        self.assertEqual({(p.name, p.wc_group) for p in pp_catalog.at(self.db, X, d1).lines},
                         {("Non", "B"), ("Tort", "B")})
        self.assertEqual({(p.name, p.wc_group) for p in pp_catalog.at(self.db, Y, d1).lines},
                         {("Pirog", "A"), ("Tort", "B"), ("Keks", "B")})
        self.assert_unique([X, Y], *self.SPAN)
        # The imports count from d1: every day before it reads as it did.
        self.assert_history_kept(hist0, [X, Y])
        self.assertEqual(dumps(self.reads([X, Y], D, D)), dumps(on_d))
        self.assert_conserved(pre, self.reads([X, Y], d1, d1 + timedelta(days=1)),
                              d1, d1 + timedelta(days=1))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Idempotent(_E2E):
    """T16 — the sweep and the landing, run again, change nothing."""

    def test_t16_twice(self):
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X)
        self.move(w.c, Y, at=ASK)
        self.land(D)
        self.sweep()
        t1 = self.table_fingerprint()
        r1 = dumps(self.reads([X, Y], *self.SPAN))
        self.assertEqual(self.land(D + timedelta(days=1)), [])
        jurnal, dm = self.sweep()
        jurnal.assert_not_called()
        dm.assert_not_called()
        self.assertEqual(self.table_fingerprint(), t1)
        self.assertEqual(dumps(self.reads([X, Y], *self.SPAN)), r1)
        self.assertEqual(len(self.move_rows()), 1)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class LeaderPage(_E2E):
    """T17 — the leader of c reads their /production page in the unit of the
    day; while the landed move waits for the follow, the automatic checks do
    not judge the gap."""

    def test_t17_leader_page_before_and_after(self):
        from contextlib import ExitStack
        from unittest import mock
        from app.models import Manager
        from app.routers import production as prod
        from app.services import leader_auto
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X, leader=True)
        lead = w.lead
        pl = {"role": "leader", "role_id": X, "sub": "1", "full_name": "Lider Bir"}

        def page(d):
            with ExitStack() as st:
                st.enter_context(mock.patch.object(prod, "viewer_leader_profile_id",
                                                   lambda db, payload: lead.id))
                st.enter_context(mock.patch.object(prod, "page_scope_is_all",
                                                   lambda db, payload, page: False))
                return prod.get_dashboard(date=d.isoformat(), manager_id=None, payload=pl, db=self.db)

        def ctx(d):
            return leader_auto._Ctx(self.db, lead, self.db.get(Manager, X), 1, d.isoformat(),
                                    None, None, None)

        before = page(D - timedelta(days=1))
        self.assertEqual(before["manager_id"], X)
        self.assertEqual({r["sap_code"] for r in before["rows"]}, {"F001", "F002"})
        self.put_cell(w.c, at=ASK, manager_id=Y)
        self.land(D)
        self.enable()
        # Landed, not followed yet: the page of D reads Y, which has no line of
        # c's yet — and the automatic check says «no data» instead of judging it.
        gap = page(D)
        self.assertEqual((gap["manager_id"], gap["rows"]), (Y, []))
        self.assertEqual(cf.unsettled(self.db, [w.c.id], D), {w.c.id})
        with self.assertRaises(cf.CatalogUnsettled):
            ctx(D).dashboard
        self.sweep()
        on = page(D)
        self.assertEqual(on["manager_id"], Y)
        self.assertEqual({r["sap_code"] for r in on["rows"]}, {"F001", "F002"})
        self.assertEqual(self.rows_at(on)["F001"]["plan_qty"], 77.0)
        prev = page(D - timedelta(days=1))
        self.assertEqual(dumps(dash_figures(prev)), dumps(dash_figures(before)))
        self.assertEqual(ctx(D).dashboard["manager_id"], Y)
        self.assertEqual(ctx(D - timedelta(days=1)).dashboard["manager_id"], X)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class MoveBack(_E2E):
    """c goes X → Y on D and, a week later, Y → X: each stretch of days reads
    the unit the cell stood in, and the plant file is handed out by the
    same rule on either side of both moves."""

    def test_move_back_a_week_later(self):
        back = D + timedelta(days=7)
        lo, hi = self.SPAN
        w = self.world_lone(c_unit=lambda d: Y if D <= d < back else X)
        hist0 = self.reads([X, Y], *HIST)
        tail0 = self.reads([X, Y], back, hi)
        self.put_cell(w.c, at=ASK, manager_id=Y)
        self.land(D)
        self.sweep()
        mid1 = self.reads([X, Y], D, back - timedelta(days=1))
        out = self.put_cell(w.c, at=at_(back - timedelta(days=1)), manager_id=X)
        self.assertEqual(out["pending"]["manager_id"], {"value": X, "from": back.isoformat()})
        self.land(back)
        self.sweep()
        rows = self.move_rows()
        self.assertEqual([(r.state, r.from_unit, r.to_unit, r.home_from) for r in rows],
                         [("moved", X, Y, D), ("moved", Y, X, back)])
        self.assert_history_kept(hist0, [X, Y])
        mid2 = self.reads([X, Y], D, back - timedelta(days=1))
        for r in (mid1, mid2):
            r["plan"] = {k: v for k, v in r["plan"].items() if k != "cells"}
        for name in mid1:
            self.assertEqual(dumps(mid2[name]), dumps(mid1[name]), f"{name}: the week in Y moved")
        tail1 = self.reads([X, Y], back, hi)
        self.assert_conserved(tail0, tail1, back, hi)
        self.assert_unique([X, Y], lo, hi)
        # One read over both of c's stays in X: c is unlettered in both.
        self.assert_span_consistent([X, Y], lo, D, hi)
        self.assert_span_consistent([X, Y], D, back, hi)
        for d in days(back, hi):
            iso = d.isoformat()
            self.assertEqual(self.ids_on(X, d), {w.l1.id, w.l2.id, w.l3.id})
            self.assertEqual(self.ids_on(Y, d), {w.ly.id})
            self.assertEqual({r.id for r in pp_catalog.at(self.db, X, d).work_centers},
                             {w.w_c.id, w.w_b.id})
            self.assertEqual(tail1["wc_labor"][(X, iso, C)], tail0["wc_labor"][(X, iso, C)])
            self.assertNotIn((Y, iso, C), tail1["wc_labor"])
            self.assertEqual(tail1["dashboard"][(Y, iso)]["unknown_skus"], [])
        for d in days(D, back - timedelta(days=1)):
            self.assertEqual(self.ids_on(Y, d), {w.l1.id, w.l2.id, w.ly.id})
        # A plant file for a day after the move back: C is X's again.
        d8 = back + timedelta(days=1)
        res = self.upload(d8, [("O1", C, 100), ("O2", C, 40), ("O3", B, 10), ("O4", E, 30)],
                          {"O1": ("F001", 90), "O2": ("F002", 33), "O3": ("F003", 10),
                           "O4": ("F005", 25)}, [X, Y], at=at_(d8, 21))
        self.assertEqual(res["written"], {str(X): 3, str(Y): 1})



@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class MoreDoors(_E2E):
    """The other ways a brigadir change is made — «Doimiy qilish» on the
    admin «Davomat» tab, a «Verifix sinxron» team tap — and a move into a
    NIGHT unit, each followed and read end to end."""

    def test_doimiy_qilish_door(self):
        from unittest import mock
        from app.models import AttendanceBatch, AttendanceBatchCell
        from app.routers import attendance_batch as ab
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        old_day = D - timedelta(days=12)                 # a file day, before the live floor
        b = AttendanceBatch(date=old_day, status="draft")
        self.db.add(b)
        self.db.flush()
        self.db.add(AttendanceBatchCell(batch_id=b.id, verifix_code=w.c.verifix_code,
                                        cell_id=w.c.id, manager_id=X, included=True,
                                        pending=False))
        self.settle()
        body = ab.MappingBody(date=old_day.isoformat(), permanent=True,
                              changes=[ab.CellChange(verifix_code="0101", manager_id=Y)])
        with self.clock(ASK), mock.patch.object(ab, "_batch_payload", return_value={"ok": True}):
            self.assertEqual(ab.update_cells(body, db=self.db, admin=ADMIN), {"ok": True})
        self.settle()
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.from_unit, row.to_unit, row.home_from), ("moved", X, Y, D))
        self.assert_history_kept(hist0, [X, Y])
        self.assert_conserved(post0, self.reads([X, Y], *POST))
        self.assert_unique([X, Y], *self.SPAN)
        for d in days(*POST):
            self.assertEqual(self.ids_on(Y, d), {w.l1.id, w.l2.id, w.ly.id})

    def test_verifix_together(self):
        """Two suggestions moving a team to one unit: the first tapped alone is
        refused (they share a position), «Hammasini birga ko'chirish» moves
        both, and the shared position goes with them."""
        from app.models import VerifixSyncItem
        from app.services import cell_register, verifix_sync
        c, d_, la, lb, ls, ly = Refusal._world(self)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        items = []
        for cell in (c, d_):
            it = VerifixSyncItem(kind="brigadir_differs", key=f"cell:{cell.id}", status="open",
                                 payload={"cell": cell.id, "code": cell.verifix_code,
                                          "from_unit": X, "to_unit": Y, "brigadir": "Brigadir"})
            self.db.add(it)
            items.append(it)
        self.settle()
        with self.clock(ASK):
            with self.assertRaises(cell_register.Refused) as cm:
                verifix_sync.apply_item(self.db, items[0].id, by="test")
            self.assertEqual(cm.exception.params["together_items"], [items[1].id])
            self.db.rollback()
            out = verifix_sync.apply_item(self.db, items[0].id, by="test", choice="together")
        self.assertEqual(out["together"], [items[1].id])
        self.settle()
        self.land(D)
        self.sweep()
        self.assertEqual(sorted(r.state for r in self.move_rows()), ["moved", "moved"])
        self.assert_history_kept(hist0, [X, Y])
        self.assert_conserved(post0, self.reads([X, Y], *POST))
        self.assert_unique([X, Y], *self.SPAN)
        for d in days(*POST):
            self.assertEqual(self.ids_on(Y, d), {la.id, lb.id, ls.id, ly.id})
            self.assertEqual(self.ids_on(X, d), set())

    def test_move_into_a_night_unit(self):
        """Y works the night shift: the change lands at the LATER opening (X's
        D 08:00) and reads exactly like a day-to-day move."""
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X, y_shift=2)
        hist0 = self.reads([X, Y], *HIST)
        post0 = self.reads([X, Y], *POST)
        out = self.put_cell(w.c, at=ASK, manager_id=Y)
        self.assertEqual(out["pending"]["manager_id"]["from"], D.isoformat())
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.storage_from), ("moved", D))
        self.assert_history_kept(hist0, [X, Y])
        self.assert_conserved(post0, self.reads([X, Y], *POST))
        self.assert_unique([X, Y], *self.SPAN)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class IntoAnEmptyUnit(_E2E):
    """c moves into Z, a unit with no catalog at all. The follow gives Z its
    first lines, names that Z was empty, and Z's own first ABC import after it
    is then DATED like any other — it must not reach Z's history."""

    def test_into_an_empty_unit(self):
        self.unit(Z)
        w = self.world_lone(c_unit=lambda d: Z if d >= D else X)
        self.assertTrue(pp_catalog.is_empty(self.db, Z))
        hist0 = self.reads([X, Z], *HIST)
        post0 = self.reads([X, Z], *POST)
        self.put_cell(w.c, at=ASK, manager_id=Z)
        self.land(D)
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.from_unit, row.to_unit, row.home_from),
                         ("moved", X, Z, D))
        self.assertIn("dst_was_empty", [n.get("kind") for n in row.named or []])
        self.assertFalse(pp_catalog.is_empty(self.db, Z))
        self.assert_history_kept(hist0, [X, Z])
        self.assert_conserved(post0, self.reads([X, Z], *POST))
        self.assert_unique([X, Z], *self.SPAN)
        for d in days(*HIST):
            self.assertEqual(self.ids_on(Z, d), set())
        for d in days(*POST):
            self.assertEqual(self.ids_on(Z, d), {w.l1.id, w.l2.id})
            self.assertEqual(self.ids_on(X, d), {w.l3.id})
        # Z's first sheet of its own, after the move: a dated import, the
        # arrivals kept, nothing before the day it counts from rewritten.
        d1 = D + timedelta(days=1)
        hist1 = self.reads([X, Z], D - timedelta(days=3), D)
        out = self.import_abc(Z, [("F006", "Somsa", C, 15, None)], at=at_(d1, 10))
        self.assertEqual(out["applies_from"], d1.isoformat())
        self.assertEqual(sorted(x["name"] for x in out["kept_moved_in"]), ["Keks", "Tort"])
        self.assertEqual({p.name for p in pp_catalog.at(self.db, Z, d1).lines},
                         {"Tort", "Keks", "Somsa"})
        self.assertEqual({p.name for p in pp_catalog.at(self.db, Z, D).lines}, {"Tort", "Keks"})
        self.assert_history_kept(hist1, [X, Z], D - timedelta(days=3), D)
        self.assert_unique([X, Z], *self.SPAN)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class MoreAfterTheMove(_E2E):
    """A whole work centre that left, met by the old unit's old sheet; a
    lettered cell that comes back."""

    def test_t14_whole_code_import(self):
        w = self.world_lone(c_unit=lambda d: Y if d >= D else X)
        self.put_cell(w.c, at=ASK, manager_id=Y)
        self.land(D)
        self.sweep()
        d1 = D + timedelta(days=1)
        hist0 = self.reads([X, Y], *HIST)
        on_d = self.reads([X, Y], D, D)
        out = self.import_abc(X, [("F001", "Tort", C, 60, None), ("F002", "Keks", C, 30, None),
                                  ("F003", "Non", B, 12, None)], at=at_(d1, 10),
                              work_centers=[{"code": C, "shtatka": 5, "capacity": None,
                                             "sort_order": 0},
                                            {"code": B, "shtatka": 3, "capacity": None,
                                             "sort_order": 1}])
        self.assertEqual(sorted(x["name"] for x in out["skipped_moved_out"]), ["Keks", "Tort"])
        self.assertEqual(out["skipped_wc"], [C])
        cat = pp_catalog.at(self.db, X, d1)
        self.assertEqual({(p.name, p.work_center) for p in cat.lines}, {("Non", B)})
        self.assertEqual({r.code for r in cat.work_centers}, {B})
        self.assertEqual(self.ids_on(Y, d1), {w.l1.id, w.l2.id, w.ly.id})
        self.assert_unique([X, Y], *self.SPAN)
        self.assert_history_kept(hist0, [X, Y])
        self.assertEqual(dumps(self.reads([X, Y], D, D)), dumps(on_d))

    BACK = D + timedelta(days=7)

    def _there_and_back(self, *, reads=True):
        """c(A) X → Y on D (taking B beside y1's A), then Y → X on `BACK`."""
        back = self.BACK
        w = self.world_lettered(c_unit=lambda d: Y if D <= d < back else X)
        got = {}
        if reads:
            got["hist0"] = self.reads([X, Y], *HIST)
            got["tail0"] = self.reads([X, Y], back, self.SPAN[1])
        self.move(w.c, Y, at=ASK)
        self.land(D)
        self.sweep()
        if reads:
            got["mid1"] = self.reads([X, Y], D, back - timedelta(days=1))
        self.move(w.c, X, at=at_(back - timedelta(days=1)))
        self.land(back)
        self.sweep()
        return w, got

    def test_move_back_lettered(self):
        """c(A) leaves X for Y (taking B there, y1 holds A), and comes back a
        week later beside d(B): A is in X's history, B is d's — c's lines
        come home under a letter X's past never carried. Every stretch of
        days still splits by the letters of its own day."""
        from app.services import cell_links
        back = self.BACK
        lo, hi = self.SPAN
        w, got = self._there_and_back()
        hist0, tail0, mid1 = got["hist0"], got["tail0"], got["mid1"]
        self.assertEqual([(r.state, r.letter_from, r.letter_to) for r in self.move_rows()],
                         [("moved", "A", "B"), ("moved", "B", "C")])
        self.assert_history_kept(hist0, [X, Y])
        mid2 = self.reads([X, Y], D, back - timedelta(days=1))
        for r in (mid1, mid2):
            r["plan"] = {k: v for k, v in r["plan"].items() if k != "cells"}
        for name in mid1:
            self.assertEqual(dumps(mid2[name]), dumps(mid1[name]), f"{name}: the week in Y moved")
        self.assert_conserved(tail0, self.reads([X, Y], back, hi), back, hi)
        self.assert_unique([X, Y], lo, hi)
        self.assert_span_consistent([X, Y], lo, D, back - timedelta(days=1))
        self.assert_span_consistent([X, Y], D, back, hi)
        self.db.refresh(w.c)
        self.assertEqual(w.c.wc_group, "C")
        self.assertEqual([cell_links.letter_on(w.c, d) for d in (D - timedelta(days=1), D,
                                                                 back - timedelta(days=1), back)],
                         ["A", "B", "B", "C"])
        for d in days(back, hi):
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, X, d).lines},
                             {w.la1.id: "C", w.la2.id: "C", w.lb.id: "B"})
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, d).lines},
                             {w.ly.id: "A"})
            groups = {g["group"]: g["cell"]["id"] for g in next(
                x for x in self.dash(X, d)["work_centers"] if x["work_center"] == C)["groups"]}
            self.assertEqual(groups, {"B": w.d.id, "C": w.c.id})


    # DEFECT — see the docstring. Expected to fail until zagruzka_cell reads
    # each day's letter; an unexpected success then fails the run, which is
    # the cue to drop this decorator.
    @unittest.expectedFailure
    def test_one_read_over_both_stays(self):
        """One read of X over BOTH of c's stays in X — before D (as A) and
        from `BACK` (as C) — must answer each day as a read of that day alone.

        DEFECT (pre-existing in routers/zagruzka_cell.py `cell_zagruzka`, the
        `_on_day` branch; reached by any cell that leaves a unit and comes
        back under another letter, which this release makes routine): a moved
        cell is read with ONE letter for the whole range —
        `cell_links.with_letters_on([c], max(d for d in dates if member(c.id,
        d)))` — the letter of its LAST day in the unit. Over [D−3, D+9] that
        is C, so on D−3…D−1 X's «Tort»/«Keks» lines (lettered A that day) are
        an orphan letter, shared evenly between c and d, and c's trud_plan
        reads half of what the page read over [D−3, D−1] alone. Expected: the
        letter of EACH day (`cell_links.letter_on(c, d)`), as `zagruzka_source`
        and «Plan Bajarish» already split."""
        lo, hi = self.SPAN
        self._there_and_back(reads=False)
        day = (D - timedelta(days=1)).strftime("%d.%m.%Y")
        alone = self.zagruzka_cell(X, lo, D - timedelta(days=1))["inputs"]
        both = self.zagruzka_cell(X, lo, hi)["inputs"]
        # Read over [D−3, D−1] alone: c (A) 30 min / 3 people, d (B) 4 / 2.
        self.assertEqual([(alone[k][day]["trud_plan"], alone[k][day]["o_soni"]) for k in ("0301", "0302")],
                         [(30.0, 3.0), (4.0, 2.0)])
        # Read over [D−3, D+9]: c is read as «C» on D−1 too, its A lines and
        # A pin fall to nobody and are halved with d — (15.0, 1.5), (19.0, 3.5).
        self.assertEqual([(both[k][day]["trud_plan"], both[k][day]["o_soni"]) for k in ("0301", "0302")],
                         [(30.0, 3.0), (4.0, 2.0)])
        self.assert_span_consistent([X, Y], lo, D, hi)


if __name__ == "__main__":
    unittest.main()
