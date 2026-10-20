"""The 2026-10-20 repair of the doubled live copies (TEMPORARY, goes with
`services/live_copy_dedup_oct20.py`), on a scratch Postgres database
(`SAFIA_TEST_PG`, see `pg_scratch`).

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_live_copy_dedup_oct20
"""
from __future__ import annotations

import json
import unittest
from datetime import date, datetime, timezone
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

YOG, IBR, FILE, OLD, SAME = 1, 2, 3, 4, 5
D18, D17 = date(2026, 10, 18), date(2026, 10, 17)


def _copy(db, mid, day, n, *, split=False, twins=0):
    """One copy as `live_projection.write` wrote it: n named rows, the last two
    a split pair with `split`, then `twins` nameless rows identical to each
    other (an exchange's hours-only rows the copy itself wrote alike)."""
    from app.models import Attendance
    out = []
    for i in range(n):
        out.append(Attendance(manager_id=mid, date=day, worker_name=f"W{i}", job_title="Укладчик",
                              schedule="2", clock_in_out=f"07:{i:02d} - 17:00 (9)",
                              hours_worked=9, early_arrival_min=2, effective_hours=8.97,
                              verifix_code="A1", is_supervisor=False))
    for _ in range(twins):
        out.append(Attendance(manager_id=mid, date=day, worker_name=None, job_title="Укладчик",
                              schedule="2", clock_in_out="08:00 - 12:00 (4)", hours_worked=4,
                              early_arrival_min=0, effective_hours=4, verifix_code="A1",
                              is_supervisor=False))
    if split:
        out[n - 2].hc_weight = 0.6
        out[n - 1].hc_weight = 0.4
        out[n - 1].worker_name = out[n - 2].worker_name
    half = out[n - 1] if split else None
    for a in out:
        if a is not half:
            db.add(a)
    if split:
        db.flush()
        half.split_of = out[n - 2].id
        db.add(half)
    db.flush()
    return out


