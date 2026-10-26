"""WP4 of «the catalog follows its cells» (docs/plan-catalog-follows-cells.md):
the doors that rebuild a catalog's day from OUTSIDE the platform must not undo
a cell's move, and a writer racing the move lands in the right unit or is told.

* T13 — the SAP guard: a unit whose catalog that day holds no line (none at
  all, or only a work-centre row) is handed nothing (`empty_targets`); a
  position that left with its cell is not handed back to the old unit.
* T14 — the ABC import: the old unit's old sheet does not bring a moved
  position (or a work centre that left whole) back, and keeps a twin that
  stayed; the new unit's sheet that does not list an arrival keeps it, id and
  all.
* `_archived_lines` reads a frozen day's archive metadata by id, and marks a
  joined twin.
* T15 — a catalog writer whose row changed unit under it answers 409
  `lines_moved`.

The move records are SYNTHETIC `PPCatalogMove` rows (the follow itself is WP2).
Everything runs against a scratch Postgres database (`SAFIA_TEST_PG`, see
`pg_scratch`) with `app.database.SessionLocal` pointed at it — the dated cell
links are read through it.
"""
from __future__ import annotations

import io
import threading
import time as _time
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException

from app.routers import production as prod
from app.services import pp_catalog
from app.services.cell_lookup import norm_code
from app.services.pp_calc import _line_base, daily_key

C = "A2894"       # the moving cell's work centre
E = "B100"        # a work centre that left whole
D = date(2026, 10, 20)
TODAY = pp_catalog.now_local().date()


# ── pure: the scope cut ─────────────────────────────────────────────────────

class ScopedFaza(unittest.TestCase):
    OPS = [{"order": "O1", "wc": C, "plan": 100}, {"order": "O2", "wc": "A2895", "plan": 50}]
    SKU = {"O1": "F001", "O2": "F002"}
    DELIV = {"O1": 90, "O2": 40}

    def test_no_line_no_rows(self):
        # Work-centre rows alone, or nothing at all: never the plant file.
        self.assertEqual(prod._scoped_faza(self.OPS, self.SKU, self.DELIV, [], {C}, set()), [])
        self.assertEqual(prod._scoped_faza(self.OPS, self.SKU, self.DELIV, [], set(), set()), [])

    def test_exclude_cuts_the_pair_only(self):
        lines = [SimpleNamespace(sap_code="F001", work_center=C),
                 SimpleNamespace(sap_code="F002", work_center="A2895")]
        args = (self.OPS, self.SKU, self.DELIV, lines, {C, "A2895"}, {"F001", "F002"})
        self.assertEqual([r[:2] for r in prod._scoped_faza(*args)],
                         [("F001", C), ("F002", "A2895")])
        self.assertEqual([r[:2] for r in prod._scoped_faza(*args, {("F001", C)})],
                         [("F002", "A2895")])


# ── against Postgres ────────────────────────────────────────────────────────

class _PG(unittest.TestCase):
    X, Y = 31, 32

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
        from app.services import cell_archive, cell_links
        self.db = self.pg.Session()
        for t in (m.PPUpload, m.PPLineDaily, m.PPDaily, m.PPWorkCenterDaily, m.PPCatalogVersion,
                  m.PPProduct, m.PPWorkCenter, m.PPCatalogMove, m.PPManagerSetting,
                  m.CellArchiveSpan, m.CellLinkEvent, m.Cell, m.Manager):
            self.db.query(t).delete()
        self.db.commit()
        cell_links.forget()
        cell_archive.forget()
        self.others = []

    def tearDown(self):
        for s in self.others:
            s.rollback()
            s.close()
        self.db.rollback()
        self.db.close()

    def _other(self):
        s = self.pg.Session()
        self.others.append(s)
        return s

    def _settle(self):
        from app.services import cell_archive, cell_links
        self.db.commit()
        cell_links.forget()
        cell_archive.forget()

    def _units(self, *ids, shift=1):
        from app.models import Manager
        for i in ids:
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=shift))
        self.db.flush()

    def _line(self, mid, sap, name, wc=C, labor=10, group=None, sort=0, active=True, **kw):
        from app.models import PPProduct
        p = PPProduct(manager_id=mid, sap_code=sap, name=name, work_center=wc,
                      labor_time=Decimal(str(labor)), sort_order=sort, active=active,
                      wc_group=group, **kw)
        self.db.add(p)
        self.db.flush()
        return p

    def _wc(self, mid, code, shtatka=0):
        from app.models import PPWorkCenter
        w = PPWorkCenter(manager_id=mid, code=code, shtatka=shtatka)
        self.db.add(w)
        self.db.flush()
        return w

    def _cell(self, code, unit, sap=C, letter=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit, wc_group=letter)
        self.db.add(c)
        self.db.flush()
        return c

    def _moved(self, cell, frm, to, home, lines, *, code=C, whole=False):
        """A `moved` record of what the follow did — the cell's lines at their
        state of departure (`group_from` the letter they left with)."""
        from app.models import PPCatalogMove
        ents = [{"id": p.id, "qty_key": daily_key(p.sap_code, p.name), "wc": p.work_center,
                 "wc_n": norm_code(p.work_center), "base": _line_base(p),
                 "group_from": g, "group_to": g, "active_after": True,
                 "joined_into": None, "takes_sap": True} for p, g in lines]
        self.db.add(PPCatalogMove(kind="live", state="moved", cell_id=cell.id, code=code,
                                  from_unit=frm, to_unit=to, home_from=home, whole_code=whole,
                                  lines=ents, line_ids=[e["id"] for e in ents]))
        self.db.flush()

    def _daily(self, mid, day):
        from app.models import PPDaily
        return sorted((r.sap_code, r.work_center, float(r.plan_qty or 0), float(r.actual_qty or 0))
                      for r in self.db.query(PPDaily).filter(PPDaily.manager_id == mid,
                                                             PPDaily.date == day).all())


