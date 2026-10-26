"""Two readers that split a work centre by group read each DAY's letters
(2026-10-26, fix set 2 of docs/plan-catalog-follows-cells.md).

A cell's work-centre letter is DATED (`cell_links.letter_on`): a move that
took a letter away keeps it on the landing event (`wc_group_was`), the
catalog follow keeps a lone sibling's on the group's first event
(`siblings_was`), and a retroactive follow of a cell moved before link events
existed writes an inert MARK event (value = prev, `catalog_mark`) that carries
nothing but that history.

* «Yacheyka zagruzkasi» (`routers/zagruzka_cell.cell_zagruzka`) read every
  cell with ONE letter for the whole range — the letter of its last day in the
  unit — so a range across a re-lettering split its early days by a letter the
  cell did not carry then. It now reads the letter of each day; the page's
  `cells[]` (one row per cell for the range) keeps the latest.
* `zagruzka_source.by_wc_on` — the cells-at-a-work-centre map behind
  `cell_pins`, `cell_labor`, the ojidaniya weight, «Plan Bajarish» and /live —
  dated letters only when a cell's UNIT changed in the range, so a mark event
  (no unit change) left the days before it reading today's letters. It now
  dates them whenever a cell's letter history has an entry after the first
  day.

With no letter history after the first day, both readers answer byte for byte
what they answered before (`test_no_move_page_is_unchanged` holds the page to
a copy of its pre-change answer, `zagruzka_cell_golden.NO_MOVE`).

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_dated_letter_readers
"""
from __future__ import annotations

import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from tests.catalog_follow_fixtures import B, C, D, E, SERVER, World, X, Y, at_, days
except ImportError:  # run from inside tests/
    from catalog_follow_fixtures import B, C, D, E, SERVER, World, X, Y, at_, days

GOLDEN = Path(__file__).with_name("zagruzka_cell_golden.py")


