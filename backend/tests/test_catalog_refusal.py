"""A cell's brigadir change is REFUSED while its work centre holds positions it
shares with the cells staying (2026-10-26, WP3 of
docs/plan-catalog-follows-cells.md, case T4): the rule
(`catalog_refusal.shared_positions`), the one writer every door goes through
(`cell_register.set_unit`) and the three doors — the /cells form
(`profiles.admin_update_cell`, with «Birga ko'chirish» = `move_with`), «Doimiy
qilish» on the admin «Davomat» tab (`attendance_batch.update_cells`) and a
«Verifix sinxron» tap (`verifix_sync.apply_item`, with `choice="together"`).

Against a scratch Postgres database (`SAFIA_TEST_PG`, see `pg_scratch`): the
cells standing at a work centre are read through the dated cell links, whose
cache reads `app.database.SessionLocal`, pointed here at the scratch database.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_catalog_refusal
"""
from __future__ import annotations

import unittest
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException

CODE = "A2894"
D = date(2026, 10, 27)
OLD_DAY = date(2026, 10, 1)        # before the live-day floor: «Davomat» still writes it
ADMIN = {"role": "admin", "sub": "1", "telegram_id": 1, "full_name": "Admin"}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class _PG(unittest.TestCase):
    X, Y, Z = 31, 32, 33

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        cls._patch = mock.patch("app.database.SessionLocal", cls.pg.Session)
        cls._patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._patch.stop()
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()
        cls.pg.drop()

    def setUp(self):
        from app import models as m
        self.db = self.pg.Session()
        for t in (m.VerifixSyncItem, m.AttendanceBatchCell, m.AttendanceBatch,
                  m.PPCatalogVersion, m.PPProduct, m.PPWorkCenter, m.CellArchiveSpan,
                  m.CellLinkEvent, m.Cell, m.Manager):
            self.db.query(t).delete()
        for i in (self.X, self.Y, self.Z):
            self.db.add(m.Manager(id=i, name=f"Unit {i}", shift=1))
        self.db.commit()
        self._forget()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _forget(self):
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()

    def _cell(self, code, unit=None, sap=CODE, letter=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit or self.X, wc_group=letter)
        self.db.add(c)
        self.db.flush()
        return c

    def _line(self, name, group=None, unit=None, wc=CODE, active=True, sort=0):
        from app.models import PPProduct
        p = PPProduct(manager_id=unit or self.X, sap_code=f"F{name}", name=name, work_center=wc,
                      labor_time=Decimal("10"), sort_order=sort, active=active, wc_group=group)
        self.db.add(p)
        self.db.flush()
        return p

    def _team(self, *, c_letter="A", shared=True):
        """X: c (0301) and d (0302) at A2894 — each with a line of its own
        letter, and (`shared`) one unlettered line both make."""
        c = self._cell("0301", letter=c_letter)
        d = self._cell("0302", letter="B")
        self._line("Tort", group="A", sort=1)
        self._line("Keks", group="B", sort=2)
        free = self._line("Pirog", sort=3) if shared else None
        self.db.commit()
        self._forget()
        return c, d, free

    def _events(self, cell_id=None):
        from app.models import CellLinkEvent as E
        q = self.db.query(E).filter(E.field == "manager_id")
        if cell_id is not None:
            q = q.filter(E.cell_id == cell_id)
        return q.all()

    def _refusal(self, cell, to, leaving=None):
        from app.services import catalog_refusal
        return catalog_refusal.shared_positions(self.db, cell, to, day=D, leaving=leaving)


