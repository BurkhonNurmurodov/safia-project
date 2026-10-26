"""The retroactive one-shot of the catalog follow (2026-10-26, WP6 of
docs/plan-catalog-follows-cells.md): `catalog_follow_retro.run` against a
scratch Postgres (`SAFIA_TEST_PG`, see `pg_scratch`) with
`app.database.SessionLocal` pointed at it — the engine's world (`_World` of
`test_catalog_follow_engine`), plus the evidence the pass reads: attendance
rows, closed live-day rosters and the action register.

What it proves (spec §4): T10 through the retro path (a single hop found from
the evidence, h = 8 Oct, the old unit importing its catalog inside the window),
T11 (every named kind from its own fixture writes nothing), a T12-style dry run
leaving every table as it was, T16 (a second run is a no-op — by the flag, and
by the move records when the flag is gone — and the earlier attempt's moves are
still reported), the flag → RECORD → DM flow with the Telegram sender mocked,
and the pass that finds nothing. Review regressions: a cell already standing in
the new unit at the code holds no move back; `y_has_lines` beside two lettered
stayers; a cell that brings nothing is settled, not named; a letter changed by
hand after a pre-release landing is unknowable; a move read off the column
(12 Oct) is named as having no link history.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_catalog_follow_retro
"""
from __future__ import annotations

import io
import json
import unittest
from datetime import date, datetime, time, timedelta, timezone
from unittest import mock

try:
    from tests.pg_scratch import SERVER
    from tests.test_catalog_follow_engine import C, TZ, X, Y, Z, _days, _World
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER
    from test_catalog_follow_engine import C, TZ, X, Y, Z, _days, _World

from app.services import catalog_follow as cf
from app.services import catalog_follow_retro as retro
from app.services import pp_catalog

TODAY = date(2026, 10, 22)
NOW = datetime(2026, 10, 22, 6, 0, tzinfo=timezone.utc)
H = date(2026, 10, 14)                 # a landed brigadir change's day (links era)