# ── T13: the SAP upload ─────────────────────────────────────────────────────

FAZA = [  # (order, wc, plan) — one plant-wide file
    ("O1", C, 100), ("O2", C, 60), ("O3", "A2895", 50)]
ZAGA = {"O1": ("F001", 90), "O2": ("F002", 55), "O3": ("F001", 40)}


def _slices(day):
    raw = [{"order": o, "op": "0010", "wc": wc, "name": "", "plan": pl, "status": "",
            "date": day.isoformat(), "conf": 0} for o, wc, pl in FAZA]
    return {
        "faza": {"raw": raw, "dates": [day]},
        "zaga": {"order_sku": {o: s for o, (s, _d) in ZAGA.items()},
                 "order_deliv": {o: d for o, (_s, d) in ZAGA.items()},
                 "order_due": {o: day for o in ZAGA},
                 "rows": [[o, s, "", 0, d, 0, day.isoformat(), "", ""] for o, (s, d) in ZAGA.items()],
                 "columns": ["order", "sku"]},
    }


def _ops():
    """The parsed-file shape `_ingest_for_manager` is handed."""
    return ([{"order": o, "wc": wc, "plan": pl, "date": D.isoformat()} for o, wc, pl in FAZA],
            {o: s for o, (s, _d) in ZAGA.items()}, {o: d for o, (_s, d) in ZAGA.items()})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class SapGuard(_PG):
    def _upload(self, targets):
        f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="sap.xlsx")
        with mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "read_workbook_slices", return_value=_slices(D)):
            return prod.upload_phase(files=[f], manager_id=None, manager_ids=targets,
                                     date=D.isoformat(), mode="both", file_type=None,
                                     _={}, db=self.db)

    def test_t13_a_unit_with_no_line_receives_nothing(self):
        from app.models import PPDaily
        db = self.db
        self._units(41, 42, 43)
        # 41: nothing but old figures (that is what keeps it «configured»);
        # 42: the same plus a work-centre row; 43: a real line — the control.
        for mid in (41, 42):
            db.add(PPDaily(manager_id=mid, date=D - timedelta(days=5), sap_code="F001",
                           work_center=C, plan_qty=1, actual_qty=1))
        self._wc(42, C, shtatka=3)
        self._line(43, "F001", "Tort")
        self._settle()
        out = self._upload([41, 42, 43])
        self.assertEqual(out["empty_targets"], [41, 42])
        self.assertEqual(out["written"], {"41": 0, "42": 0, "43": 1})
        self.assertEqual(out["rows_written"], 1)
        db.expire_all()
        self.assertEqual(self._daily(41, D), [])
        self.assertEqual(self._daily(42, D), [])
        self.assertEqual(self._daily(43, D), [("F001", C, 100.0, 90.0)])
        # The figures of another day are nobody's business here.
        self.assertEqual(len(self._daily(41, D - timedelta(days=5))), 1)

    def test_t13_a_frozen_empty_day_is_empty_too(self):
        """A unit whose catalog THAT day held no line — it gained its first one
        later — is handed nothing for that day."""
        db = self.db
        self._units(44)
        self._wc(44, C)
        pp_catalog.freeze(db, 44, "create", day=D + timedelta(days=1))
        self._line(44, "F001", "Tort")
        from app.models import PPDaily
        db.add(PPDaily(manager_id=44, date=D - timedelta(days=9), sap_code="X", work_center=C,
                       plan_qty=0, actual_qty=0))
        self._settle()
        out = self._upload([44])
        self.assertEqual((out["empty_targets"], out["written"]), ([44], {"44": 0}))
        self.assertEqual(self._daily(44, D), [])

    def _moved_fixture(self, twin=False):
        """X keeps d (B) at C and a line of F001 at another work centre; c (A)
        took its F001 line at C to Y on D−3."""
        X, Y = self.X, self.Y
        self._units(X, Y)
        c = self._cell("0101", Y, letter="A")
        self._cell("0102", X, letter="B")
        moved = self._line(Y, "F001", "Tort", group="A")
        self._line(X, "F002", "Keks", group="B")
        self._line(X, "F001", "Tort", wc="A2895", sort=2)
        if twin:
            self._line(X, "F001", "Tort", group="B", sort=3)    # stayed, with d
        self._moved(c, X, Y, D - timedelta(days=3), [(moved, "A")])
        self._settle()

    def _ingest(self, mid):
        ops, sku, deliv = _ops()
        n = prod._ingest_for_manager(self.db, mid, D, "both", faza_ops=ops,
                                     order_sku=sku, order_deliv=deliv)
        self.db.commit()
        return n

    def test_moved_out_pair_is_not_handed_back(self):
        X, Y = self.X, self.Y
        self._moved_fixture()
        self.assertEqual(self._ingest(X), 2)
        self.assertEqual([r[:2] for r in self._daily(X, D)], [("F001", "A2895"), ("F002", C)])
        self.assertEqual(self._ingest(Y), 1)
        self.assertEqual([r[:2] for r in self._daily(Y, D)], [("F001", C)])

    def test_moved_out_before_its_day_still_counts(self):
        """A day before the move read the old catalog — the pair is X's there."""
        from app.models import PPCatalogMove
        self._moved_fixture()
        self.db.query(PPCatalogMove).update({PPCatalogMove.home_from: D + timedelta(days=1)})
        self._settle()
        self.assertEqual(self._ingest(self.X), 3)

    def test_staying_twin_keeps_the_pair(self):
        self._moved_fixture(twin=True)
        self.assertEqual(self._ingest(self.X), 3)
        self.assertIn(("F001", C), [r[:2] for r in self._daily(self.X, D)])

    def test_rejoin_obeys_the_same_rules_and_commit_flag(self):
        from app.models import PPDaily
        X, Y = self.X, self.Y
        self._moved_fixture()
        with mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "read_workbook_slices", return_value=_slices(D)):
            f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="sap.xlsx")
            prod.upload_phase(files=[f], manager_id=None, manager_ids=[self.X], date=D.isoformat(),
                              mode="both", file_type=None, _={}, db=self.db)
        db = self.db
        db.query(PPDaily).delete()
        db.commit()
        # X asking for the pair that left: nothing — it is Y's now.
        self.assertEqual(prod._rejoin_lines(db, X, {("F001", C)}, since=D)["rows"], 0)
        # Y's re-join inside a caller's transaction writes and does NOT commit.
        got = prod._rejoin_lines(db, Y, {("F001", C)}, since=D, commit=False)
        self.assertEqual(got["rows"], 1)
        other = self._other()
        self.assertEqual(other.query(PPDaily).filter(PPDaily.manager_id == Y).count(), 0)
        db.rollback()
        self.assertEqual(prod._rejoin_lines(db, Y, {("F001", C)}, since=D)["rows"], 1)
        other.rollback()
        self.assertEqual(other.query(PPDaily).filter(PPDaily.manager_id == Y).count(), 1)

    def test_rejoin_inside_the_follows_own_locks(self):
        """The follow calls `_rejoin_lines(commit=False)` while it holds the
        destination's `NS_QTY` EXCLUSIVELY (tried up front): the shared request
        the re-join makes is its own transaction's, so it never waits."""
        from app.models import PPDaily
        X, Y = self.X, self.Y
        self._moved_fixture()
        with mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "read_workbook_slices", return_value=_slices(D)):
            f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="sap.xlsx")
            prod.upload_phase(files=[f], manager_id=None, manager_ids=[Y], date=D.isoformat(),
                              mode="both", file_type=None, _={}, db=self.db)
        self.db.query(PPDaily).delete()
        self.db.commit()
        follow = self._other()
        self.assertTrue(pp_catalog.lock(follow, [X, Y], try_=True))
        self.assertTrue(pp_catalog.lock(follow, [X, Y], ns=pp_catalog.NS_QTY, try_=True))
        out = {}

        def call():
            out["got"] = prod._rejoin_lines(follow, Y, {("F001", C)}, since=D, commit=False)
        t = threading.Thread(target=call)
        t.start()
        t.join(10)
        self.assertFalse(t.is_alive(), "the re-join waited on its own follow's lock")
        self.assertEqual(out["got"]["rows"], 1)
        # Not committed: another session sees nothing until the follow commits.
        self.assertEqual(self._other().query(PPDaily).count(), 0)
        follow.commit()
        self.assertEqual(self._other().query(PPDaily).filter(PPDaily.manager_id == Y).count(), 1)

    def test_upload_racing_a_follow_names_the_emptied_unit(self):
        """The follow (its own session, `NS_QTY` held exclusively) takes X's
        last line away; the upload names X while it waits, and once the follow
        commits it reads the catalog it is about to write — X is empty, so it is
        listed as such and handed nothing, never reported as a filled target."""
        from app.models import PPCatalogMove, PPProduct
        X, Y = self.X, self.Y
        self._units(X, Y)
        c = self._cell("0101", X)
        p = self._line(X, "F001", "Tort")
        self._settle()
        follow = self._other()
        self.assertTrue(pp_catalog.lock(follow, [X, Y], ns=pp_catalog.NS_QTY, try_=True))
        follow.get(PPProduct, p.id).manager_id = Y
        follow.get(type(c), c.id).manager_id = Y
        follow.add(PPCatalogMove(kind="live", state="moved", cell_id=c.id, code=C,
                                 from_unit=X, to_unit=Y, home_from=D - timedelta(days=2),
                                 whole_code=True, line_ids=[p.id], lines=[]))
        follow.flush()
        out = {}

        def upload():
            s = self.pg.Session()
            try:
                out["res"] = prod.upload_phase(
                    files=[SimpleNamespace(file=io.BytesIO(b"PK"), filename="sap.xlsx")],
                    manager_id=None, manager_ids=[X], date=D.isoformat(), mode="both",
                    file_type=None, _={}, db=s)
            except Exception as e:  # noqa: BLE001
                out["err"] = repr(e)
            finally:
                s.close()
        with mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "read_workbook_slices", return_value=_slices(D)):
            t = threading.Thread(target=upload)
            t.start()
            _time.sleep(0.6)
            self.assertEqual(out, {})               # waiting on the follow's lock
            follow.commit()
            t.join(15)
        self.assertFalse(t.is_alive())
        self.assertNotIn("err", out, out.get("err"))
        self.assertEqual((out["res"]["empty_targets"], out["res"]["written"]), ([X], {str(X): 0}))
        self.db.expire_all()
        self.assertEqual(self._daily(X, D), [])

    def test_ingest_holds_the_quantity_lock(self):
        self._units(45)
        self._line(45, "F001", "Tort")
        self._settle()
        ops, sku, deliv = _ops()
        prod._ingest_for_manager(self.db, 45, D, "both", faza_ops=ops, order_sku=sku,
                                 order_deliv=deliv)
        b = self._other()
        # Shared with another quantity writer, never with the follow's exclusive.
        self.assertTrue(pp_catalog.lock(b, [45], ns=pp_catalog.NS_QTY, shared=True, try_=True))
        b.rollback()
        self.assertFalse(pp_catalog.lock(b, [45], ns=pp_catalog.NS_QTY, try_=True))
        self.db.commit()
        b.rollback()
        self.assertTrue(pp_catalog.lock(b, [45], ns=pp_catalog.NS_QTY, try_=True))