class Rule(_PG):
    def test_shared(self):
        c, d, free = self._team()
        bad = self._refusal(c, self.Y)
        self.assertIsNotNone(bad)
        self.assertEqual((bad.code, bad.status), ("shared_positions", 409))
        p = bad.params
        self.assertEqual(p["kind"], "shared")
        self.assertEqual((p["code"], p["cell"], p["cell_letter"], p["unit"]), (CODE, "0301", "A", self.X))
        self.assertEqual(p["unit_name"], f"Unit {self.X}")
        self.assertEqual(p["count"], 1)
        self.assertEqual([ln["id"] for ln in p["lines"]], [free.id])
        self.assertEqual(p["staying"], [{"id": d.id, "code": "0302", "letter": "B"}])
        self.assertEqual(p["dests"], [self.Y])
        self.assertIn("0301", bad.message)
        self.assertTrue(bad.message.endswith("."))
        self.assertEqual(set(bad.detail()), {"code", "message", "params"})

    def test_orphan_letter_is_shared_too(self):
        c, d, free = self._team()
        free.wc_group = "Z"                 # a letter no cell carries
        self.db.commit()
        self.assertEqual(self._refusal(c, self.Y).params["kind"], "shared")

    def test_unlettered_cell(self):
        c, d, free = self._team(c_letter=None)
        bad = self._refusal(c, self.Y)
        self.assertEqual((bad.code, bad.params["kind"]), ("shared_positions", "unlettered_cell"))
        # It owns nothing unlettered: the shared lines are the unclaimed ones
        # (the line lettered A is an orphan once c carries no letter).
        self.assertEqual(bad.params["count"], 2)

    def test_lettered_passes(self):
        c, d, free = self._team()
        free.wc_group = "A"
        self.db.commit()
        self.assertIsNone(self._refusal(c, self.Y))

    def test_archived_lines_never_block(self):
        c, d, free = self._team()
        free.active = False
        self.db.commit()
        self.assertIsNone(self._refusal(c, self.Y))

    def test_withdrawal_and_nothing_to_judge(self):
        c, d, free = self._team()
        self.assertIsNone(self._refusal(c, self.X))           # the unit in force
        e = self._cell("0303", sap="")                         # no work centre
        f = self._cell("0304", unit=self.Y)
        f.manager_id = None                                    # no unit yet
        self.db.flush()
        self.assertIsNone(self._refusal(e, self.Y))
        self.assertIsNone(self._refusal(f, self.Y))
        g = self._cell("0305", sap="B9999")                    # a work centre with no lines
        self.assertIsNone(self._refusal(g, self.Y))

    def test_whole_team_to_one_unit_passes(self):
        c, d, free = self._team()
        self.assertIsNone(self._refusal(c, self.Y, leaving={d.id: self.Y}))
        self.assertIsNone(self._refusal(d, self.Y, leaving={c.id: self.Y}))

    def test_team_split_over_two_units(self):
        c, d, free = self._team()
        bad = self._refusal(c, self.Y, leaving={d.id: self.Z})
        self.assertEqual((bad.code, bad.params["kind"]), ("shared_positions", "split"))
        self.assertEqual(bad.params["staying"], [])
        self.assertEqual(bad.params["dests"], [self.Y, self.Z])

    def test_member_going_nowhere_stays(self):
        """A member of the request whose destination is the unit in force is
        not leaving — it still stands there."""
        c, d, free = self._team()
        bad = self._refusal(c, self.Y, leaving={d.id: self.X})
        self.assertEqual(bad.params["kind"], "shared")

    def test_positions_need_unit(self):
        c, d, free = self._team()
        bad = self._refusal(c, None)
        self.assertEqual((bad.code, bad.params["kind"]), ("positions_need_unit", "need_unit"))
        self.assertEqual([ln["name"] for ln in bad.params["lines"]], ["Tort"])
        self.assertEqual(bad.params["dests"], [None])

    def test_lone_cell_cleared(self):
        c = self._cell("0401", letter=None)
        self._line("Non")
        self.db.commit()
        self._forget()
        self.assertEqual(self._refusal(c, None).code, "positions_need_unit")
        self.assertIsNone(self._refusal(c, self.Y))            # alone: everything is its own

    def test_a_cell_typing_its_letter_in_the_same_save(self):
        """The letter judged is the one on the row as this save leaves it."""
        c, d, free = self._team(c_letter=None)
        free.wc_group = "A"
        c.wc_group = "A"                                       # not committed yet
        self.assertIsNone(self._refusal(c, self.Y))


