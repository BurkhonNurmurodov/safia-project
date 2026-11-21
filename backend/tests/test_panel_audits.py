"""«Auditlar»: one login reads several months of the panel's report, the
month and band rules, and a refused login stops the clock."""
import unittest
from datetime import date

from app.services import panel_audits as pa, sd_panel
from tests.test_sd_panel import _panel


class PanelAuditsTest(unittest.TestCase):
    def test_months_and_bands(self):
        self.assertEqual(pa.months_between(date(2026, 10, 15), date(2027, 1, 2)),
                         [date(2026, 10, 1), date(2026, 11, 1), date(2026, 12, 1), date(2027, 1, 1)])
        self.assertEqual([pa.band_of(v) for v in (95, 90, 85, 75, 70, 0, None)],
                         ["a90", "a80", "a80", "a70", "low", "low", None])

    def test_one_login_reads_every_month(self):
        paths = [sd_panel.report_path("2026-10-01", "2026-10-31", 10),
                 sd_panel.report_path("2026-11-01", "2026-11-30", 16)]
        self.assertTrue(paths[0].endswith("start=2026-10-01&end=2026-10-31&type=10"))
        seen = {}
        with _panel(seen=seen):
            got = sd_panel.read_reports("user1", "pw", paths)
        self.assertEqual([len(got[p]) for p in paths], [2, 2])
        self.assertEqual(seen.get("LoginForm[username]"), ["user1"])

    def test_a_refused_login_raises_before_any_report(self):
        with _panel(post_status=200):
            with self.assertRaises(sd_panel.PanelError) as cm:
                sd_panel.read_reports("user1", "bad", [sd_panel.report_path("2026-10-01", "2026-10-31", 16)])
        self.assertEqual(cm.exception.code, "refused")

    def test_a_changed_page_fails_that_month_only(self):
        with _panel(report="<html>no table</html>"):
            got = sd_panel.read_reports("u", "p", [sd_panel.report_path("2026-10-01", "2026-10-31", 16)])
        err = next(iter(got.values()))
        self.assertIsInstance(err, sd_panel.PanelError)
        self.assertEqual(err.code, "shape")


if __name__ == "__main__":
    unittest.main()