# ── T14: the ABC import ─────────────────────────────────────────────────────

def _row(sap, name, wc, labor, group=None, i=0):
    return {"sap_code": sap, "name": name, "work_center": wc, "labor_time": float(labor),
            "sort_order": i, "wc_group": group}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class AbcImport(_PG):
    HOME = TODAY - timedelta(days=10)

    def _fixture(self):
        """The state after the follow: c (A) took «Tort» at C to Y, e took the
        whole of E («Non» and its work-centre row) to Y. X keeps d (B) with
        «Keks» and a twin «Tort» (B) at C."""
        X, Y = self.X, self.Y
        self._units(X, Y)
        self.c = self._cell("0101", Y, letter="A")
        self.e = self._cell("0103", Y, sap=E)
        self._cell("0102", X, letter="B")
        self._wc(X, C, shtatka=4)
        self.keks = self._line(X, "F002", "Keks", group="B", sort=0)
        self.twin = self._line(X, "F001", "Tort", group="B", sort=1)
        self.y_own = self._line(Y, "F005", "Pishiriq", group="C", sort=0)
        self.tort = self._line(Y, "F001", "Tort", group="A", sort=1)      # arrived with c
        self.non = self._line(Y, "F003", "Non", wc=E, labor=7, sort=2)    # arrived with e
        self.old = self._line(Y, "F009", "Eski", sort=3, active=False,
                              archived_at=datetime.now(timezone.utc), archived_by="admin")
        self._moved(self.c, X, Y, self.HOME, [(self.tort, "A")])
        self._moved(self.e, X, Y, self.HOME, [(self.non, None)], code=E, whole=True)
        self._settle()

    def _import(self, mid, products, work_centers=(), groups=False):
        parsed = {"products": [dict(p) for p in products],
                  "work_centers": [dict(w) for w in work_centers],
                  "sheet": "Sheet1 Test", "has_group_column": groups}
        f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="abc.xlsx")
        with mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "parse_catalog_workbook", return_value=parsed):
            out = prod.import_catalog(file=f, manager_id=mid, sheet_name=None, _={}, db=self.db)
        self.db.expire_all()
        return out

    def _lines(self, mid):
        from app.models import PPProduct
        return [(p.name, p.work_center, p.wc_group, p.active, p.sort_order)
                for p in self.db.query(PPProduct).filter(PPProduct.manager_id == mid)
                .order_by(PPProduct.sort_order, PPProduct.id).all()]

    def _wcs(self, mid):
        from app.models import PPWorkCenter
        return sorted((w.code, w.shtatka) for w in self.db.query(PPWorkCenter)
                      .filter(PPWorkCenter.manager_id == mid).all())

    OLD_SHEET = [_row("F001", "Tort", C, 10, "B"), _row("F002", "Keks", C, 10, "B"),
                 _row("F001", "Tort", C, 10, "A"), _row("F003", "Non", E, 7)]
    OLD_WCS = [{"code": C, "shtatka": 4, "capacity": None, "sort_order": 0},
               {"code": E, "shtatka": 2, "capacity": None, "sort_order": 1}]

    def test_t14_x_old_sheet_with_groups(self):
        """By its letter: the A row is the one that left, though a B twin
        stands before it."""
        self._fixture()
        out = self._import(self.X, self.OLD_SHEET, self.OLD_WCS, groups=True)
        self.assertEqual(self._lines(self.X), [("Tort", C, "B", True, 0), ("Keks", C, "B", True, 1)])
        self.assertEqual(self._wcs(self.X), [(C, 4)])
        self.assertEqual(out["products"], 2)
        self.assertEqual(sorted((r["name"], r["work_center"], r["to_unit_name"])
                                for r in out["skipped_moved_out"]),
                         [("Non", E, f"Unit {self.Y}"), ("Tort", C, f"Unit {self.Y}")])
        self.assertEqual(out["skipped_wc"], [E])
        self.assertEqual(out["kept_moved_in"], [])
        # Y is untouched by X's import.
        self.assertEqual(len(self._lines(self.Y)), 4)

    def test_t14_x_old_sheet_without_groups(self):
        """No «Группа» column: ONE Tort row goes (two rows, one departure), and
        the one left carries the stayed twin's letter."""
        self._fixture()
        sheet = [dict(r, wc_group=None) for r in self.OLD_SHEET]
        out = self._import(self.X, sheet, self.OLD_WCS, groups=False)
        self.assertEqual(self._lines(self.X), [("Keks", C, "B", True, 0), ("Tort", C, "B", True, 1)])
        self.assertEqual(len(out["skipped_moved_out"]), 2)
        self.assertEqual(self._wcs(self.X), [(C, 4)])

    def test_t14_x_code_back_in_use_keeps_its_row(self):
        """A cell stands at E in X again — the work centre is X's once more and
        its staffing row comes in; «Non» itself is still e's, in Y, so its row
        is left out like any other moved-out line."""
        self._fixture()
        self._cell("0109", self.X, sap=E)
        self._settle()
        out = self._import(self.X, self.OLD_SHEET, self.OLD_WCS, groups=True)
        self.assertEqual(self._lines(self.X), [("Tort", C, "B", True, 0), ("Keks", C, "B", True, 1)])
        self.assertEqual(out["skipped_wc"], [])
        self.assertEqual(sorted(r["name"] for r in out["skipped_moved_out"]), ["Non", "Tort"])
        self.assertEqual(self._wcs(self.X), [(C, 4), (E, 2)])

    def test_t14_y_sheet_without_the_arrival_keeps_it(self):
        self._fixture()
        ids = (self.tort.id, self.non.id, self.old.id)
        out = self._import(self.Y, [_row("F005", "Pishiriq", C, 10, "C")])
        from app.models import PPProduct
        got = {p.id: (p.name, p.active, p.sort_order, p.wc_group)
               for p in self.db.query(PPProduct).filter(PPProduct.manager_id == self.Y).all()}
        self.assertEqual(got[ids[0]], ("Tort", True, 1, "A"))
        self.assertEqual(got[ids[1]], ("Non", True, 2, None))
        self.assertEqual(got[ids[2]], ("Eski", False, 3, None))        # the kept archive after them
        self.assertEqual(len(got), 4)
        self.assertEqual(sorted((r["name"], r["work_center"], r["from_unit_name"])
                                for r in out["kept_moved_in"]),
                         [("Non", E, f"Unit {self.X}"), ("Tort", C, f"Unit {self.X}")])
        self.assertEqual(out["archived_kept"], 1)

    def test_t14_y_sheet_that_lists_the_arrival_replaces_it(self):
        self._fixture()
        out = self._import(self.Y, [_row("F005", "Pishiriq", C, 10, "C"), _row("F003", "Non", E, 7)])
        from app.models import PPProduct
        ids = {p.id for p in self.db.query(PPProduct).filter(PPProduct.manager_id == self.Y).all()}
        self.assertIn(self.tort.id, ids)
        self.assertNotIn(self.non.id, ids)
        self.assertEqual([r["name"] for r in out["kept_moved_in"]], ["Tort"])
        self.assertEqual([n for n, *_ in self._lines(self.Y)], ["Pishiriq", "Non", "Tort", "Eski"])

    def test_import_waits_for_a_follow_then_skips_what_it_moved(self):
        """The follow holds X's catalog lock while it moves c's «Tort» to Y;
        X's import of an old sheet queues on that lock and, once the follow
        commits, reads its record — the moved row is left out, not re-created
        beside the copy Y now holds."""
        from app.models import Cell, PPCatalogMove, PPProduct
        X, Y = self.X, self.Y
        self._units(X, Y)
        c = self._cell("0101", X, letter="A")
        self._cell("0102", X, letter="B")
        self._line(X, "F002", "Keks", group="B")
        tort = self._line(X, "F001", "Tort", group="A", sort=1)
        self._settle()
        follow = self._other()
        self.assertTrue(pp_catalog.lock(follow, [X, Y], try_=True))
        follow.get(PPProduct, tort.id).manager_id = Y
        follow.get(Cell, c.id).manager_id = Y
        follow.add(PPCatalogMove(
            kind="live", state="moved", cell_id=c.id, code=C, from_unit=X, to_unit=Y,
            home_from=self.HOME, whole_code=False, line_ids=[tort.id],
            lines=[{"id": tort.id, "qty_key": "F001", "wc": C, "wc_n": C,
                    "base": _line_base(tort), "group_from": "A", "group_to": "A",
                    "active_after": True, "joined_into": None, "takes_sap": True}]))
        follow.flush()
        out = {}

        def run():
            s = self.pg.Session()
            parsed = {"products": [_row("F002", "Keks", C, 10, "B"), _row("F001", "Tort", C, 10, "A")],
                      "work_centers": [], "sheet": "Sheet1 Test", "has_group_column": True}
            try:
                with mock.patch.object(prod, "validate_spreadsheet"), \
                        mock.patch.object(prod, "parse_catalog_workbook", return_value=parsed):
                    out["res"] = prod.import_catalog(
                        file=SimpleNamespace(file=io.BytesIO(b"PK"), filename="abc.xlsx"),
                        manager_id=X, sheet_name=None, _={}, db=s)
            except Exception as e:  # noqa: BLE001
                out["err"] = repr(e)
            finally:
                s.close()
        t = threading.Thread(target=run)
        t.start()
        _time.sleep(0.6)
        self.assertEqual(out, {})                   # waiting on the follow's lock
        follow.commit()
        t.join(15)
        self.assertFalse(t.is_alive())
        self.assertNotIn("err", out, out.get("err"))
        self.assertEqual([r["name"] for r in out["res"]["skipped_moved_out"]], ["Tort"])
        self.db.expire_all()
        self.assertEqual([n for n, *_ in self._lines(X)], ["Keks"])
        self.assertEqual(self.db.get(PPProduct, tort.id).manager_id, Y)

    def test_no_moves_reads_as_before(self):
        self._units(51)
        self._line(51, "F001", "Tort")
        self._settle()
        out = self._import(51, [_row("F001", "Tort", C, 10), _row("F002", "Keks", C, 10)])
        self.assertEqual((out["skipped_moved_out"], out["skipped_wc"], out["kept_moved_in"]),
                         ([], [], []))
        self.assertEqual([n for n, *_ in self._lines(51)], ["Tort", "Keks"])