class SetUnit(_PG):
    def test_refused_and_recorded(self):
        from app.services import cell_register
        c, d, free = self._team()
        with self.assertRaises(cell_register.Refused) as cm:
            cell_register.set_unit(self.db, c, self.Y, src="manual", by="t")
        self.assertEqual(cm.exception.code, "shared_positions")
        self.assertEqual(self._events(), [])
        free.wc_group = "A"
        ev = cell_register.set_unit(self.db, c, self.Y, src="manual", by="t")
        self.assertIsNotNone(ev)
        self.assertEqual((ev.value, ev.prev), (self.Y, self.X))
        self.assertEqual(ev.vfx["sap_code_at_request"], CODE)

    def test_withdrawal_never_refused(self):
        from app.services import cell_register
        c, d, free = self._team()
        free.wc_group = "A"
        cell_register.set_unit(self.db, c, self.Y, src="manual", by="t")
        self.db.commit()
        self._forget()
        free.wc_group = None                                   # shared again
        self.db.commit()
        self.assertIsNone(cell_register.set_unit(self.db, c, self.X, src="manual", by="t"))
        self.db.commit()
        self.assertEqual([e for e in self._events(c.id) if e.applied_at is None], [])

    def test_team_leaving_together(self):
        from app.services import cell_register
        c, d, free = self._team()
        leaving = {c.id: self.Y, d.id: self.Y}
        cell_register.set_unit(self.db, d, self.Y, src="manual", by="t", leaving=leaving)
        cell_register.set_unit(self.db, c, self.Y, src="manual", by="t", leaving=leaving)
        self.assertEqual(sorted(e.cell_id for e in self._events()), sorted([c.id, d.id]))
        with self.assertRaises(cell_register.Refused) as cm:
            cell_register.set_unit(self.db, c, self.Z, src="manual", by="t",
                                   leaving={d.id: self.Y})
        self.assertEqual(cm.exception.params["kind"], "split")

    def test_clearing_a_cell_with_positions(self):
        from app.services import cell_register
        c, d, free = self._team()
        with self.assertRaises(cell_register.Refused) as cm:
            cell_register.set_unit(self.db, c, None, src="manual", by="t")
        self.assertEqual(cm.exception.code, "positions_need_unit")


class CellsForm(_PG):
    """The /cells PUT: a structured 409, never a 500."""

    def _put(self, cell, **kw):
        from app.routers import profiles
        return profiles.admin_update_cell(cell.id, profiles.CellPayload(**kw), db=self.db,
                                          caller=ADMIN)

    def test_structured_409(self):
        c, d, free = self._team()
        with self.assertRaises(HTTPException) as cm:
            self._put(c, manager_id=self.Y)
        self.assertEqual(cm.exception.status_code, 409)
        det = cm.exception.detail
        self.assertEqual(det["code"], "shared_positions")
        self.assertEqual(det["params"]["staying"][0]["id"], d.id)
        self.db.rollback()
        self.assertEqual(self._events(), [])

    def test_letter_in_the_same_save(self):
        """The form applies the letter BEFORE the brigadir: lettering the
        cell and moving it is one save."""
        c, d, free = self._team(c_letter=None)
        free.wc_group = "A"
        self.db.commit()
        out = self._put(c, manager_id=self.Y, wc_group="A")
        self.assertEqual(out["wc_group"], "A")
        self.assertEqual(out["pending"]["manager_id"]["value"], self.Y)

    def test_move_with(self):
        c, d, free = self._team()
        out = self._put(c, manager_id=self.Y, move_with=[d.id])
        self.assertEqual(out["pending"]["manager_id"]["value"], self.Y)
        self.assertEqual(sorted(e.cell_id for e in self._events() if e.applied_at is None),
                         sorted([c.id, d.id]))
        self.assertTrue(all(e.value == self.Y for e in self._events()))

    def test_move_with_reaches_the_grant_alert(self):
        """A grant holder's team move names EVERY cell it moved to the admins'
        alert and the Jurnal, not only the edited row."""
        from app.routers import profiles
        c, d, free = self._team()
        with mock.patch.object(profiles, "alert_grant_use") as alert, \
                mock.patch.object(profiles.action_log, "enrich") as enrich:
            self._put(c, manager_id=self.Y, move_with=[d.id])
        changes = alert.call_args.kwargs["changes"]
        units = [ch for ch in changes if ch[0] == "unit"]
        self.assertEqual(len(units), 2)
        self.assertTrue(any(str(ch[2]).startswith(f"{d.verifix_code}: ") for ch in units))
        logged = [kw.get("changes") for _a, kw in enrich.call_args_list if kw.get("changes")]
        self.assertEqual(logged[-1], changes)

    def test_move_with_must_be_the_team(self):
        c, d, free = self._team()
        other = self._cell("0310", sap="B1111", letter="A")
        self.db.commit()
        for kw in ({"manager_id": self.Y, "move_with": [other.id]},      # another work centre
                   {"move_with": [d.id]}):                               # no brigadir change
            with self.assertRaises(HTTPException) as cm:
                self._put(c, **kw)
            self.assertEqual(cm.exception.status_code, 400)
            self.assertEqual(cm.exception.detail["code"], "move_with_invalid")
            self.db.rollback()
        self.assertEqual(self._events(), [])

    def test_pending_move_judged_again_on_a_letter_change(self):
        c, d, free = self._team(shared=False)
        self._put(c, manager_id=self.Y)                       # allowed, now waiting
        self.db.commit()
        self._forget()
        with self.assertRaises(HTTPException) as cm:
            self._put(c, wc_group="C")                         # A lines would be orphaned
        self.assertEqual(cm.exception.status_code, 409)
        self.assertEqual(cm.exception.detail["params"]["kind"], "shared")
        self.db.rollback()
        out = self._put(c, wc_group="A", sap_code=CODE)        # nothing moved: no re-check
        self.assertEqual(out["pending"]["manager_id"]["value"], self.Y)


