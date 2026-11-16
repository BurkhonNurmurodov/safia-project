"""«Sabablar» saved on a CLOSED month closes that month again with the new list
(routers/turnover.save_exclusions, 2026-11-16) — October kept counting «Учёба»
because the save reached only the live list. No database: the service is
stood in for."""
import unittest
from datetime import date
from unittest import mock

from app.routers import turnover as r


class SaveRefreezeTest(unittest.TestCase):
    def _save(self, state, month="2026-10"):
        tv = r.turnover
        with mock.patch.object(tv, "rule", return_value={"exclude_reasons": []}), \
                mock.patch.object(tv, "save_exclusions", return_value=["Учёба"]), \
                mock.patch.object(tv, "month_state", return_value=(state, None)), \
                mock.patch.object(tv, "refreeze") as rf, \
                mock.patch.object(r.kept_answer, "forget_all"), \
                mock.patch.object(r.action_log, "enrich"):
            out = r.save_exclusions(r.ExclusionsIn(reasons=["Учёба"], month=month), mock.MagicMock(),
                                    {"full_name": "HR"})
        return out, rf

    def test_a_closed_month_is_closed_again(self):
        out, rf = self._save("closed")
        rf.assert_called_once()
        self.assertEqual(rf.call_args.args[1], date(2026, 10, 1))
        self.assertEqual(out["refrozen"], "2026-10")

    def test_an_open_month_is_left_to_the_live_list(self):
        out, rf = self._save("open")
        rf.assert_not_called()
        self.assertIsNone(out["refrozen"])

    def test_no_month_sent_touches_no_month(self):
        out, rf = self._save("closed", month=None)
        rf.assert_not_called()
        self.assertIsNone(out["refrozen"])


if __name__ == "__main__":
    unittest.main()