def _fake_pa():
    """`_pa` as the doubled day read: A halved before the repair, whole after."""
    seen: set = set()

    def pa(_db, mid, day):
        first = (mid, day) not in seen
        seen.add((mid, day))
        return [1.22, 0.66] if first else [1.22, 1.44]
    return pa


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class DoubledCopies(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.models import AppSetting, Attendance, LiveProjection, Manager
        db = self.pg.Session()
        db.query(Attendance).delete()
        db.query(LiveProjection).delete()
        db.query(AppSetting).delete()
        for mid, name in ((YOG, "Yog'mirov Feruz"), (IBR, "Ibragimova Sayyora"),
                          (FILE, "File Flow"), (OLD, "Before Live"), (SAME, "Twins Only")):
            if db.get(Manager, mid) is None:
                db.add(Manager(id=mid, name=name, shift=2))
        db.flush()
        now = datetime(2026, 10, 20, 12, 51, 38, tzinfo=timezone.utc)

        def lp(mid, day, rows):
            db.add(LiveProjection(manager_id=mid, day=day, digest="x", rows=rows,
                                  original=[], roster=[], copied_at=now))

        # Yog'mirov: 8 rows (a split pair, and two nameless rows alike) copied
        # twice → 16 rows, the copy says 8.
        _copy(db, YOG, D18, 6, split=True, twins=2)
        _copy(db, YOG, D18, 6, split=True, twins=2)
        lp(YOG, D18, 8)
        # Ibragimova: 5 plain rows copied three times.
        for _ in range(3):
            _copy(db, IBR, D18, 5)
        lp(IBR, D18, 5)
        # Not written twice: two identical rows the copy itself wrote (n == rows).
        _copy(db, SAME, D17, 3, twins=2)
        lp(SAME, D17, 5)
        # A file-flow day on a live date (no copy) and a day before LIVE_FROM,
        # both with identical rows: never touched.
        _copy(db, FILE, D18, 2)
        _copy(db, FILE, D18, 2)
        _copy(db, OLD, date(2026, 10, 1), 2)
        _copy(db, OLD, date(2026, 10, 1), 2)
        lp(OLD, date(2026, 10, 1), 2)
        db.commit()
        self.ids_before = {m: sorted(i for (i,) in db.query(Attendance.id).filter_by(manager_id=m))
                           for m in (YOG, IBR, FILE, OLD, SAME)}
        db.close()

    def _rows(self, mid):
        from app.models import Attendance
        db = self.pg.Session()
        try:
            return db.query(Attendance).filter_by(manager_id=mid).order_by(Attendance.id).all()
        finally:
            db.close()

    def _run(self):
        from app.services import live_copy_dedup_oct20 as fx
        db = self.pg.Session()
        try:
            with mock.patch.object(fx.action_log, "record") as rec, \
                 mock.patch.object(fx, "_pa", _fake_pa()):
                out = fx.run(db)
            return out, rec
        finally:
            db.close()

    def test_doubled_copies_lose_their_twins_and_nothing_else(self):
        out, logged = self._run()
        days = {(d["unit_id"], d["day"]): d for d in out["days"]}
        self.assertEqual(set(days), {(YOG, "2026-10-18"), (IBR, "2026-10-18")})

        yog = days[(YOG, "2026-10-18")]
        # 4 plain rows + the alike pair, doubled = 12 → 6; the split pair stays doubled.
        self.assertEqual((yog["before"], yog["after"], yog["copy_rows"], yog["deleted"],
                          yog["copies"], yog["split_rows"]), (16, 10, 8, 6, 2, 4))
        rows = self._rows(YOG)
        self.assertEqual(len(rows), 10)
        self.assertEqual(sum(1 for r in rows if r.worker_name is None), 2, "the copy's own twin pair stays")
        self.assertEqual(sum(1 for r in rows if r.split_of is not None or r.hc_weight is not None), 4,
                         "split halves are never touched")
        kept = [r.id for r in rows]
        self.assertEqual(kept, sorted(kept))
        # The lowest ids are the ones kept: the first copy, whole.
        first_copy = self.ids_before[YOG][:8]
        self.assertTrue(set(first_copy) <= set(kept))

        ibr = days[(IBR, "2026-10-18")]
        self.assertEqual((ibr["before"], ibr["after"], ibr["copy_rows"], ibr["deleted"], ibr["copies"]),
                         (15, 5, 5, 10, 3))
        self.assertEqual([r.id for r in self._rows(IBR)], self.ids_before[IBR][:5])

        for mid in (FILE, OLD, SAME):
            self.assertEqual([r.id for r in self._rows(mid)], self.ids_before[mid], mid)

        self.assertEqual(logged.call_count, 2)
        kw = logged.call_args_list[0].kwargs
        self.assertEqual((kw["source"], kw["category"], kw["unit_id"]), ("system", "attendance", YOG))

    def test_it_runs_once_and_resumes_from_its_record(self):
        from app.services import live_copy_dedup_oct20 as fx
        first, _ = self._run()
        again, logged = self._run()
        self.assertEqual(again, first)
        logged.assert_not_called()
        # A record left half-way (a restart mid-pass) is resumed, not redone.
        from app.models import AppSetting
        db = self.pg.Session()
        half = dict(first, done=False)
        db.query(AppSetting).filter_by(key=fx.RECORD).one().value = json.dumps(half)
        db.commit()
        db.close()
        resumed, logged = self._run()
        self.assertEqual(len(resumed["days"]), len(first["days"]))
        logged.assert_not_called()

    def test_pa_reads_the_full_table_and_never_fails_the_pass(self):
        """The real `_pa` on the scratch DB: no production data, so no figure —
        but an answer, not an exception."""
        from app.services import live_copy_dedup_oct20 as fx
        db = self.pg.Session()
        try:
            got = fx._pa(db, YOG, D18)
        finally:
            db.close()
        self.assertTrue(got is None or len(got) == 2, got)

    def test_the_dm_lists_every_unit_day(self):
        from app.services import live_copy_dedup_oct20 as fx
        db = self.pg.Session()
        sent = []
        try:
            with mock.patch.object(fx.action_log, "record"), \
                 mock.patch.object(fx, "_pa", _fake_pa()), \
                 mock.patch.object(fx.settings, "telegram_bot_token", "t"), \
                 mock.patch.object(fx, "_post", lambda chat, body: sent.append((chat, body))):
                n = fx.send(db, 42)
        finally:
            db.close()
        self.assertEqual(n, 1)
        body = sent[0][1]
        self.assertEqual(sent[0][0], 42)
        self.assertIn("Yog'mirov Feruz · 18.10: 16 → 10 rows (copy 8)", body)
        self.assertIn("Ibragimova Sayyora · 18.10: 15 → 5 rows (copy 5)", body)
        self.assertIn("still 2 over, split halves 4 untouched", body)
        self.assertIn("To'liq hisob P / A: 122% / 66% → 122% / 144%", body)
        self.assertNotIn("File Flow", body)
        self.assertNotIn("Twins Only", body)


if __name__ == "__main__":
    unittest.main()