def canon(page: dict) -> str:
    """The page as one string, floats exact (`json` writes their repr): every
    part a cell's letter can reach — the grid, the inputs, the cells and what
    they add up to, the diagnostics. `cell_id` is a sequence value and is left
    out; `totals` and `fleet` are /zagruzka's own computation, not this page's."""
    keep = {k: page[k] for k in ("dates", "managers", "data", "inputs", "cells_sum",
                                 "diagnostics", "cells")}
    keep["cells"] = [{k: v for k, v in c.items() if k != "cell_id"} for c in keep["cells"]]
    return json.dumps(keep, sort_keys=True, default=str, indent=1, ensure_ascii=False)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class NoMove(World):
    """A unit nobody moved a cell in or out of during the range — lettered
    groups, an unlettered shared work centre, an ungrouped line and an orphan
    letter, a catalog edit inside the range, a cell archived inside it, and a
    cell whose letter history lies BEFORE the range."""

    SPAN = (D - timedelta(days=2), D + timedelta(days=2))

    def _world(self):
        from app.models import CellLinkEvent
        self.unit(X, Y)
        c1 = self.cell("0101", X, letter="A")
        c2 = self.cell("0102", X, letter="B")
        c3 = self.cell("0103", X, sap=B)
        c4 = self.cell("0104", X, sap=B)
        c5 = self.cell("0105", X, sap=E)
        c6 = self.cell("0106", X, sap=B)
        self.line(X, "F001", "Tort", labor=60, letter="A", sort=0)
        self.line(X, "F002", "Keks", labor=30, letter="B", sort=1)
        non = self.line(X, "F003", "Non", labor=12, sort=2)
        self.line(X, "F004", "Somsa", labor=7, letter="Q", sort=3)
        self.line(X, "F005", "Pirog", wc=B, labor=20, sort=4)
        self.line(X, "F006", "Lavash", wc=B, labor=15, sort=5)
        self.line(X, "F007", "Bulka", wc=E, labor=10, sort=6)
        self.wc_row(X, C, shtatka=4)
        self.wc_row(X, B, shtatka=6)
        self.wc_row(X, E, shtatka=2)
        for i, day in enumerate(days(*self.SPAN)):
            self.daily(X, day, "F001", plan=20 + i, actual=18 + i)
            self.daily(X, day, "F002", plan=11, actual=9)
            self.daily(X, day, "F003", plan=7, actual=7)
            self.daily(X, day, "F004", plan=5, actual=4)
            self.daily(X, day, "F005", wc=B, plan=13, actual=12)
            self.daily(X, day, "F006", wc=B, plan=9, actual=8)
            self.daily(X, day, "F007", wc=E, plan=6, actual=6)
            self.pin(X, day, group="A", people=3)
            self.pin(X, day, group="B", people=2)
            if i % 2:
                self.pin(X, day, group="Q", people=1)
            self.pin(X, day, wc=B, people=5)
            if i != 3:
                self.pin(X, day, wc=E, people=1)
            for cell, n in ((c1, 3), (c2, 2), (c3, 2), (c4, 3), (c5, 1), (c6, 1)):
                self.att(cell, day, X, n=n)
            self.idle(c1, day)
            self.idle(c3, day, "11:00", "11:20")
        # c5 came from Y long before the range, under another letter: its
        # history ends before the first day shown.
        self.db.add(CellLinkEvent(
            cell_id=c5.id, field="manager_id", value=X, prev=Y,
            effective_from=self.SPAN[0] - timedelta(days=20),
            effective_at=at_(self.SPAN[0] - timedelta(days=20), 8),
            applied_at=at_(self.SPAN[0] - timedelta(days=20), 8).astimezone(timezone.utc),
            src="manual", vfx={"wc_group_was": "Z"}))
        self.settle()
        # «Non» takes c1's letter from D; c6 is archived on D+1.
        self.edit_line(non, at=at_(D, 10), wc_group="A")
        self.archive_cell(c6, at=at_(D + timedelta(days=1), 15))
        return c1, c2, c3, c4, c5, c6

    def test_no_move_page_is_unchanged(self):
        """«Yacheyka zagruzkasi» over a range nobody moved a cell in answers
        exactly what it answered before letters were read per day."""
        self._world()
        got = canon(self.zagruzka_cell(X, *self.SPAN))
        if os.environ.get("SAFIA_REGOLD"):
            GOLDEN.write_text(
                '"""«Yacheyka zagruzkasi» over `test_dated_letter_readers.NoMove`\'s\n'
                "world, as the page answered BEFORE it read each day's letters\n"
                "(captured from the pre-change `routers/zagruzka_cell.py` with\n"
                "SAFIA_REGOLD=1). A deliberate change to the page re-captures it.\n"
                '"""\n\nNO_MOVE = r"""' + got + '"""\n', encoding="utf-8")
            self.skipTest("golden written")
        try:
            from tests.zagruzka_cell_golden import NO_MOVE
        except ImportError:  # run from inside tests/
            from zagruzka_cell_golden import NO_MOVE
        self.maxDiff = None
        self.assertEqual(got, NO_MOVE)

    def test_no_letter_history_is_one_map(self):
        """`by_wc_on` with no letter or unit change after the first day answers
        every day with ONE map — the one built off the current columns."""
        from app.models import Cell
        from app.services import wc_group, zagruzka_source as zs
        self._world()
        cells = self.db.query(Cell).order_by(Cell.id).all()
        at = zs.by_wc_on(cells, days(*self.SPAN))
        base = wc_group.cells_by_wc(cells)
        for d in days(*self.SPAN):
            self.assertIs(at(d.isoformat()), at(self.SPAN[0].isoformat()))
            self.assertEqual({k: [c.id for c in v] for k, v in at(d.isoformat()).items()},
                             {k: [c.id for c in v] for k, v in base.items()})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Mark(World):
    """A cell moved into Y before link events existed: its column says Y on
    every day, and the retroactive follow re-lettered it from D (C → B) with an
    inert MARK event — no unit change, only the letter's history. Y planned
    and typed the cell's work under its letter of each day — «Somsa» and the
    people pin under C before D, under B from D (the catalog row edited on D);
    y1 holds A throughout."""

    SPAN = (D - timedelta(days=2), D + timedelta(days=1))

    def _world(self):
        from app.services import catalog_follow as cf
        self.unit(X, Y)
        c = self.cell("0501", Y, letter="B")
        y1 = self.cell("0502", Y, letter="A")
        self.line(Y, "F005", "Pirog", labor=20, letter="A", sort=0)
        somsa = self.line(Y, "F006", "Somsa", labor=30, letter="C", sort=1)
        self.wc_row(Y, C, shtatka=5)
        for day in days(*self.SPAN):
            self.daily(Y, day, "F005", plan=12, actual=12)
            self.daily(Y, day, "F006", plan=10, actual=10)
            self.pin(Y, day, group="A", people=4)
            self.pin(Y, day, group="C" if day < D else "B", people=3)
            self.att(c, day, Y, n=3)
            self.att(y1, day, Y, n=4)
        self.settle()
        self.edit_line(somsa, at=at_(D, 10), wc_group="B")
        cf._mark_event(self.db, c, D, datetime.now(timezone.utc), {"wc_group_was": "C"})
        self.settle()
        return c, y1

    def test_by_wc_on_dates_a_mark(self):
        """`by_wc_on`: the days before the mark read the letter it records,
        the days from it the column — and `cell_pins` hands each cell its own
        group's pin on both sides (undated, c read «B» before D and its «C» pin
        fell to nobody: c 1.5, y1 5.5)."""
        from app.services import cell_links, zagruzka_source as zs
        c, y1 = self._world()
        self.assertEqual(cell_links.changed_since("manager_id", self.SPAN[0]), set())
        at = zs.by_wc_on([c, y1], days(*self.SPAN))
        for d in days(*self.SPAN):
            got = {x.id: x.wc_group for x in at(d.isoformat())[(Y, C)]}
            self.assertEqual(got, {c.id: "C" if d < D else "B", y1.id: "A"}, d)
        pins = zs.cell_pins([c, y1], zs.typed_pins(self.db, [Y], *self.SPAN))
        for d in days(*self.SPAN):
            iso = d.isoformat()
            self.assertEqual((pins[(c.id, iso)][0], pins[(y1.id, iso)][0]), (3.0, 4.0), iso)
        # The ojidaniya weight is the same split, and so are the minutes
        # (`cell_labor` — /live's and «Plan Bajarish»'s door): c's own «Somsa»,
        # 10 × 30 s, under C before D and B from D.
        n = zs.cell_people([c, y1], zs.typed_pins(self.db, [Y], *self.SPAN))
        self.assertEqual(n[(c.id, (D - timedelta(days=1)).isoformat())], 3.0)
        labor = zs.cell_labor([c, y1], zs.wc_group_labor(self.db, [Y], *self.SPAN))
        for d in days(*self.SPAN):
            self.assertEqual(labor[(c.id, d.isoformat())], (5.0, 5.0), d)

    def test_by_wc_on_history_before_the_range(self):
        """A mark whose day lies before the range dates nothing: one map."""
        from app.services import zagruzka_source as zs
        c, y1 = self._world()
        at = zs.by_wc_on([c, y1], days(D, self.SPAN[1]))
        self.assertIs(at(D.isoformat()), at(self.SPAN[1].isoformat()))
        self.assertEqual({x.id: x.wc_group for x in at(D.isoformat())[(Y, C)]},
                         {c.id: "B", y1.id: "A"})

    def test_page_dates_a_mark(self):
        """«Yacheyka zagruzkasi» over the same days: c reads its own group —
        «Somsa» (5 minutes) and 3 people — as C before D and as B from D
        (undated, c read «B» on D−2…D−1 and the C line and pin fell to nobody:
        2.5 minutes, 1.5 people); `cells[]` prints the latest letter, and
        nothing is an orphan."""
        c, _y1 = self._world()
        page = self.zagruzka_cell(Y, *self.SPAN)
        for d in days(*self.SPAN):
            key = d.strftime("%d.%m.%Y")
            inp = page["inputs"]["0501"][key]
            self.assertEqual((inp["wc_group"], inp["trud_plan"], inp["o_soni"], inp["wc_split"]),
                             ("C" if d < D else "B", 5.0, 3.0, "group"), key)
            self.assertEqual(page["inputs"]["0502"][key]["o_soni"], 4.0, key)
        self.assertEqual({x["verifix_code"]: x["wc_group"] for x in page["cells"]},
                         {"0501": "B", "0502": "A"})
        self.assertEqual(page["diagnostics"]["orphan_groups"], [])
        # Each side alone answers the same days the same way.
        left = self.zagruzka_cell(Y, self.SPAN[0], D - timedelta(days=1))["inputs"]
        right = self.zagruzka_cell(Y, D, self.SPAN[1])["inputs"]
        for code in ("0501", "0502"):
            self.assertEqual(page["inputs"][code], {**left[code], **right[code]}, code)

    def test_plan_and_live_date_a_mark(self):
        """«Plan Bajarish» and /live — the two readers of `cell_labor` that
        are not a page of their own here — hand c its own «Somsa» (5 minutes)
        on EVERY day, under C before D and B from D, and y1 its own «Pirog»
        (4 minutes). Undated, c read «B» on D−2…D−1 and the C line fell to
        nobody: 2.5 minutes each side (Plan Bajarish's strip rounds it to 2)."""
        c, y1 = self._world()
        plan = self.plan([Y], *self.SPAN)
        rows = {r["cell_id"]: r["daily"] for r in plan["cell_rows"]}
        n = len(days(*self.SPAN))
        self.assertEqual(rows[c.id], [[5, 5]] * n)
        self.assertEqual(rows[y1.id], [[4, 4]] * n)
        for d in days(*self.SPAN):
            cells = self.live([Y], d)["cells"]
            self.assertEqual((cells[c.id], cells[y1.id]), ((5.0, 5.0), (4.0, 4.0)), d)

    def test_every_reader_read_across_a_mark(self):
        """Every reader read over a range ACROSS the mark answers each day as
        a read of its own side alone — the e2e scenarios' own check
        (`_E2E.assert_span_consistent`: the catalog, `zagruzka_source`, the
        dashboard, «Yacheyka zagruzkasi», /live, the fleet, the ojidaniya and
        «Plan Bajarish»), here where no unit changed at all."""
        try:
            from tests import test_catalog_follow_e2e as e2e
        except ImportError:  # run from inside tests/
            import test_catalog_follow_e2e as e2e
        self._world()
        e2e._E2E.assert_span_consistent(self, [X, Y], self.SPAN[0], D, self.SPAN[1])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class LineReLettered(World):
    """No CELL changes its letter — a catalog LINE does: «Tort», a's (A) on
    D−2…D−1, is b's (B) from D (a catalog edit counts from its day). A cell's
    `wc_split` («group» = a line or a pin names its letter) is judged by the
    letters the catalog of THAT day hands the work centre, so a read across
    the edit labels each day as a read of that day alone does. (Judged by every
    line letter of the RANGE, a's days from D read «group» across the edit and
    «even» alone — nothing names A any more that day.) The figures were never
    in question: `labor_split` reads each day's own group minutes."""

    SPAN = (D - timedelta(days=2), D + timedelta(days=1))

    def _world(self):
        self.unit(X)
        a = self.cell("0601", X, letter="A")
        b = self.cell("0602", X, letter="B")
        tort = self.line(X, "F001", "Tort", labor=60, letter="A", sort=0)
        self.line(X, "F002", "Keks", labor=30, letter="B", sort=1)
        self.line(X, "F003", "Non", labor=12, sort=2)  # nobody's: shared evenly
        self.wc_row(X, C, shtatka=5)
        for day in days(*self.SPAN):
            self.daily(X, day, "F001", plan=6, actual=6)
            self.daily(X, day, "F002", plan=4, actual=4)
            self.daily(X, day, "F003", plan=10, actual=10)
            self.pin(X, day, people=5)               # one whole-centre number
            self.att(a, day, X, n=2)
            self.att(b, day, X, n=3)
        self.settle()
        self.edit_line(tort, at=at_(D, 10), wc_group="B")
        return a, b

    def test_wc_split_by_the_day_catalog(self):
        self._world()
        whole = self.zagruzka_cell(X, *self.SPAN)["inputs"]
        left = self.zagruzka_cell(X, self.SPAN[0], D - timedelta(days=1))["inputs"]
        right = self.zagruzka_cell(X, D, self.SPAN[1])["inputs"]
        self.assertEqual([whole["0601"][d.strftime("%d.%m.%Y")]["wc_split"]
                          for d in days(*self.SPAN)], ["group", "group", "even", "even"])
        self.assertEqual([whole["0601"][d.strftime("%d.%m.%Y")]["trud_plan"]
                          for d in days(*self.SPAN)], [7.0, 7.0, 1.0, 1.0])
        for code in ("0601", "0602"):
            self.assertEqual(whole[code], {**left[code], **right[code]}, code)


if __name__ == "__main__":
    unittest.main()
