"""The audit KPI read from the panel's «По дням» report (services/sd_panel.py
`parse_days`, services/tech_audit.py — docs/kpi.md «Texnologlar auditi»). The
markup is the real report's shape, the values made up."""
import unittest
import unittest.mock

from app.services import sd_panel, tech_audit as ta

HEAD = "<tr><th>#</th><th>Цех</th><th>01.10</th><th>02.10</th><th>Кол-во</th><th>Среднее</th><th>Обратная связь</th></tr>"


def _row(n, name, d1, d2, count, avg, wid=7):
    cell = lambda v, d: (f'<td><a href="/task-factory/list?id={wid}&amp;d=2026-10-{d}&amp;t=16">{v}</a></td>'
                         if v != "-" else "<td>-</td>")
    return f"<tr><td>{n}</td><td>{name}</td>{cell(d1, '01')}{cell(d2, '02')}<td>{count}</td><td>{avg}</td><td></td></tr>"


class ParseDays(unittest.TestCase):
    def test_every_rated_day_is_one_audit_100_included(self):
        page = (f"<table class='x'>{HEAD}" + _row(1, "1 - 2811 - Фасовка", "75.00%", "100.00%", 2, "87.50%")
                + "<tr><td colspan='7'></td></tr>" + _row(2, "Склад", "-", "-", 0, "-") + "</table>")
        self.assertEqual(sd_panel.parse_days(page, 2026), [
            {"workshop_id": 7, "workshop": "1 - 2811 - Фасовка", "day": "2026-10-01", "rating": 75.0},
            {"workshop_id": 7, "workshop": "1 - 2811 - Фасовка", "day": "2026-10-02", "rating": 100.0}])

    def test_a_count_that_disagrees_is_refused_not_misread(self):
        page = f"<table>{HEAD}" + _row(1, "2811", "75.00%", "-", 2, "75%") + "</table>"
        with self.assertRaises(sd_panel.PanelError) as e:
            sd_panel.parse_days(page, 2026)
        self.assertEqual(e.exception.code, "shape")

    def test_another_table_is_refused(self):
        with self.assertRaises(sd_panel.PanelError):
            sd_panel.parse_days("<table><tr><th>#</th><th>Цех</th><th>Январь</th></tr></table>", 2026)


class Crediting(unittest.TestCase):
    CMAP = {k: {"id": i, "code": k, "owner_id": i, "owner": f"O{k}", "archived": False}
            for i, k in enumerate(["8911", "7411", "7315", "8920"], 1)}

    def _keys(self, name, wid=None):
        return ta.division_keys({"division": name, "workshop_id": wid}, self.CMAP)

    def test_a_workshop_naming_two_cells_counts_for_both(self):
        self.assertEqual(self._keys("8911 бисконти, 7411 - Цех Пирог и печенье (кру)"), ["8911", "7411"])

    def test_an_old_code_is_placed_by_the_panel_id(self):
        self.assertEqual(self._keys("2322 - Оф.Мел.Изд.Экл2", wid=11), ["7315"])
        self.assertEqual(self._keys("2322 - Оф.Мел.Изд.Экл2", wid=999), [])

    def test_list_numbers_and_floors_are_not_codes(self):
        self.assertEqual(self._keys("1 - 8920 Цех выпекания б блок 3 этаж (кру)"), ["8920"])

    def test_every_workshop_of_a_code_is_averaged_as_the_panel_prints(self):
        audits = [{"date": "2026-10-01", "division": "8920 - Цех Выпекания", "workshop_id": 1, "rating": 90.0},
                  {"date": "2026-10-02", "division": "8920 б блок", "workshop_id": 2, "rating": 90.11},
                  {"date": "2026-10-03", "division": "8911, 7411 - Цех", "workshop_id": 3, "rating": 80.0}]
        with unittest.mock.patch.object(ta, "ranked", return_value=True), \
                unittest.mock.patch.object(ta, "owned", return_value=True):
            out = ta.aggregate(audits, self.CMAP, ta.json.loads(ta.json.dumps(ta.DEFAULT_RULE)))
        row = {x["code"]: x for x in out["ranking"]}
        self.assertEqual((row["8920"]["audits"], row["8920"]["pct"], row["8920"]["score"]), (2, 90.06, 3))
        self.assertEqual((row["7411"]["audits"], row["8911"]["audits"]), (1, 1))
        self.assertEqual(out["totals"]["audits"], 3)


if __name__ == "__main__":
    unittest.main()