class _Retro(_World):
    """The engine's world (which empties the evidence tables between tests
    too) and the evidence the pass reads."""

    # ── the evidence (`att` is the engine world's) ───────────────────────────

    def roster(self, unit, d, *cells):
        from app.models import LiveProjection
        self.db.add(LiveProjection(manager_id=unit, day=d, digest=f"{unit}{d}",
                                   roster=[[f"W{c.verifix_code}", c.verifix_code, "", True]
                                           for c in cells]))

    def applied(self, cell, to, eff, letter=None):
        """A brigadir change that has LANDED: the event applied, the column
        moved — what `cell_links.apply_due` leaves."""
        from app.models import CellLinkEvent
        ev = CellLinkEvent(cell_id=cell.id, field="manager_id", value=to, prev=cell.manager_id,
                           effective_from=eff,
                           effective_at=datetime.combine(eff, time(8), tzinfo=TZ),
                           applied_at=datetime.combine(eff, time(8, 1), tzinfo=TZ), src="manual",
                           vfx={"letter_before": letter if letter is not None else cell.wc_group})
        self.db.add(ev)
        cell.manager_id = to
        self.db.flush()
        return ev

    # ── running it ───────────────────────────────────────────────────────────

    def run_retro(self, **kw):
        self.db.commit()
        self.forget()
        rec = retro.run(self.db, today=kw.pop("today", TODAY), now=NOW)
        self.forget()
        return rec

    def flag(self):
        from app.models import AppSetting
        row = self.db.query(AppSetting).filter_by(key=retro.FLAG).first()
        return row.value if row else None

    def stored(self):
        from app.models import AppSetting
        row = self.db.query(AppSetting).filter_by(key=retro.RECORD).first()
        return json.loads(row.value) if row else None

    def catalog_fp(self):
        """Every catalog and quantity row and every cell — what a skipped
        move must leave exactly as it was."""
        return [r for r in self.fingerprint()
                if not r[0].startswith(("pp_catalog_moves", "cell_link_events"))]

    def skipped(self, rec, vcode):
        return [e for e in rec["skipped"] if e.get("vcode") == vcode]

    def assert_named(self, kind, vcode, before, rec, *, row=True):
        got = self.skipped(rec, vcode)
        self.assertTrue(got, rec["skipped"])
        self.assertEqual({e["kind"] for e in got}, {kind}, got)
        self.assertEqual(self.catalog_fp(), before)
        self.assertEqual(rec["moved"], [])
        if row:
            from app.models import Cell, PPCatalogMove
            cid = self.db.query(Cell.id).filter(Cell.verifix_code == vcode).scalar()
            rows = self.db.query(PPCatalogMove).filter(PPCatalogMove.cell_id == cid).all()
            self.assertTrue(rows)
            for r in rows:
                self.assertEqual((r.state, r.kind), ("named", "retro"))
                self.assertIn(kind, {n.get("kind") for n in r.named or []})
        self.assertTrue(self.flag().startswith("done:0/"))
        self.assertTrue(cf.enabled(self.db))

    def simple_event_world(self, vcode="3001"):
        """X: a lone cell at the code with one line and a day of quantities;
        its brigadir change to Y landed on H."""
        self.units(X, Y)
        c = self.cell(vcode, X)
        p = self.line(X, "F001", "Tort", labor=60)
        self.daily(X, H, "F001", plan=10, actual=8)
        self.daily(X, H - timedelta(days=1), "F001", plan=10, actual=8)
        ev = self.applied(c, Y, H)
        return c, p, ev


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class RetroPass(_Retro):
    """The moves it applies."""

    # ── T10: a single hop found from the evidence, an import in the window ───

    def test_t10_single_hop_with_an_import_in_the_window(self):
        from app.models import PPProduct
        h = date(2026, 10, 8)
        imp = date(2026, 10, 12)
        last = date(2026, 10, 14)
        self.units(X, Y)
        c = self.cell("0701", Y)                       # moved before link history: no event
        old1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        old2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        other = self.line(X, "F003", "Non", wc="B100", labor=12, sort=2)
        self.cell("0702", X, sap="B100")
        for day in _days(date(2026, 10, 5), last):
            self.daily(X, day, "F001", plan=10, actual=10)
            self.daily(X, day, "F002", plan=20, actual=15)
            self.daily(X, day, "F003", wc="B100", plan=5, actual=5)
        self.att(c, X, date(2026, 9, 29), h - timedelta(days=1))
        self.att(c, Y, h, date(2026, 10, 11))
        self.db.flush()
        # An ABC import on 12 Oct: frozen, every line re-created with a new id.
        pp_catalog.freeze(self.db, X, "import", day=imp)
        for q in (old1, old2, other):
            self.db.delete(q)
        self.db.flush()
        new1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        new2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        new3 = self.line(X, "F003", "Non", wc="B100", labor=12, sort=2)
        self.db.commit()
        lo = date(2026, 10, 5)
        hist0 = self.history([X, Y], lo, h - timedelta(days=1))
        mins0 = self.minutes([X, Y], h, last)

        rec = self.run_retro()

        self.assertEqual(rec["skipped"], [], rec["skipped"])
        [m] = rec["moved"]
        self.assertEqual((m["vcode"], m["from"], m["to"], m["h"], m["S"], m["source"]),
                         ("0701", X, Y, h.isoformat(), imp.isoformat(), "attendance"))
        self.assertEqual(m["lines"], 4)
        self.assertEqual(self.history([X, Y], lo, h - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], h, last), mins0)
        self.assert_unique([X, Y], lo, last)
        for day in _days(h, imp - timedelta(days=1)):
            self.assertEqual(self.ids_on(Y, day), {old1.id, old2.id})
            self.assertEqual(self.ids_on(X, day), {other.id})
        for day in _days(imp, last):
            self.assertEqual(self.ids_on(Y, day), {new1.id, new2.id})
            self.assertEqual(self.ids_on(X, day), {new3.id})
        [row] = self.move_rows()
        self.assertEqual((row.kind, row.state, row.event_id, row.home_from),
                         ("retro", "moved", None, h))
        self.assertEqual(set(row.line_ids), {old1.id, old2.id, new1.id, new2.id})
        self.assertEqual(self.db.query(PPProduct).filter_by(manager_id=Y).count(), 2)
        # Impact recorded on the pass, the cell named as moved before 12 Oct.
        imp_x = [i for i in rec["impact"] if i["unit"] == X and i["day"] == h.isoformat()]
        self.assertEqual(imp_x[0]["plan"], [21.0, 1.0])
        self.assertEqual(rec["pre12"], ["0701"])
        self.assertEqual(self.flag(), "done:1/0")
        self.assertTrue(cf.enabled(self.db))
        self.assertEqual(self.stored()["counts"]["moved"], 1)

    def test_moved_before_the_floor(self):
        """Standing in Y since before 6 Oct, last seen in X before the window:
        followed from 6 Oct."""
        self.units(X, Y)
        c = self.cell("0801", Y)
        p = self.line(X, "F001", "Tort")
        self.daily(X, cf.FOLLOW_FROM, "F001", plan=6, actual=6)
        self.att(c, X, date(2026, 8, 20), date(2026, 8, 25))
        self.att(c, Y, date(2026, 9, 29), date(2026, 10, 10))
        rec = self.run_retro()
        [m] = rec["moved"]
        self.assertEqual((m["h"], m["source"]), (cf.FOLLOW_FROM.isoformat(), "floor"))
        self.assertEqual(self.ids_on(Y, cf.FOLLOW_FROM), {p.id})
        self.assertEqual(self.ids_on(X, cf.FOLLOW_FROM - timedelta(days=1)), {p.id})

    def test_roster_evidence(self):
        """The closed live day's roster names the unit a cell stood in."""
        self.units(X, Y)
        c = self.cell("0901", Y)
        p = self.line(X, "F001", "Tort")
        for d in _days(date(2026, 10, 6), date(2026, 10, 8)):
            self.roster(X, d, c)
        for d in _days(date(2026, 10, 9), date(2026, 10, 11)):
            self.roster(Y, d, c)
        rec = self.run_retro()
        [m] = rec["moved"]
        self.assertEqual((m["h"], m["source"]), ("2026-10-09", "roster"))
        self.assertEqual(self.ids_on(Y, date(2026, 10, 9)), {p.id})
        self.assertEqual(self.ids_on(X, date(2026, 10, 8)), {p.id})

    def test_landed_event_moves(self):
        c, p, ev = self.simple_event_world()
        rec = self.run_retro()
        [m] = rec["moved"]
        self.assertEqual((m["event"], m["h"], m["source"]), (ev.id, H.isoformat(), "event"))
        self.assertEqual(self.ids_on(Y, H), {p.id})
        self.assertEqual(self.ids_on(X, H - timedelta(days=1)), {p.id})
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.event_id), ("moved", "retro", ev.id))
        self.assertEqual(self.flag(), "done:1/0")

    def test_a_cell_already_in_the_new_unit_does_not_hold_the_move_back(self):
        """Y keeps y1(A) at the code (it never stood in X): it is asked about
        X's orphans like every cell at the code, named nowhere, and the cell
        that came from X moves — joining y1's identical position."""
        self.units(X, Y)
        c = self.cell("3101", Y)
        y1 = self.cell("3102", Y, letter="A")
        p = self.line(X, "F001", "Tort", labor=60)
        m = self.line(Y, "F001", "Tort", labor=60, letter="A")
        h = date(2026, 10, 8)
        for d in _days(date(2026, 10, 5), date(2026, 10, 12)):
            self.daily(X, d, "F001", plan=10, actual=9)
            self.daily(Y, d, "F001", plan=10, actual=9)
        self.att(c, X, date(2026, 9, 29), h - timedelta(days=1))
        self.att(c, Y, h, date(2026, 10, 11))
        self.att(y1, Y, date(2026, 9, 29), date(2026, 10, 11))
        rec = self.run_retro()
        self.assertEqual(rec["skipped"], [])
        [mv] = rec["moved"]
        self.assertEqual((mv["vcode"], mv["h"], mv["joined"]), ("3101", h.isoformat(), 1))
        self.assertEqual(self.ids_on(X, h), set())
        self.assertEqual(self.ids_on(Y, h), {p.id, m.id})
        self.assertNotIn(str(y1.id), rec["evidence"])

    def test_moved_from_the_column_is_named_without_link_history(self):
        """Seen in X up to 11 Oct, in Y from the column (12 Oct): followed
        from 12 Oct, and named as a move no link history records."""
        self.units(X, Y)
        c = self.cell("3201", Y)
        p = self.line(X, "F001", "Tort")
        self.att(c, X, date(2026, 9, 29), date(2026, 10, 11))
        rec = self.run_retro()
        [m] = rec["moved"]
        self.assertEqual((m["h"], m["source"]), ("2026-10-12", "column"))
        self.assertEqual(rec["pre12"], ["3201"])
        self.assertEqual(self.ids_on(Y, date(2026, 10, 12)), {p.id})

    # ── G: a pre-12-Oct mover keeps the letter it already carries in Y ───────

    G_H = date(2026, 10, 8)
    G_LO, G_HI = date(2026, 10, 5), date(2026, 10, 12)

    def _pre12_world(self, *, second: bool = False):
        """c moved X → Y on 8 Oct, before link events existed: it stands in Y
        (the column) lettered B, and Y typed its people under B since the move
        and added a position for it under B. X still holds c's old position
        (X keeps no cell at the code: an unlettered orphan). y1 (A) has stood
        in Y all along — and, with `second`, y2 (C) beside it."""
        h = self.G_H
        self.units(X, Y)
        c = self.cell("3801", Y, letter="B")
        y1 = self.cell("3802", Y, letter="A")
        w = {"c": c, "y1": y1}
        w["lx"] = self.line(X, "F001", "Tort", labor=60)
        w["l1"] = self.line(Y, "F005", "Pirog", labor=20, letter="A")
        w["lc"] = self.line(Y, "F006", "Keks", labor=30, letter="B", sort=1)
        if second:
            w["y2"] = self.cell("3803", Y, letter="C")
            w["l2"] = self.line(Y, "F007", "Non", labor=12, letter="C", sort=2)
        for d in _days(self.G_LO, self.G_HI):
            self.daily(X, d, "F001", plan=10, actual=9)
            self.daily(Y, d, "F005", plan=6, actual=6)
            self.daily(Y, d, "F006", plan=4, actual=4)
            self.pin(Y, d, group="A", people=5)
            if d >= h:
                self.pin(Y, d, group="B", people=3)         # c's people, typed in Y
            else:
                self.pin(X, d, people=3)                    # …and in X before it left
            if second:
                self.daily(Y, d, "F007", plan=2, actual=2)
                self.pin(Y, d, group="C", people=2)
        self.att(c, X, date(2026, 9, 29), h - timedelta(days=1))
        self.att(c, Y, h, date(2026, 10, 11))
        for k in ("y1", "y2"):
            if k in w:
                self.att(w[k], Y, date(2026, 9, 29), date(2026, 10, 11))
        self.db.commit()
        return w

    def _cell_pins(self, unit, a, b):
        from app.models import Cell
        from app.services import zagruzka_source as zs
        cells = self.db.query(Cell).filter(Cell.manager_id == unit).all()
        return zs.cell_pins(cells, zs.typed_pins(self.db, [unit], a, b))

    def assert_pre12_kept(self, w, rec, hist0, mins0, pins0):
        from app.models import Cell, PPWorkCenterDaily
        h, hi = self.G_H, self.G_HI
        self.assertEqual(rec["skipped"], [], rec["skipped"])
        [m] = rec["moved"]
        self.assertEqual((m["vcode"], m["h"], m["letter_from"], m["letter_to"], m["letters"]),
                         ("3801", h.isoformat(), None, "B", {}))
        c = self.db.get(Cell, w["c"].id)
        self.assertEqual(c.wc_group, "B")                  # kept: no letter change, no history
        self.assertEqual(self.history([X, Y], self.G_LO, h - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], h, hi), mins0)          # Σ conserved
        self.assert_unique([X, Y], self.G_LO, hi)
        want = {w["l1"].id: "A", w["lc"].id: "B", w["lx"].id: "B"}
        if "l2" in w:
            want[w["l2"].id] = "C"
        for d in _days(h, hi):
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, d).lines}, want)
            self.assertEqual(self.ids_on(X, d), set())
        # Its pins stay claimed: Y's B pins untouched, and c reads them.
        pins = {(r.wc_group, r.people) for r in self.db.query(PPWorkCenterDaily).filter(
            PPWorkCenterDaily.manager_id == Y, PPWorkCenterDaily.date >= h)}
        self.assertEqual({g for g, _n in pins}, {"A", "B"} | ({"C"} if "l2" in w else set()))
        self.assertEqual({n for g, n in pins if g == "B"}, {3})
        got = self._cell_pins(Y, h, hi)
        for d in _days(h, hi):
            iso = d.isoformat()
            self.assertEqual(got[(c.id, iso)][0], 3.0)
            self.assertEqual(got[(w["y1"].id, iso)][0], 5.0)
        self.assertEqual(got, pins0)

    def test_pre12_mover_keeps_its_letter_beside_a_lone_stayer(self):
        """y1 (A) is the lone stayer — the sibling rule hands it every position
        and pin of Y nobody claims. c's own B positions and B pins are claimed
        — by c, which keeps B: they stay its, and X's orphan arrives under B."""
        w = self._pre12_world()
        hist0 = self.history([X, Y], self.G_LO, self.G_H - timedelta(days=1))
        mins0 = self.minutes([X, Y], self.G_H, self.G_HI)
        pins0 = self._cell_pins(Y, self.G_H, self.G_HI)
        rec = self.run_retro()
        self.assert_pre12_kept(w, rec, hist0, mins0, pins0)

    def test_pre12_mover_keeps_its_letter_beside_two_stayers(self):
        """y1 (A) and y2 (C) stay: c keeps B, and its own B position in Y is
        no stranger to it (`y_has_lines` names only what nobody claims)."""
        w = self._pre12_world(second=True)
        hist0 = self.history([X, Y], self.G_LO, self.G_H - timedelta(days=1))
        mins0 = self.minutes([X, Y], self.G_H, self.G_HI)
        pins0 = self._cell_pins(Y, self.G_H, self.G_HI)
        rec = self.run_retro()
        self.assert_pre12_kept(w, rec, hist0, mins0, pins0)

    def test_a_kept_letter_another_stayer_carries_is_not_kept(self):
        """y1 carried B on the move day and was re-lettered A since: B is a
        STAYER's letter on h−1, so c cannot keep it — it takes a free one, as
        any arrival does (the live rule)."""
        from app.models import CellLinkEvent
        w = self._pre12_world()
        y1 = w["y1"]
        # y1's letter on h−1 was B (its own dated letter history).
        self.db.add(CellLinkEvent(cell_id=y1.id, field="manager_id", value=Y, prev=Y,
                                  effective_from=self.G_H + timedelta(days=1),
                                  effective_at=datetime.combine(self.G_H, time(0), tzinfo=TZ),
                                  applied_at=NOW, src="catalog_follow",
                                  vfx={"catalog_mark": True, "wc_group_was": "B"}))
        self.db.commit()
        self.forget()
        plan = cf.build_plan(self.db, [cf.Transfer(cell_id=w["c"].id, event_id=None, src=X, dst=Y,
                                                   home_from=self.G_H, letter_src=None)])
        self.assertEqual(plan.staying_dst[Y], {y1.id: "B"})
        self.assertNotIn(Y, plan.own_dst)
        self.assertNotIn(plan.letter_dst[w["c"].id], {"A", "B", None})

    def test_a_live_move_keeps_todays_rule(self):
        """The plan for a move the links date (an event): the cell stood in X
        the day before, so its column letter is NOT its own in Y — a Y pin
        carrying that letter still makes it take a free one."""
        self.units(X, Y)
        c = self.cell("3901", X, letter="B")
        y1 = self.cell("3902", Y, letter="A")
        self.line(X, "F001", "Tort", letter="B")
        self.pin(Y, H, group="B", people=1)                 # Y's past carried B
        ev = self.applied(c, Y, H, letter="B")
        self.db.commit()
        self.forget()
        plan = cf.build_plan(self.db, [cf.Transfer(cell_id=c.id, event_id=ev.id, src=X, dst=Y,
                                                   home_from=H, letter_src="B")])
        self.assertEqual(plan.own_dst, {})
        self.assertEqual(plan.letter_dst[c.id], "C")
        self.assertEqual(plan.staying_dst[Y], {y1.id: "A"})

    def test_a_cell_that_brings_nothing_is_settled_not_named(self):
        """X held nothing at the code; Y has positions there: nothing moves,
        and the change is settled (`nothing`), not left for a person."""
        self.units(X, Y)
        c = self.cell("3301", X)
        self.line(Y, "F009", "Rulet", labor=30)
        ev = self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assertEqual((rec["moved"], rec["skipped"]), ([], []))
        self.assertEqual([(e["vcode"], e["state"]) for e in rec["settled"]], [("3301", "nothing")])
        self.assertEqual(self.flag(), "done:0/0")
        self.assertEqual(self.catalog_fp(), before)
        [row] = self.move_rows()
        self.assertEqual((row.state, row.event_id), ("nothing", ev.id))

    def test_a_cell_that_brings_nothing_is_settled_beside_an_unproven_stayer(self):
        """X holds nothing at the code — no line, no work-centre row — and a
        cell of X stands there with no evidence of it. Whoever really stood
        there, nothing can move: settled `nothing`, never `stayer_unproven`
        (a person would be asked about a move that changes nothing)."""
        self.units(X, Y)
        c = self.cell("3311", X)
        self.cell("3312", X, letter="B")                    # no attendance, no event
        self.line(Y, "F009", "Rulet", labor=30)
        ev = self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assertEqual(rec["skipped"], [])
        self.assertEqual([(e["vcode"], e["state"]) for e in rec["settled"]], [("3311", "nothing")])
        self.assertEqual(self.catalog_fp(), before)
        [row] = self.move_rows()
        self.assertEqual((row.state, row.event_id), ("nothing", ev.id))

    def test_a_pre12_letter_another_cell_row_carries_is_not_its_own(self):
        """c (B) stands in Y beside y1 (A) and y2 (C) — and an ARCHIVED cell
        row of Y at the code carries B too (archived long ago, so no window
        move; a box where `uq_cells_wc_group` could not be built). The engine
        does not let c keep a letter another row carries (`own_dst`): it is
        re-lettered, and the Y position under B is then nobody's — shared by
        everyone. The guard reads it the same way: `y_has_lines`, nothing
        written."""
        from sqlalchemy import text
        from app.models import Cell
        w = self._pre12_world(second=True)
        with self.pg.engine.begin() as conn:
            conn.execute(text("DROP INDEX IF EXISTS uq_cells_wc_group"))
        try:
            old = Cell(verifix_code="3809", sap_code=C, manager_id=Y, wc_group="B",
                       archived_at=datetime(2026, 9, 1, 12, tzinfo=timezone.utc), archived_by="t")
            self.db.add(old)
            self.db.commit()
            before = self.catalog_fp()
            rec = self.run_retro()
            # No landing event: a named move of it is said, never recorded.
            self.assert_named("y_has_lines", "3801", before, rec, row=False)
            [e] = self.skipped(rec, "3801")
            self.assertEqual(e["params"]["lines"], ["Keks"])
            self.assertEqual(self.db.get(Cell, w["c"].id).wc_group, "B")
        finally:
            self.db.rollback()
            self.db.query(Cell).filter(Cell.verifix_code == "3809").delete()
            self.db.commit()
            with self.pg.engine.begin() as conn:
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_cells_wc_group ON cells "
                    "(manager_id, upper(regexp_replace(sap_code, '\\s', '', 'g')), wc_group) "
                    "WHERE wc_group IS NOT NULL AND sap_code IS NOT NULL AND manager_id IS NOT NULL"))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class RetroGuards(_Retro):
    """T11: every named kind, each from its own fixture, writes nothing."""

    def test_chain(self):
        self.units(X, Y, Z)
        c = self.cell("1101", X)
        self.line(X, "F001", "Tort")
        self.applied(c, Y, date(2026, 10, 13))
        self.applied(c, Z, date(2026, 10, 15))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("chain", "1101", before, rec)
        self.assertEqual(len(self.move_rows()), 2)          # one per event

    def test_from_unknown(self):
        """In Y since before the window, never seen in X: the orphans in X
        are not shown to be this cell's."""
        self.units(X, Y)
        c = self.cell("1201", Y)
        self.line(X, "F001", "Tort")
        self.att(c, Y, date(2026, 9, 29), date(2026, 10, 11))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("from_unknown", "1201", before, rec, row=False)

    def test_day_unknown(self):
        self.units(X, Y)
        c = self.cell("1301", Y)
        self.line(X, "F001", "Tort")
        self.att(c, X, date(2026, 9, 29), date(2026, 9, 30))
        self.att(c, Y, date(2026, 10, 9), date(2026, 10, 11))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("day_unknown", "1301", before, rec, row=False)

    def test_letter_ambiguous(self):
        """X keeps a cell at the code, and the orphans carry two letters."""
        self.units(X, Y)
        self.cell("1402", X, letter="A")
        c = self.cell("1401", Y)
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        self.line(X, "F003", "Non", letter="C", sort=2)
        self.att(c, X, date(2026, 9, 29), date(2026, 10, 7))
        self.att(c, Y, date(2026, 10, 8), date(2026, 10, 11))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("letter_ambiguous", "1401", before, rec, row=False)

    def test_shared_lines(self):
        """The cell's letter is clear, but X holds an unlettered line it shared
        with the cell that stayed."""
        self.units(X, Y)
        stay = self.cell("1502", X, letter="A")
        c = self.cell("1501", Y)
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        self.line(X, "F003", "Non", sort=2)
        self.att(stay, X, date(2026, 9, 29), date(2026, 10, 11))      # it really stayed
        self.att(c, X, date(2026, 9, 29), date(2026, 10, 7))
        self.att(c, Y, date(2026, 10, 8), date(2026, 10, 11))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("shared_lines", "1501", before, rec, row=False)

    def test_y_has_lines(self):
        c, _p, _ev = self.simple_event_world("1601")
        self.line(Y, "F009", "Rulet", labor=30)             # nobody of Y owns it
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("y_has_lines", "1601", before, rec)

    def test_y_has_lines_beside_lettered_stayers(self):
        """Y keeps two lettered cells and a position neither letter claims:
        split evenly today, the arrival would take a share of it."""
        self.units(X, Y)
        c = self.cell("1611", X)
        for vc, g in (("1612", "A"), ("1613", "B")):
            self.att(self.cell(vc, Y, letter=g), Y, date(2026, 10, 1), H)    # both really stood there
        self.line(X, "F001", "Tort", labor=60)
        self.line(Y, "F010", "Keks", labor=30, letter="A")
        self.line(Y, "F011", "Non", labor=30, letter="B", sort=1)
        self.line(Y, "F012", "Pirog", labor=30, sort=2)
        self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("y_has_lines", "1611", before, rec)

    def test_letter_changed_by_hand_after_the_landing(self):
        """A change that landed before the follow existed kept no letter of its
        own; the cell was re-lettered by hand in Y since — the letter it left X
        with is unknowable."""
        from app.models import ActionLog, CellLinkEvent
        self.units(X, Y)
        self.cell("1622", X, letter="A")
        c = self.cell("1621", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        ev = self.applied(c, Y, H)
        ev.vfx = {}                                    # landed before `letter_before` existed
        c.wc_group = "D"
        self.db.add(ActionLog(category="org", action="cell.updated", outcome="done", source="web",
                              target_kind="cell", target_id=str(c.id),
                              created_at=datetime.combine(H + timedelta(days=2), time(10), tzinfo=TZ),
                              changes=[["wc_group", "B", "D"]]))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("letter_ambiguous", "1621", before, rec)

    def test_window_cells_moved(self):
        """Two cells left X at one code on one day: followed one at a time
        they would take each other's positions — neither is."""
        self.units(X, Y, Z)
        c1 = self.cell("1701", X, letter="A")
        c2 = self.cell("1702", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        self.applied(c1, Y, H)
        self.applied(c2, Z, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("window_cells_moved", "1701", before, rec)
        self.assert_named("window_cells_moved", "1702", before, rec)

    def test_orphans_of_another_cell_are_not_handed_to_a_landed_change(self):
        """X held a (A) and b (B) at the code. b moved to Y on 3 Oct — before
        link events, so it has none — and its position «Keks» (B) stayed in X.
        a then left X for Z with a landed change on H. The change accounts for
        a's A position only: handed «Keks» too (a lone departer takes every
        line nobody claims) it would carry b's position to Z. a is named,
        b is asked about X's orphans and named too, nothing is written."""
        self.units(X, Y, Z)
        a = self.cell("4401", X, letter="A")
        b = self.cell("4402", Y, letter="B")                # moved X → Y on 3 Oct, no event
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        for d in _days(date(2026, 10, 1), H + timedelta(days=2)):
            self.daily(X, d, "F001", plan=10, actual=9)
            self.daily(X, d, "F002", plan=20, actual=18)
        self.att(b, X, date(2026, 9, 29), date(2026, 10, 2))
        self.att(b, Y, date(2026, 10, 3), date(2026, 10, 11))
        self.att(a, X, date(2026, 9, 29), H - timedelta(days=1))
        self.applied(a, Z, H, letter="A")
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("letter_ambiguous", "4401", before, rec)
        [e] = self.skipped(rec, "4401")
        self.assertEqual((e["params"]["why"], e["params"]["letters"], e["params"]["letter"]),
                         ("orphans_of_another_cell", ["B"], "A"))
        self.assertTrue(self.skipped(rec, "4402"), rec["skipped"])
        self.assertIn("boshqa yacheykaning pozitsiyalari", retro.text_of(rec))

    def _hop_world(self, *, before_window: bool):
        """b left X at the code shortly before 6 Oct — within the window
        (X until 2 Oct, Y from 3 Oct) or before it (X in mid-September, Y from
        the window's first day) — leaving nothing of its own in X; a (A) then
        left X for Z with a landed change on H."""
        self.units(X, Y, Z)
        a = self.cell("4501", X, letter="A")
        b = self.cell("4502", Y, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.daily(X, H, "F001", plan=10, actual=9)
        if before_window:
            self.att(b, X, date(2026, 9, 10), date(2026, 9, 15))
            self.att(b, Y, date(2026, 9, 29), date(2026, 10, 11))
        else:
            self.att(b, X, date(2026, 9, 29), date(2026, 10, 2))
            self.att(b, Y, date(2026, 10, 3), date(2026, 10, 11))
        self.applied(a, Z, H, letter="A")
        self.db.commit()

    def test_window_cells_moved_counts_a_hop_before_the_floor(self):
        """The pass itself follows such a hop from 6 Oct (`_decide_orphan`), so
        it is a move of its window: a, leaving the same unit at the same code,
        is not followed past it — `window_cells_moved`, nothing written."""
        self._hop_world(before_window=False)
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("window_cells_moved", "4501", before, rec)
        [e] = self.skipped(rec, "4501")
        self.assertEqual((e["params"]["other"], e["params"]["day"], e["params"]["what"]),
                         ("4502", "2026-10-03", "evidence"))

    def test_window_cells_moved_counts_a_hop_from_the_prior_placement(self):
        """The same with b's last placement in X before the window and Y from
        its first day: the hop from `prior` counts."""
        self._hop_world(before_window=True)
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("window_cells_moved", "4501", before, rec)
        [e] = self.skipped(rec, "4501")
        self.assertEqual((e["params"]["other"], e["params"]["day"]), ("4502", "2026-09-29"))

    def _stayer_world(self, *, evidence: bool):
        """c (A) X → Y landed on H with its position; a cell 3502 stands in Y
        at the code with no letter — opened on 20 Oct (cells carry no creation
        date, so the dated links stand it there on every day), or, with
        `evidence`, really there all along (attendance from 1 Oct)."""
        self.units(X, Y)
        c = self.cell("3501", X, letter="A")
        p = self.line(X, "F001", "Tort", letter="A")
        q = self.line(Y, "F009", "Rulet", labor=30)                 # Y's, unlettered
        self.daily(X, H, "F001", plan=10, actual=8)
        self.applied(c, Y, H)
        late = self.cell("3502", Y)
        if evidence:
            self.att(late, Y, date(2026, 10, 1), H)
        self.db.commit()
        return c, p, q, late

    def test_stayer_unproven_in_the_new_unit(self):
        """Counted as having stayed in Y the unlettered 3502 would be the lone
        sibling: given a letter from H (with a letter history it never had)
        and handed Y's unclaimed position. Nothing shows it stood there by H —
        named, nothing written."""
        from app.models import Cell, CellLinkEvent
        c, _p, _q, late = self._stayer_world(evidence=False)
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("stayer_unproven", "3501", before, rec)
        [e] = self.skipped(rec, "3501")
        self.assertEqual(e["params"], {"other": "3502", "unit": Y, "day": H.isoformat()})
        self.assertIsNone(self.db.get(Cell, late.id).wc_group)
        self.assertFalse(any("siblings_was" in (ev.vfx or {})
                             for ev in self.db.query(CellLinkEvent).all()))

    def test_a_stayer_shown_there_counts(self):
        """The same with attendance placing 3502 in Y by H: it is a stayer —
        the move goes through, the sibling rule letters it from H."""
        from app.models import Cell
        from app.services import cell_links
        c, p, q, late = self._stayer_world(evidence=True)
        rec = self.run_retro()
        self.assertEqual(rec["skipped"], [], rec["skipped"])
        [m] = rec["moved"]
        self.assertEqual(m["vcode"], "3501")
        self.assertEqual((self.ids_on(Y, H), self.ids_on(X, H)), ({p.id, q.id}, set()))
        self.assertEqual(self.db.get(Cell, late.id).wc_group, "B")
        self.assertIsNone(cell_links.letter_on(self.db.get(Cell, late.id), H - timedelta(days=1)))

    def test_stayer_unproven_in_the_old_unit(self):
        """X: c (A) left on H; 3602 (B) stands in X at the code — opened later,
        nothing shows it there by H. Counted, it would keep X's B position from
        c (c alone owns every line no stayer claims). Named, nothing written."""
        self.units(X, Y)
        c = self.cell("3601", X, letter="A")
        self.cell("3602", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("stayer_unproven", "3601", before, rec)
        [e] = self.skipped(rec, "3601")
        self.assertEqual((e["params"]["other"], e["params"]["unit"]), ("3602", X))

    def test_a_stayer_moved_there_by_its_own_event_counts(self):
        """A link event of the stayer's own that put it in the unit by H is
        evidence too — no attendance needed."""
        from app.models import CellLinkEvent
        self.units(X, Y, Z)
        c = self.cell("3701", X, letter="A")
        stay = self.cell("3702", Z, letter="B")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        early = date(2026, 9, 20)                 # before FLOOR: no window move
        self.db.add(CellLinkEvent(cell_id=stay.id, field="manager_id", value=X, prev=Z,
                                  effective_from=early,
                                  effective_at=datetime.combine(early, time(8), tzinfo=TZ),
                                  applied_at=datetime.combine(early, time(8, 1), tzinfo=TZ),
                                  src="manual", vfx={}))
        stay.manager_id = X
        self.applied(c, Y, H)
        self.db.commit()
        rec = self.run_retro()
        self.assertEqual(rec["skipped"], [], rec["skipped"])
        [m] = rec["moved"]
        self.assertEqual(m["vcode"], "3701")
        self.assertEqual((self.ids_on(Y, H), self.ids_on(X, H)), ({la.id}, {lb.id}))

    def test_letters_after(self):
        from app.models import CellLinkEvent
        c, _p, _ev = self.simple_event_world("1801")
        later = date(2026, 10, 18)
        self.db.add(CellLinkEvent(cell_id=c.id, field="manager_id", value=Y, prev=Y,
                                  effective_from=later,
                                  effective_at=datetime.combine(later, time(0), tzinfo=TZ),
                                  applied_at=NOW, src="catalog_follow",
                                  vfx={"catalog_mark": True, "wc_group_was": None}))
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("letters_after", "1801", before, rec)

    def test_archived(self):
        c, _p, _ev = self.simple_event_world("1901")
        c.archived_at = datetime(2026, 10, 18, 9, tzinfo=TZ)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("archived", "1901", before, rec)

    def test_no_code(self):
        """No SAP code to carry positions by: a final record, and SETTLED — it
        is no move a person must decide, so neither the hand-resolution list
        nor the flag's named count holds it."""
        from app.models import PPCatalogMove
        self.units(X, Y)
        c = self.cell("2001", X, sap=None)
        self.line(X, "F001", "Tort")
        self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assertEqual((rec["moved"], rec["skipped"]), ([], []))
        self.assertEqual([(e["vcode"], e["kind"]) for e in rec["settled"]], [("2001", "no_code")])
        self.assertEqual(self.catalog_fp(), before)
        [row] = self.db.query(PPCatalogMove).filter(PPCatalogMove.cell_id == c.id).all()
        self.assertEqual((row.state, [n["kind"] for n in row.named]), ("named", ["no_code"]))
        self.assertEqual(self.flag(), "done:0/0")

    def test_conservation(self):
        """Y's own line read a 0/0 snapshot the arrival's figures would fill:
        minutes from nowhere — the engine's strict check stops it."""
        self.units(X, Y)
        c = self.cell("2101", X)
        self.att(self.cell("2102", Y, letter="A"), Y, date(2026, 10, 1), H)
        self.line(X, "F001", "Tort", labor=60)
        self.line(Y, "F001", "Keks", labor=30, letter="A")
        self.daily(X, H, "F001", plan=100, actual=90)
        self.daily(Y, H, "F001", plan=0, actual=0)
        self.applied(c, Y, H)
        self.db.commit()
        before = self.catalog_fp()
        rec = self.run_retro()
        self.assert_named("conservation", "2101", before, rec)

    def test_volume(self):
        """Too much at once: NOTHING is applied and nothing is recorded per
        cell — not the real move's final `named` row, not the `nothing` of a
        change that brings nothing (a new cell given its first brigadir). The
        flag reads `volume:` and not `done`, so the sweep stays off; the pass
        is due again at the next boot, and with the cap raised it completes."""
        from app.models import Cell, PPCatalogMove
        _c, p, ev = self.simple_event_world("2201")
        fresh = self.cell("2202", None, sap="B300")
        self.applied(fresh, Y, H)
        self.db.commit()
        before = self.fingerprint()
        with mock.patch.object(retro, "MAX_CELLS", 0):
            rec = self.run_retro()
            self.assertEqual(rec["result"], "volume")
            self.assertEqual((rec["cells"], rec["rows"]), (1, 1))
            self.assertEqual([m["vcode"] for m in rec["real"]], ["2201"])
            self.assertEqual(self.flag(), "volume:1/1")
            self.assertEqual(self.fingerprint(), before)
            self.assertEqual(self.move_rows(), [])
            self.assertFalse(cf.enabled(self.db))
            self.assertTrue(retro.pending(self.db))
            self.assertEqual(retro.dm_mode(self.db), "volume_1_1")
            text_ = retro.text_of(self.stored())
            self.assertIn("HECH NARSA QO'LLANMADI", text_)
            self.assertIn("MAX_CELLS", text_)
            self.assertIn("2201", text_)
            # The next boot trips it again on the same numbers: the same DM.
            self.run_retro()
            self.assertEqual(self.flag(), "volume:1/1")
            self.assertEqual(self.move_rows(), [])
        # A deploy raising the cap: the pass completes.
        rec = self.run_retro()
        self.assertEqual([m["vcode"] for m in rec["moved"]], ["2201"])
        self.assertEqual(self.flag(), "done:1/0")
        self.assertTrue(cf.enabled(self.db))
        self.assertEqual(self.ids_on(Y, H), {p.id})
        [row] = self.db.query(PPCatalogMove).filter(PPCatalogMove.cell_id == fresh.id).all()
        self.assertEqual(row.state, "nothing")
        self.assertIn("from_no_unit", {n["kind"] for n in row.named})
        self.assertIsNotNone(self.db.get(Cell, fresh.id))

    def _volume_world(self):
        """a (A) X → Y on H with its one position; s (B) stays in X with two
        of its own; Y keeps y1 (C) with a position of its own. Every SKU has a
        snapshot every day from H−2 to H+3, every letter a pin, and a's
        position one per-line value on H."""
        self.units(X, Y)
        a = self.cell("4601", X, letter="A")
        s = self.cell("4602", X, letter="B")
        y1 = self.cell("4603", Y, letter="C")
        self.att(s, X, date(2026, 10, 1), TODAY)                  # both really stood there
        self.att(y1, Y, date(2026, 10, 1), TODAY)
        la = self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B", sort=1)
        self.line(X, "F003", "Non", letter="B", sort=2)
        self.line(Y, "F009", "Rulet", letter="C")
        for d in _days(H - timedelta(days=2), H + timedelta(days=3)):
            for sku in ("F001", "F002", "F003"):
                self.daily(X, d, sku, plan=10, actual=9)
            self.daily(Y, d, "F009", plan=5, actual=5)
            self.pin(X, d, group="A", people=2)
            self.pin(X, d, group="B", people=3)
            self.pin(Y, d, group="C", people=4)
        self.db.flush()
        self.line_daily(la, H, plan=11)
        self.applied(a, Y, H, letter="A")
        self.db.commit()
        return a, la

    def test_volume_counts_what_the_follow_touches(self):
        """The cap is read against what the follow re-keys: X's rows of a's
        own position (4 snapshots, 1 per-line value) and X's pins at the code
        (8), from H — 13. Not the stayer's SKUs, not the new unit's own, not
        a day before H (the old count read 33)."""
        a, la = self._volume_world()
        before = self.fingerprint()
        with mock.patch.object(retro, "MAX_ROWS", 12):
            rec = self.run_retro()
        self.assertEqual((rec["result"], rec["cells"], rec["rows"]), ("volume", 1, 13))
        self.assertEqual([(m["vcode"], m["rows"], m["lines"]) for m in rec["real"]], [("4601", 13, 1)])
        self.assertEqual(self.flag(), "volume:1/13")
        self.assertEqual(self.fingerprint(), before)
        # Nothing final: the sweep stays off, the pass runs again at the next
        # boot, and the DM says nothing was applied — once per count.
        self.assertTrue(retro.pending(self.db))
        self.assertFalse(cf.enabled(self.db))
        self.assertEqual(retro.dm_mode(self.db), "volume_1_13")
        self.assertIn("HECH NARSA QO'LLANMADI", retro.text_of(rec))
        from app.services import action_log
        with mock.patch.object(retro, "MAX_ROWS", 13), \
                mock.patch.object(action_log, "record_system") as journal:
            rec = self.run_retro()
        self.assertEqual([m["vcode"] for m in rec["moved"]], ["4601"])
        self.assertEqual(self.flag(), "done:1/0")
        # One Jurnal row for the pass that applied, marked retro.
        [call] = journal.call_args_list
        self.assertEqual(call.args[:2], ("org", "org.catalog_moved"))
        details = call.kwargs["details"]
        self.assertIn(("kind", "retro"), details)
        self.assertIn(("catalog_moved", 1), details)
        self.assertIn(la.id, self.ids_on(Y, H))


class DmText(unittest.TestCase):
    def test_settled_outcomes_are_not_to_resolve_by_hand(self):
        """What brought nothing to move is one line apart; what a person must
        decide is listed — the strict stops and the retro's guards first."""
        skipped = [{"vcode": f"9{i:03}", "from": 1, "to": 2, "state": "nothing", "kind": "nothing"}
                   for i in range(30)]
        skipped += [{"vcode": "0001", "from": 1, "to": 2, "state": "named", "kind": "no_code"},
                    {"vcode": "0002", "from": 1, "to": 2, "state": "named", "kind": "stayer_unproven"}]
        rec = {"result": "done", "moved": [], "skipped": skipped, "busy": [], "units": {}}
        text = retro.text_of(rec)
        hand = text.split("⚠️")[1].split("✔️")[0]
        self.assertIn("0002", hand)
        self.assertNotIn("9000", hand)
        self.assertNotIn("0001", hand)
        self.assertIn("Ko'chadigan narsa yo'q: 31", text)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class RetroFlow(_Retro):
    """The rehearsal, idempotency, the flag → record → DM flow."""

    def test_t12_dry_run_leaves_everything(self):
        self.simple_event_world("2301")
        self.db.commit()
        before = self.fingerprint()
        with mock.patch.object(retro, "RETRO_APPLY", False):
            rec = self.run_retro()
            self.assertEqual(len(rec["moved"]), 1)
            self.assertEqual(rec["result"], "dry")
            self.assertEqual(self.fingerprint(), before)
            self.assertEqual(self.flag(), "dry:1")
            self.assertFalse(cf.enabled(self.db))
            self.assertFalse(retro.pending(self.db))
            self.assertEqual(retro.dm_mode(self.db), "dry")
            stored = self.stored()
            self.assertIn("SINOV", retro.text_of(stored))
            from openpyxl import load_workbook
            wb = load_workbook(io.BytesIO(retro.workbook(stored)))
            self.assertEqual(wb.sheetnames, ["Rejada", "Qoldirildi", "Dalil", "Ta'sir"])
            self.assertEqual(wb["Rejada"]["A2"].value, "2301")
        # Applying is due once the moves are to be applied.
        self.assertTrue(retro.pending(self.db))
        rec = self.run_retro()
        self.assertEqual(self.flag(), "done:1/0")
        self.assertEqual([r.state for r in self.move_rows()], ["moved"])

    def test_t16_second_run_is_a_noop(self):
        from app.models import AppSetting
        self.simple_event_world("2401")
        self.units(Z)
        e = self.cell("2402", Z, sap="B100")
        self.line(Y, "F005", "Pirog", wc="B100")           # an orphan of nobody's move
        self.att(e, Z, date(2026, 9, 29), date(2026, 10, 11))
        rec1 = self.run_retro()
        self.assertEqual(len(rec1["moved"]), 1)
        fp = self.fingerprint()
        flag = self.flag()
        # By the flag.
        self.assertEqual(retro.run(self.db, today=TODAY, now=NOW), {"state": "skipped"})
        self.assertEqual(self.fingerprint(), fp)
        # By the move records, with the flag gone (a pass stopped half-way by a
        # deploy leaves exactly this): nothing is followed twice, and what the
        # earlier attempt moved is still REPORTED — a re-run that only said
        # «nothing to move» would hide every move already made.
        self.db.query(AppSetting).filter_by(key=retro.FLAG).delete()
        self.db.commit()
        rec2 = self.run_retro()
        self.assertEqual([(m["vcode"], m.get("earlier")) for m in rec2["moved"]],
                         [("2401", True)])
        self.assertEqual([e["kind"] for e in rec2["skipped"]],
                         [e["kind"] for e in rec1["skipped"]])
        self.assertEqual(self.fingerprint(), fp)
        self.assertEqual((flag, self.flag()), ("done:1/1", "done:1/1"))
        self.assertIn("oldingi urinishda", retro.text_of(rec2))
        # …and the sweep finds nothing left either.
        self.assertEqual(self.groups(), [])

    def test_busy_is_left_to_the_sweep(self):
        """An edit holds the old unit's catalog: the transfer is recorded busy
        (a retro one), the pass still finishes, and the sweep — on once the
        flag reads done — follows it strict on its retry."""
        from app.models import PPCatalogMove
        _c, p, ev = self.simple_event_world("2701")
        self.db.commit()
        other = self.pg.Session()
        self.others.append(other)
        self.assertTrue(pp_catalog.lock(other, [X]))
        rec = self.run_retro()
        self.assertEqual([b["vcode"] for b in rec["busy"]], ["2701"])
        self.assertEqual(self.flag(), "done:0/0")
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.event_id), ("busy", "retro", ev.id))
        other.rollback()
        self.db.query(PPCatalogMove).update(
            {"next_try_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
        self.db.commit()
        with mock.patch("app.services.action_log.record_system"), mock.patch.object(cf, "_dm"):
            cf.run_sweep()
        self.forget()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind), ("moved", "retro"))
        self.assertEqual(self.ids_on(Y, H), {p.id})

    def _busy_then(self, vcode):
        """The simple world's move, recorded `busy` by the pass (an edit held
        X), the lock released and the retry made due — what the sweep finds."""
        from app.models import PPCatalogMove
        c, p, ev = self.simple_event_world(vcode)
        self.db.commit()
        other = self.pg.Session()
        self.others.append(other)
        self.assertTrue(pp_catalog.lock(other, [X]))
        rec = self.run_retro()
        self.assertEqual([b["vcode"] for b in rec["busy"]], [vcode])
        other.rollback()
        self.db.query(PPCatalogMove).update(
            {"next_try_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
        self.db.commit()
        return c, p, ev

    def sweep(self):
        with mock.patch("app.services.action_log.record_system"), \
                mock.patch.object(cf, "_dm") as dm:
            cf.run_sweep()
        self.forget()
        return dm

    def test_sweep_rechecks_a_retro_retry(self):
        """A position nobody of Y claims appears at the code before the sweep
        retries the busy transfer. The engine's strict stops would let the
        arrival take it (a lone arrival owns every line there); the pass's own
        `y_has_lines` would not — the sweep runs the pass's guards first, and
        names it. Nothing is written; the record is final."""
        from app.models import PPCatalogMove
        _c, p, ev = self._busy_then("4001")
        self.line(Y, "F009", "Rulet", labor=30)
        self.db.commit()
        before = self.catalog_fp()
        dm = self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.event_id), ("named", "retro", ev.id))
        self.assertEqual([n["kind"] for n in row.named], ["y_has_lines"])
        self.assertEqual(self.catalog_fp(), before)
        self.assertEqual(self.ids_on(X, H), {p.id})
        self.assertTrue(dm.called)                                  # a person decides
        self.sweep()                                                # final: never again
        self.assertEqual([(r.state, r.tries) for r in self.move_rows()], [("named", 1)])
        self.assertEqual(self.db.query(PPCatalogMove).count(), 1)

    def test_sweep_recheck_sees_a_cell_opened_since(self):
        """A cell opened in Y at the code after the pass (no evidence of it by
        H): `stayer_unproven` on the retry, as the pass itself would say."""
        _c, p, _ev = self._busy_then("4101")
        self.cell("4102", Y)
        self.db.commit()
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind), ("named", "retro"))
        self.assertEqual([(n["kind"], n["other"]) for n in row.named], [("stayer_unproven", "4102")])
        self.assertEqual(self.ids_on(X, H), {p.id})

    def test_sweep_recheck_sees_orphans_in_a_second_unit(self):
        """A retroactive transfer of a cell with no landing event (X → Y,
        read off X's orphaned position) waits for its retry. Since the pass,
        the one cell Z kept at the code was archived: Z's position there is an
        orphan too. Asked now, the pass could not tell which unit the cell came
        from (`from_unknown`) — the recheck reads every unit's orphans as the
        pass did, and names it. Nothing written."""
        from app.models import Cell, PPCatalogMove
        h = date(2026, 10, 8)
        self.units(X, Y, Z)
        c = self.cell("4301", Y)                    # moved before link history
        p = self.line(X, "F001", "Tort")
        z = self.cell("4302", Z)
        self.line(Z, "F002", "Keks")
        self.daily(X, h, "F001", plan=4, actual=4)
        self.att(c, X, date(2026, 9, 29), h - timedelta(days=1))
        self.att(c, Y, h, date(2026, 10, 11))
        self.att(z, Z, date(2026, 9, 20), date(2026, 10, 11))
        self.enable()
        self.db.add(PPCatalogMove(kind="retro", state="busy", event_id=None, cell_id=c.id,
                                  code=C, from_unit=X, to_unit=Y, home_from=h, tries=1,
                                  next_try_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        self.db.commit()
        [row] = self.move_rows()
        self.assertIsNone(retro.recheck(self.db, row))              # the control: it would follow
        # Archived on 20 Oct (gone from the 21st) — Z, not X or Y: no window move.
        self.db.get(Cell, z.id).archived_at = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
        self.db.commit()
        self.forget()
        before = self.catalog_fp()
        self.sweep()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind), ("named", "retro"))
        [n] = row.named
        self.assertEqual((n["kind"], n.get("why")), ("from_unknown", "orphans_in_several_units"))
        self.assertEqual(self.catalog_fp(), before)
        self.assertEqual(self.ids_on(X, h), {p.id})

    def test_sweep_recheck_unavailable_once_the_module_is_gone(self):
        """The one-shot module deleted while a retroactive transfer still waits
        for its retry: the guards cannot be run, so it is NAMED
        (`recheck_unavailable`), never followed unchecked."""
        import sys
        import app.services as services
        _c, p, _ev = self._busy_then("4201")
        saved = services.catalog_follow_retro
        try:
            del services.catalog_follow_retro
            with mock.patch.dict(sys.modules, {"app.services.catalog_follow_retro": None}):
                self.sweep()
        finally:
            services.catalog_follow_retro = saved
        [row] = self.move_rows()
        self.assertEqual((row.state, [n["kind"] for n in row.named]),
                         ("named", ["recheck_unavailable"]))
        self.assertEqual(self.ids_on(X, H), {p.id})

    def test_a_follow_that_raises_is_retried(self):
        from app.models import PPCatalogMove
        self.simple_event_world("2801")
        with mock.patch.object(cf, "follow_group", side_effect=RuntimeError("boom")):
            rec = self.run_retro()
        self.assertEqual([(b["vcode"], b["kind"]) for b in rec["busy"]], [("2801", "failed")])
        [row] = self.db.query(PPCatalogMove).all()
        self.assertEqual((row.state, row.kind), ("failed", "retro"))
        self.assertIn("boom", row.error)
        self.assertTrue(cf.enabled(self.db))

    def test_a_pass_that_keeps_failing_stops(self):
        self.simple_event_world("2901")
        before = self.fingerprint()
        with mock.patch.object(retro, "_orphans", side_effect=RuntimeError("bad data")):
            for n in range(1, retro.TRIES + 1):
                self.assertTrue(retro.pending(self.db))
                self.assertEqual(self.run_retro(), {"state": "failed", "attempt": n})
                self.assertEqual(self.flag(), f"failed:{n}")
        self.assertFalse(retro.pending(self.db))
        self.assertEqual(retro.dm_mode(self.db), "failed")
        self.assertFalse(cf.enabled(self.db))
        self.assertEqual(self.fingerprint(), before)
        self.assertIn("bad data", retro.text_of(self.stored()))

    def test_nothing_to_move(self):
        from app import startup
        self.units(X, Y)
        self.cell("2501", X)
        self.line(X, "F001", "Tort")
        self.db.commit()
        with mock.patch("app.startup.SessionLocal", self.pg.Session), \
                mock.patch("app.scheduler.schedule_at") as arm:
            startup.schedule_catalog_follow_retro()           # the pass is due: armed
        self.assertEqual(arm.call_args.args[0], "catalog-follow-retro")
        sent = []
        with mock.patch.object(retro, "_post", lambda m, d, files=None: sent.append((m, d, files))):
            rec = self.run_retro()
            self.assertEqual((rec["moved"], rec["skipped"], rec["busy"]), ([], [], []))
            self.assertEqual(self.flag(), "done:0/0")
            self.assertTrue(cf.enabled(self.db))
            n = retro.sender(self.db, 42)
        self.assertEqual(n, 1)
        [(method, data, files)] = sent
        self.assertEqual((method, files), ("sendMessage", None))
        self.assertIn("topilmadi", data["text"])

    def test_flag_record_dm_flow(self):
        """The startup job: the pass, then the DM from the stored record —
        a DM that fails is sent again at the next boot, the pass never re-run."""
        from app import startup
        from app.models import AppSetting
        self.simple_event_world("2601")
        self.units(Z)
        self.line(Y, "F009", "Rulet", wc="B200")            # an orphan nobody's move explains
        self.att(self.cell("2604", Z, sap="B200"), Z, date(2026, 9, 29), date(2026, 10, 11))
        self.db.commit()
        self.forget()
        sent = []

        def broken(method, data, files=None):
            raise RuntimeError("telegram down")

        session = mock.patch("app.startup.SessionLocal", self.pg.Session)
        with session, mock.patch.object(retro, "_post", broken), \
                mock.patch.object(retro, "_today", lambda: TODAY):
            startup._catalog_follow_retro_job()
        self.db.expire_all()
        self.assertEqual(self.flag(), "done:1/1")
        dm = self.db.query(AppSetting).filter_by(key=retro.dm_flag("done")).first()
        self.assertEqual(dm.value, "failed:1")
        rec = self.stored()
        self.assertEqual(len(rec["moved"]), 1)
        self.assertEqual([e["vcode"] for e in rec["skipped"]], ["2604"])

        def ok(method, data, files=None):
            sent.append((method, data, files))

        with session, mock.patch.object(retro, "_post", ok), \
                mock.patch.object(retro, "run", side_effect=AssertionError("re-run")):
            # The boot arms the job for the owed DM only.
            with mock.patch("app.scheduler.schedule_at") as arm:
                startup.schedule_catalog_follow_retro()
                self.assertTrue(arm.called)
            startup._catalog_follow_retro_job()
        self.db.expire_all()
        self.assertTrue(self.db.query(AppSetting).filter_by(
            key=retro.dm_flag("done")).first().value.startswith("sent:"))
        methods = [m for m, _d, _f in sent]
        self.assertEqual(methods[0], "sendDocument")
        self.assertIn("sendMessage", methods)
        text_ = "".join(d["text"] for m, d, _f in sent if m == "sendMessage")
        self.assertIn("2601", text_)
        self.assertIn("Avtomatik kuzatuv yoqildi", text_)
        from openpyxl import load_workbook
        _name, data, _mime = sent[0][2]["document"]
        wb = load_workbook(io.BytesIO(data))
        self.assertEqual(wb.sheetnames, ["Ko'chirildi", "Qoldirildi", "Dalil", "Ta'sir"])
        self.assertEqual(wb["Ko'chirildi"]["A2"].value, "2601")
        # Nothing left to arm.
        with session, mock.patch("app.scheduler.schedule_at") as arm:
            startup.schedule_catalog_follow_retro()
            self.assertFalse(arm.called)


if __name__ == "__main__":
    unittest.main()