# ── the «Arxiv» card ────────────────────────────────────────────────────────

@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class ArchivedLines(_PG):
    def test_frozen_day_reads_metadata_by_id(self):
        X, Y = self.X, self.Y
        db = self.db
        self._units(X, Y)
        stamp = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
        gone = self._line(X, "F001", "Tort", active=False, archived_at=stamp,
                          archived_by="Admin A", archived_from=D - timedelta(days=9))
        self._line(X, "F002", "Keks")
        pp_catalog.freeze(db, X, "edit", day=D)
        gone.manager_id = Y                      # followed its cell to Y since
        self._settle()
        cat = pp_catalog.at(db, X, D - timedelta(days=1))
        self.assertTrue(cat.frozen)
        rows = prod._archived_lines(db, cat, {}, X)
        self.assertEqual([(r["id"], r["archived_by"], r["archived_from"], r["twin_live"]) for r in rows],
                         [(gone.id, "Admin A", (D - timedelta(days=9)).isoformat(), False)])

    def test_joined_twin(self):
        Y = self.Y
        db = self.db
        self._units(Y)
        self._line(Y, "F001", "Tort", group="A")
        joined = self._line(Y, "F001", " tort ", wc=" a2894", sort=5, active=False,
                            archived_by="Yacheyka ko'chishi")
        alone = self._line(Y, "F009", "Eski", sort=6, active=False)
        self._settle()
        rows = {r["id"]: r for r in prod._archived_lines(db, pp_catalog.at(db, Y, D), {}, Y)}
        self.assertTrue(rows[joined.id]["twin_live"])
        self.assertFalse(rows[alone.id]["twin_live"])