class DoimiyQilish(_PG):
    """«Doimiy qilish» on the admin «Davomat» tab: a refused move refuses the
    whole PUT, nothing written."""

    def _batch(self, *cells):
        from app.models import AttendanceBatch, AttendanceBatchCell
        b = AttendanceBatch(date=OLD_DAY, status="draft")
        self.db.add(b)
        self.db.flush()
        for c in cells:
            self.db.add(AttendanceBatchCell(batch_id=b.id, verifix_code=c.verifix_code,
                                            cell_id=c.id, manager_id=c.manager_id, included=True,
                                            pending=False))
        self.db.commit()
        return b

    def _put(self, changes):
        from app.routers import attendance_batch as ab
        body = ab.MappingBody(date=OLD_DAY.isoformat(), permanent=True,
                              changes=[ab.CellChange(**ch) for ch in changes])
        with mock.patch.object(ab, "_batch_payload", return_value={"ok": True}):
            return ab.update_cells(body, db=self.db, admin=ADMIN)

    def test_refused_whole(self):
        from app.models import AttendanceBatchCell, Cell
        c, d, free = self._team()
        other = self._cell("0320", sap="B2222")               # moves fine on its own
        self.db.commit()
        self._batch(c, d, other)
        with self.assertRaises(HTTPException) as cm:
            self._put([{"verifix_code": "0320", "manager_id": self.Z},
                       {"verifix_code": "0301", "manager_id": self.Y}])
        self.assertEqual(cm.exception.status_code, 409)
        self.assertEqual(cm.exception.detail["code"], "shared_positions")
        self.db.expire_all()
        self.assertEqual(self._events(), [])
        routed = {bc.verifix_code: bc.manager_id for bc in self.db.query(AttendanceBatchCell)}
        self.assertEqual(routed, {"0301": self.X, "0302": self.X, "0320": self.X})
        self.assertTrue(all(not bc.pending for bc in self.db.query(AttendanceBatchCell)))
        self.assertEqual(self.db.get(Cell, other.id).manager_id, self.X)

    def test_whole_team_passes_split_refused(self):
        c, d, free = self._team()
        self._batch(c, d)
        with self.assertRaises(HTTPException) as cm:
            self._put([{"verifix_code": "0301", "manager_id": self.Y},
                       {"verifix_code": "0302", "manager_id": self.Z}])
        self.assertEqual(cm.exception.detail["params"]["kind"], "split")
        self.db.rollback()
        self.assertEqual(self._put([{"verifix_code": "0301", "manager_id": self.Y},
                                    {"verifix_code": "0302", "manager_id": self.Y}]), {"ok": True})
        self.assertEqual(sorted((e.cell_id, e.value) for e in self._events()),
                         sorted([(c.id, self.Y), (d.id, self.Y)]))


