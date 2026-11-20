"""«Hisobotlar» — the number of ARC service requests filed in a month
(2026-11-20).

Two halves. `services/reports.compose` only folds: the figure it is handed
lands in the Executive summary and Key figures as `arc.filed`, a month TOTAL
whose change is withheld while the picked month still runs, and «no answer»
stays None. `routers/reports._arc_by_month` reads it through the /arc page's
own filter set, so that half needs a real Postgres (`SAFIA_TEST_PG`).
"""
import unittest
from datetime import date, datetime, timezone
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.services import reports


def _months(partial: bool) -> list[dict]:
    return [
        {"from": date(2026, 10, 1), "to": date(2026, 10, 31), "end": date(2026, 10, 31),
         "partial": False, "ym": "2026-10"},
        {"from": date(2026, 11, 1), "to": date(2026, 11, 20 if partial else 30),
         "end": date(2026, 11, 30), "partial": partial, "ym": "2026-11"},
    ]


def _compose(arc, partial=True) -> dict:
    return reports.compose({
        "months": _months(partial), "unit_ids": {1},
        "plan": {}, "eff": {}, "sload": {}, "att": {}, "vkinds": {}, "ontime": {},
        "turnover": {}, "idle": {}, "idle_share": {}, "cost": None,
        "qual": {}, "qual_n": {}, "xav": {}, "vfx_scope": None,
        **({} if arc is None else {"arc": arc}),
        "scope": {"units": 1},
    })


def _row(out: dict, section: str, block: str) -> dict:
    sec = next(s for s in out["sections"] if s["key"] == section)
    blk = next(b for b in sec["blocks"] if b["key"] == block)
    return next(r for r in blk["rows"] if r["key"] == "arc.filed")


class ComposeTest(unittest.TestCase):
    def test_the_figure_is_in_the_summary_and_key_figures(self):
        out = _compose({"2026-10": 310, "2026-11": 187})
        for section, block in (("summary", "headline"), ("figures", "all")):
            r = _row(out, section, block)
            self.assertEqual(r["values"], [310, 187])
            self.assertEqual(r["section"], "arc")
            self.assertEqual(r["fmt"], "int")

    def test_it_is_never_a_section_of_its_own(self):
        out = _compose({"2026-10": 310, "2026-11": 187})
        self.assertNotIn("arc", [s["key"] for s in out["sections"]])

    def test_a_running_month_withholds_the_change(self):
        r = _row(_compose({"2026-10": 310, "2026-11": 187}, partial=True), "summary", "headline")
        self.assertIsNone(r["delta"])
        self.assertEqual(r.get("no_delta"), "partial")

    def test_a_finished_month_carries_the_change(self):
        r = _row(_compose({"2026-10": 310, "2026-11": 187}, partial=False), "summary", "headline")
        self.assertEqual(r["delta"], -123)
        self.assertNotIn("no_delta", r)

    def test_no_answer_stays_none(self):
        # A stored month from before the figure, or a mirror that holds nothing.
        self.assertEqual(_row(_compose(None), "summary", "headline")["values"], [None, None])
        r = _row(_compose({"2026-10": None, "2026-11": 0}, partial=False), "figures", "all")
        self.assertEqual(r["values"], [None, 0])
        self.assertIsNone(r["delta"])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class ArcCountTest(unittest.TestCase):
    """The count is the /arc register's own, for the month and the scope."""

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from sqlalchemy import text

        from app.routers import arc_legacy
        self.arc = arc_legacy
        # The register caches its row source — and reads the old app's hidden
        # categories through SessionLocal, once. Both must be this database's.
        self._patch = mock.patch("app.database.SessionLocal", self.pg.Session)
        self._patch.start()
        arc_legacy._REGISTER = None
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE arc_legacy_requests, arc_requests, cells, managers "
                             "RESTART IDENTITY CASCADE"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.arc._REGISTER = None
        self._patch.stop()

    def _seed(self):
        from app.models import ArcLegacyRequest, ArcRequest, Cell, Manager
        self.db.add_all([Manager(id=1, name="Unit 1", shift=1), Manager(id=2, name="Unit 2", shift=2)])
        self.db.flush()
        self.db.add_all([Cell(verifix_code="0028", manager_id=1), Cell(verifix_code="0031", manager_id=2)])

        def at(month, day, hour=12):
            return datetime(2026, month, day, hour, tzinfo=timezone.utc)

        new = lambda rid, when, wh=None, **kw: ArcLegacyRequest(   # noqa: E731
            remote_id=rid, created_at=when, warehouse_name=wh, normalized_status="new", **kw)
        self.db.add_all([
            new("n1", at(11, 3), "Мойка 1 смена 0028"),
            new("n2", at(11, 5), "Цех 0031"),
            new("n3", at(11, 9)),                                    # names no cell
            new("n4", at(11, 10), "Мойка 0028", cancelled_at=at(11, 11)),   # cancelled: still filed
            new("n5", at(11, 12), "Мойка 0028", missing_since=at(11, 13)),  # the API dropped it
            new("n6", at(10, 20), "Цех 0031"),                       # October
            # 31 Oct 20:00 UTC is 1 Nov 01:00 in Tashkent — November's.
            new("n7", at(10, 31, 20), "Цех 0031"),
        ])
        # The old app's tickets are in the same register.
        self.db.add(ArcRequest(remote_id="500", created_at=at(10, 7), status=3,
                               division_name="Склад 0028"))
        self.db.commit()

    def _count(self, shift=None, scoped=None, partial=False):
        from app.routers.reports import _arc_by_month
        return _arc_by_month(self.db, _months(partial), shift, scoped)

    def test_the_whole_register_by_the_day_filed(self):
        self._seed()
        # November: n1 n2 n3 n4 n7 (n5 is missing); October: n6 + the old app's.
        self.assertEqual(self._count(), {"2026-10": 2, "2026-11": 5})

    def test_a_running_month_ends_at_today(self):
        self._seed()
        from app.models import ArcLegacyRequest
        self.db.add(ArcLegacyRequest(remote_id="late", normalized_status="new",
                                     created_at=datetime(2026, 11, 25, 12, tzinfo=timezone.utc)))
        self.db.commit()
        self.assertEqual(self._count(partial=True)["2026-11"], 5)
        self.assertEqual(self._count(partial=False)["2026-11"], 6)

    def test_a_brigadir_scope_is_the_tickets_on_its_cells(self):
        self._seed()
        self.assertEqual(self._count(scoped=[1]), {"2026-10": 1, "2026-11": 2})   # 0028
        self.assertEqual(self._count(scoped=[2]), {"2026-10": 1, "2026-11": 2})   # 0031
        self.assertEqual(self._count(scoped=[1, 2]), {"2026-10": 2, "2026-11": 4})

    def test_a_shift_is_the_tickets_on_that_shifts_cells(self):
        self._seed()
        self.assertEqual(self._count(shift=1), {"2026-10": 1, "2026-11": 2})
        self.assertEqual(self._count(shift=2, scoped=[1]), {"2026-10": 0, "2026-11": 0})

    def test_an_empty_mirror_is_no_answer(self):
        self.assertEqual(self._count(), {"2026-10": None, "2026-11": None})


if __name__ == "__main__":
    unittest.main()