# ── T15: a writer whose row changed unit ────────────────────────────────────

@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class WriterRace(_PG):
    def _fixture(self):
        X, Y = self.X, self.Y
        self._units(X, Y)
        self.p = self._line(X, "F001", "Tort")
        self.q = self._line(X, "F002", "Keks", sort=1)
        self.w = self._wc(X, C, shtatka=4)
        self._settle()

    def _race(self, call, rows=(), *, delete=False):
        """The follow (its own session) holds X's catalog lock and moves `rows`
        to Y — or deletes them — not yet committed; the writer, on another
        session, reads them as X's, queues on the lock, and is answered once
        the follow commits."""
        f = self._other()
        self.assertTrue(pp_catalog.lock(f, [self.X], try_=True))
        for r in rows:
            got = f.get(type(r), r.id)
            if delete:
                f.delete(got)
            else:
                got.manager_id = self.Y
        f.flush()
        out = {}

        def writer():
            s = self.pg.Session()
            try:
                call(s)
                out["ok"] = True
            except HTTPException as e:
                code = e.detail.get("code") if isinstance(e.detail, dict) else e.detail
                out["status"] = (e.status_code, code)
            except Exception as e:  # noqa: BLE001
                out["err"] = repr(e)
            finally:
                s.rollback()
                s.close()
        t = threading.Thread(target=writer)
        t.start()
        _time.sleep(0.6)
        self.assertEqual(out, {})                   # waiting on the follow's lock
        f.commit()
        t.join(15)
        self.assertFalse(t.is_alive())
        return out

    def _no_version(self):
        from app.models import PPCatalogVersion
        self.assertEqual(self._other().query(PPCatalogVersion).filter(
            PPCatalogVersion.manager_id == self.X).count(), 0)

    def _row(self, model, rid):
        return self._other().get(model, rid)

    MOVED = {"status": (409, "lines_moved")}

    def test_t15_stale_copy_in_hand(self):
        """No waiting at all: the writer's session already holds the row as
        X's when the follow commits — its own query hands it back unchanged."""
        from app.models import PPProduct
        self._fixture()
        self.db.get(PPProduct, self.p.id)
        s = self._other()
        s.get(PPProduct, self.p.id).manager_id = self.Y
        s.commit()
        with self.assertRaises(HTTPException) as cm:
            prod.admin_update_catalog(self.p.id, prod.CatalogBody(labor_time=25), _={}, db=self.db)
        self.assertEqual((cm.exception.status_code, cm.exception.detail["code"]), (409, "lines_moved"))
        self.assertIsInstance(cm.exception.detail["message"], str)
        self.db.rollback()
        self._no_version()
        p = self._row(PPProduct, self.p.id)
        self.assertEqual((p.manager_id, float(p.labor_time)), (self.Y, 10.0))

    def test_t15_edit_waits_then_is_refused(self):
        from app.models import PPProduct
        self._fixture()
        out = self._race(lambda s: prod.admin_update_catalog(
            self.p.id, prod.CatalogBody(labor_time=33), _={}, db=s), [self.p])
        self.assertEqual(out, self.MOVED)
        self._no_version()
        p = self._row(PPProduct, self.p.id)
        self.assertEqual((p.manager_id, float(p.labor_time)), (self.Y, 10.0))

    def test_t15_delete(self):
        from app.models import PPProduct
        self._fixture()
        out = self._race(lambda s: prod.admin_delete_catalog(self.p.id, _={}, db=s), [self.p])
        self.assertEqual(out, self.MOVED)
        self.assertEqual(self._row(PPProduct, self.p.id).manager_id, self.Y)

    def test_t15_bulk_one_row_moved(self):
        from app.models import PPProduct
        self._fixture()
        out = self._race(lambda s: prod.admin_bulk_update_catalog(
            prod.CatalogBulkBody(ids=[self.p.id, self.q.id], labor_time=12), _={}, db=s), [self.q])
        self.assertEqual(out, self.MOVED)
        self.assertEqual(float(self._row(PPProduct, self.p.id).labor_time), 10.0)

    def test_t15_archive_one_row_gone(self):
        from app.models import PPProduct
        self._fixture()
        out = self._race(lambda s: prod.admin_archive_catalog(
            prod.CatalogArchiveBody(ids=[self.p.id, self.q.id], archived=True), payload={}, db=s),
            [self.q], delete=True)
        self.assertEqual(out, self.MOVED)
        self.assertTrue(self._row(PPProduct, self.p.id).active)
        self._no_version()

    def test_t15_work_centre_moved_or_gone(self):
        from app.models import PPWorkCenter
        self._fixture()
        call = lambda s: prod.admin_update_work_center(self.w.id, prod.WorkCenterBody(shtatka=9),
                                                       _={}, db=s)
        self.assertEqual(self._race(call, [self.w]), self.MOVED)
        self.assertEqual(self._row(PPWorkCenter, self.w.id).shtatka, 4)
        s = self._other()
        s.get(PPWorkCenter, self.w.id).manager_id = self.X
        s.commit()
        self.assertEqual(self._race(call, [self.w], delete=True), self.MOVED)
        self._no_version()

    def test_create_waits_for_the_follow(self):
        """A new line has no row to have moved — it waits for the follow's
        commit, then reads the catalog as it now stands."""
        from app.models import PPProduct
        self._fixture()
        out = self._race(lambda s: prod.admin_create_catalog(prod.CatalogCreateBody(
            manager_id=self.X, sap_code="F007", name="Yangi", work_center=C, labor_time=5),
            _={}, db=s))
        self.assertEqual(out, {"ok": True})
        self.assertEqual(self._other().query(PPProduct).filter(
            PPProduct.manager_id == self.X, PPProduct.sap_code == "F007").count(), 1)

    def test_unmoved_writers_go_through(self):
        from app.models import PPProduct, PPWorkCenter
        self._fixture()
        self.assertTrue(prod.admin_update_catalog(
            self.p.id, prod.CatalogBody(labor_time=25), _={}, db=self.db)["ok"])
        self.assertEqual(prod.admin_bulk_update_catalog(prod.CatalogBulkBody(
            ids=[self.p.id, self.q.id], uom="dona"), _={}, db=self.db)["updated"], 2)
        self.assertEqual(prod.admin_archive_catalog(prod.CatalogArchiveBody(
            ids=[self.q.id], archived=True), payload={}, db=self.db)["changed"], 1)
        self.assertTrue(prod.admin_update_work_center(
            self.w.id, prod.WorkCenterBody(shtatka=6), _={}, db=self.db)["ok"])
        self.assertTrue(prod.admin_delete_catalog(self.q.id, _={}, db=self.db)["ok"])
        self.db.expire_all()
        self.assertEqual(float(self._row(PPProduct, self.p.id).labor_time), 25.0)
        self.assertEqual(self._row(PPWorkCenter, self.w.id).shtatka, 6)
        self.assertIsNone(self._row(PPProduct, self.q.id))


if __name__ == "__main__":
    unittest.main()