class VerifixTap(_PG):
    def _item(self, cell, to):
        from app.models import VerifixSyncItem
        it = VerifixSyncItem(kind="brigadir_differs", key=f"cell:{cell.id}", status="open",
                             payload={"cell": cell.id, "code": cell.verifix_code,
                                      "from_unit": cell.manager_id, "to_unit": to,
                                      "brigadir": "Brigadir"})
        self.db.add(it)
        self.db.flush()
        return it

    def test_together(self):
        from app.services import cell_register, verifix_sync
        c, d, free = self._team()
        ic, idd = self._item(c, self.Y), self._item(d, self.Y)
        self._item(self._cell("0330", sap="C3333"), self.Y)    # another work centre
        self.db.commit()
        with self.assertRaises(cell_register.Refused) as cm:
            verifix_sync.apply_item(self.db, ic.id, by="t")
        self.assertEqual(cm.exception.code, "shared_positions")
        self.assertEqual(cm.exception.params["together_items"], [idd.id])
        self.db.rollback()
        out = verifix_sync.apply_item(self.db, ic.id, by="t", choice="together")
        self.assertEqual(out["together"], [idd.id])
        self.assertIsNotNone(out["from"])
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(sorted(e.cell_id for e in self._events()), sorted([c.id, d.id]))
        from app.models import VerifixSyncItem
        self.assertEqual(self.db.get(VerifixSyncItem, idd.id).status, "applied")
        self.assertEqual(self.db.get(VerifixSyncItem, ic.id).note, "together")

    def test_no_together_offer_when_a_cell_stays(self):
        from app.services import cell_register, verifix_sync
        c, d, free = self._team()
        e = self._cell("0303", letter="C")                     # stays, no suggestion
        ic, idd = self._item(c, self.Y), self._item(d, self.Y)
        self.db.commit()
        with self.assertRaises(cell_register.Refused) as cm:
            verifix_sync.apply_item(self.db, ic.id, by="t")
        self.assertNotIn("together_items", cm.exception.params)
        self.db.rollback()
        with self.assertRaises(cell_register.Refused):
            verifix_sync.apply_item(self.db, ic.id, by="t", choice="together")
        self.db.rollback()
        self.assertEqual(self._events(), [])
        self.assertIsNotNone(e.id)


