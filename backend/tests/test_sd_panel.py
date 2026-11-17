"""panel.safiabakery.uz's «Минусы» report: the login dance, the page read, and
the refusals the card names. The markup is the real page's, the values made up."""
import unittest
from unittest import mock
from urllib.parse import parse_qs

import httpx

from app.services import sd_panel

LOGIN = ('<form id="login-form" action="/login" method="post">'
         '<input type="hidden" name="_csrf-backend" value="tok&amp;en==">'
         '<input name="LoginForm[username]"><input type="password" name="LoginForm[password]"></form>')
REFUSED = LOGIN + '<p class="help-block help-block-error">Неверный логин или пароль.</p>'


def _report(heads=None):
    th = "".join(f"<th>{h}</th>" for h in (heads or sd_panel.HEADERS))
    row = ('<tr data-id="{item}"><td>{n}</td>'
           '<td><a href="/task-factory/list?id=18&amp;t=16&amp;d=01.10.2026">1 - 2811 - Фасовка</a></td>'
           '<td>Inspector A</td><td>01.10.26</td><td class="text-center">82.14%\t\t</td>'
           '<td class="text-center">{rating}</td>'
           '<td><a href="/task-scheduler/view?id=2538372">Проверка ворот качества/</a></td>'
           '<td><a href="/task-scheduler/view?id=2538372#item-{item}">Наличие ворот</a></td>'
           '<td>Нет &amp; всё</td><td class="text-nowrap">{top}</td></tr>')
    body = (row.format(item=11, n=1, rating="0%", top="TOP (36)")
            + '<tr><td colspan="10">&nbsp;</td></tr>'
            + row.format(item=12, n=2, rating="75%", top=""))
    return (f'<table class="table table-striped report-table"><thead><tr>{th}</tr></thead>'
            f'<tbody>{body}</tbody></table>')


def _panel(post_status=302, report=None, report_status=200, seen=None):
    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "GET" and req.url.path == "/login":
            return httpx.Response(200, text=LOGIN)
        if req.method == "POST" and req.url.path == "/login":
            if seen is not None:
                seen.update(parse_qs(req.content.decode()))
            if post_status == 200:
                return httpx.Response(200, text=REFUSED)
            return httpx.Response(post_status, headers={"location": "/"})
        if req.url.path == "/task-factory-reports/cancelled":
            if report_status == 302:
                return httpx.Response(302, headers={"location": "https://panel.safiabakery.uz/login"})
            return httpx.Response(report_status, text=report or _report())
        return httpx.Response(404)

    real = httpx.Client
    return mock.patch.object(sd_panel.httpx, "Client",
                             lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


class SdPanelTest(unittest.TestCase):
    def test_rows_are_read_and_spacers_skipped(self):
        rows = sd_panel.parse(_report())
        self.assertEqual([r["item"] for r in rows], [11, 12])
        a, b = rows
        self.assertEqual((a["workshop_id"], a["task_id"], a["day"]), (18, 2538372, "2026-10-01"))
        self.assertEqual((a["total"], a["rating"], a["top"]), (82.14, 0.0, 36))
        self.assertEqual((a["workshop"], a["comment"]), ("1 - 2811 - Фасовка", "Нет & всё"))
        self.assertEqual((b["rating"], b["top"]), (75.0, None))

    def test_a_changed_page_is_refused_not_misread(self):
        for page in ("<html>no table</html>",
                     _report(heads=sd_panel.HEADERS[:3] + ["Новый"] + sd_panel.HEADERS[4:])):
            with self.assertRaises(sd_panel.PanelError) as cm:
                sd_panel.parse(page)
            self.assertEqual(cm.exception.code, "shape")

    def test_login_then_report(self):
        seen = {}
        with _panel(seen=seen):
            rows = sd_panel.read_report("user1", " pa ss-1 ")
        self.assertEqual(len(rows), 2)
        self.assertEqual(seen["_csrf-backend"], ["tok&en=="])
        # The password goes as typed — spaces and dashes are part of it.
        self.assertEqual(seen["LoginForm[password]"], [" pa ss-1 "])

    def test_refusals_are_named(self):
        cases = [
            (dict(post_status=200), "refused", "Неверный логин или пароль."),
            (dict(report_status=302), "no_access", ""),
            (dict(report_status=500), "status", "GET report"),
        ]
        for kw, code, message in cases:
            with _panel(**kw), self.assertRaises(sd_panel.PanelError) as cm:
                sd_panel.read_report("user1", "x")
            self.assertEqual((cm.exception.code, cm.exception.message), (code, message), kw)


if __name__ == "__main__":
    unittest.main()