class Review(_PG):
    """Holes found in review: a change ALREADY recorded is part of the same
    landing (the follow groups a day's moves at one work centre), a cleared
    brigadir is judged by the letter the cell carries in the unit it leaves,
    and a team leaving to no unit owns what it shares."""

    def _put(self, cell, **kw):
        from app.routers import profiles
        return profiles.admin_update_cell(cell.id, profiles.CellPayload(**kw), db=self.db,
                                          caller=ADMIN)

    def _commit(self):
        self.db.commit()
        self._forget()

    def test_split_across_two_saves(self):
        """Moved together, then one of them sent elsewhere by a second save:
        the shared position could follow neither."""
        c, d, free = self._team()
        self._put(c, manager_id=self.Y, move_with=[d.id])
        self._commit()
        with self.assertRaises(HTTPException) as cm:
            self._put(c, manager_id=self.Z)
        self.assertEqual(cm.exception.detail["params"]["kind"], "split")
        self.assertEqual(cm.exception.detail["params"]["dests"], [self.Y, self.Z])
        self.assertEqual(cm.exception.detail["params"]["staying"], [])
        self.db.rollback()
        # Back to the team's unit, or home (a withdrawal): both pass.
        self.assertEqual(self._put(c, manager_id=self.Y)["pending"]["manager_id"]["value"], self.Y)
        self.db.rollback()
        self.assertNotIn("manager_id", self._put(c, manager_id=self.X)["pending"])

    def test_recorded_mate_to_the_same_unit_passes(self):
        """d left first while the line was lettered; un-lettered later, c
        follows d to the same unit — the whole work centre leaves together."""
        from app.services import catalog_refusal, cell_links, cell_register
        c, d, free = self._team()
        free.wc_group = "B"
        ev = cell_register.set_unit(self.db, d, self.Y, src="manual", by="t")
        self._commit()
        free.wc_group = None
        self._commit()
        day = ev.effective_from                     # the landing both moves share
        self.assertEqual(day, cell_links.opening_for_move(self.db, self.X, self.Y)[0])

        def judge(to, leaving=None):
            return catalog_refusal.shared_positions(self.db, c, to, day=day, leaving=leaving)
        self.assertIsNone(judge(self.Y))
        self.assertEqual(judge(self.Z).params["kind"], "split")
        # This request taking d back home makes d a cell staying.
        self.assertEqual(judge(self.Y, leaving={d.id: self.X}).params["kind"], "shared")
        # A day on which d has not left yet: d still stands there.
        self.assertEqual(catalog_refusal.shared_positions(
            self.db, c, self.Y, day=day - timedelta(days=1)).params["kind"], "shared")

    def test_form_clear_reads_the_letter_in_the_unit(self):
        """The form sends no letter with a cleared brigadir: c's own lettered
        positions are still its own — `positions_need_unit`, not «shared»."""
        c, d, free = self._team(shared=False)
        with self.assertRaises(HTTPException) as cm:
            self._put(c, manager_id=0, wc_group="")
        det = cm.exception.detail
        self.assertEqual((det["code"], det["params"]["kind"]), ("positions_need_unit", "need_unit"))
        self.assertEqual([ln["name"] for ln in det["params"]["lines"]], ["Tort"])
        self.assertEqual(det["params"]["cell_letter"], "A")
        self.db.rollback()
        # A cell owning nothing is cleared, and loses its letter with it.
        e = self._cell("0401", sap="B4444", letter="C")
        self._line("Non", wc="B4444", active=False)          # archived: owns nothing live
        self._commit()
        out = self._put(e, manager_id=0, wc_group="")
        self.assertIsNone(out["wc_group"])
        self.assertIsNone(out["pending"]["manager_id"]["value"])

    def test_team_cleared_together_needs_unit(self):
        c = self._cell("0301")
        d = self._cell("0302")
        self._line("Pirog")
        self._commit()
        bad = self._refusal(c, None, leaving={d.id: None})
        self.assertEqual((bad.code, bad.params["count"]), ("positions_need_unit", 1))
        # With a cell staying it keeps the position: the refusal is «shared».
        self.assertEqual(self._refusal(c, None).params["kind"], "shared")

    def test_team_cleared_on_doimiy_qilish(self):
        from app.models import AttendanceBatch, AttendanceBatchCell
        from app.routers import attendance_batch as ab
        c = self._cell("0301")
        d = self._cell("0302")
        self._line("Pirog")
        b = AttendanceBatch(date=OLD_DAY, status="draft")
        self.db.add(b)
        self.db.flush()
        for x in (c, d):
            self.db.add(AttendanceBatchCell(batch_id=b.id, verifix_code=x.verifix_code,
                                            cell_id=x.id, manager_id=x.manager_id, included=True,
                                            pending=False))
        self._commit()
        body = ab.MappingBody(date=OLD_DAY.isoformat(), permanent=True, changes=[
            ab.CellChange(verifix_code="0301", clear_manager=True),
            ab.CellChange(verifix_code="0302", clear_manager=True)])
        with self.assertRaises(HTTPException) as cm, \
                mock.patch.object(ab, "_batch_payload", return_value={"ok": True}):
            ab.update_cells(body, db=self.db, admin=ADMIN)
        self.assertEqual(cm.exception.detail["code"], "positions_need_unit")
        self.assertEqual(self._events(), [])

    def test_waiting_move_judged_again_with_the_team(self):
        """A waiting move refused again over a letter change («Birga
        ko'chirish» re-sends the waiting brigadir with the team): the team
        leaves with it, so the check passes."""
        c, d, free = self._team(shared=False)
        self._line("Pirog", group="A", sort=4)
        self._commit()
        self._put(c, manager_id=self.Y)
        self._commit()
        with self.assertRaises(HTTPException) as cm:
            self._put(c, wc_group="C")                          # A lines orphaned
        self.assertEqual([s["id"] for s in cm.exception.detail["params"]["staying"]], [d.id])
        self.db.rollback()
        out = self._put(c, manager_id=self.Y, wc_group="C", move_with=[d.id])
        self.assertEqual((out["wc_group"], out["pending"]["manager_id"]["value"]), ("C", self.Y))
        self.assertEqual(sorted((e.cell_id, e.value) for e in self._events()
                                if e.applied_at is None),
                         sorted([(c.id, self.Y), (d.id, self.Y)]))

    def test_concurrent_taps_never_wait(self):
        """Two «Verifix sinxron» taps at once: neither waits on the other's
        item (each holding its own and waiting for the other's deadlocks). A
        teammate's item another tap holds is left out of «together»."""
        from sqlalchemy import text
        from app.models import VerifixSyncItem
        from app.services import cell_register, verifix_sync
        c, d, free = self._team()
        free.wc_group = "A"
        mk = VerifixTap._item
        ic, idd = mk(self, c, self.Y), mk(self, d, self.Y)
        self._commit()
        other = self.pg.Session()
        try:
            other.query(VerifixSyncItem).filter_by(id=idd.id).with_for_update().one()
            self.db.execute(text("SET LOCAL lock_timeout = '2s'"))
            self.assertIsNotNone(verifix_sync.apply_item(self.db, ic.id, by="t")["from"])
            self.db.rollback()
            free = self.db.merge(free)
            free.wc_group = None
            self._commit()
            self.db.execute(text("SET LOCAL lock_timeout = '2s'"))
            with self.assertRaises(cell_register.Refused) as cm:
                verifix_sync.apply_item(self.db, ic.id, by="t", choice="together")
            self.assertEqual([s["id"] for s in cm.exception.params["staying"]], [d.id])
            self.db.rollback()
        finally:
            other.rollback()
            other.close()


if __name__ == "__main__":
    unittest.main()
