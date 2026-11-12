"""The Tasker client: where the token may go, how an answer is read, and the
error codes the doc's table promises."""
import unittest

import httpx

from app.services import tasker

TOKEN = "tsk_" + "a" * 43


def _client(handler):
    c = tasker.client({"base": "http://localhost:8132", "token": TOKEN})
    c._transport = httpx.MockTransport(handler)
    return c


class TaskerTest(unittest.TestCase):
    def test_the_address_is_an_allow_list(self):
        ok = {
            "": tasker.PROD_BASE,
            "api.dashboard.service.safiabakery.uz": tasker.PROD_BASE,
            tasker.PROD_BASE + tasker.API_PATH + "/": tasker.PROD_BASE,
            "localhost:8132": "http://localhost:8132",
            "http://127.0.0.1:8132/tasker/api/v1/integration/factory": "http://127.0.0.1:8132",
        }
        for raw, want in ok.items():
            self.assertEqual(tasker.norm_base(raw), want, raw)
        for raw in ("http://api.dashboard.service.safiabakery.uz",       # token in clear
                    "https://api.dashboard.service.safiabakery.uz.evil.com",
                    "https://evil.com", "http://localhost",                  # no port
                    "https://user:pw@api.dashboard.service.safiabakery.uz",
                    tasker.PROD_BASE + "/other/path", "localhost:99999"):
            with self.assertRaises(ValueError, msg=raw):
                tasker.norm_base(raw)

    def test_token_shape(self):
        self.assertTrue(tasker.valid_token(TOKEN))
        for bad in ("", "abc", "tsk_short", TOKEN + " ", "Bearer " + TOKEN):
            self.assertFalse(tasker.valid_token(bad), bad)

    def test_reading_values_and_names(self):
        self.assertEqual(tasker.num("38.0"), 38.0)
        self.assertEqual(tasker.num(79.16), 79.16)
        for v in (None, "", "n/a", True):
            self.assertIsNone(tasker.num(v))
        self.assertEqual(tasker.clean("ФАБРИКА КЗ "), "ФАБРИКА КЗ")
        self.assertEqual(tasker.clean("Тарталетка  ПФ - ГП"), "Тарталетка ПФ - ГП")

    def test_a_department_suggests_a_cell_by_its_code(self):
        cmap = {"8121": {"id": 1, "code": "8121"}, "2751": {"id": 2, "code": "2751"}}
        self.assertEqual(tasker.match_cell("8121 холодный цех", cmap)["id"], 1)
        self.assertEqual(tasker.match_cell("Кекс отдел А2751", cmap)["id"], 2)
        self.assertIsNone(tasker.match_cell("Сдоба Отдел", cmap))

    def test_the_token_rides_the_header_never_the_url(self):
        seen = {}

        def handler(req):
            seen["url"], seen["token"] = str(req.url), req.headers.get("x-integration-token")
            return httpx.Response(200, json=[])

        with _client(handler) as c:
            self.assertEqual(tasker.call(c, "/daily", {"start_date": "2026-11-11"}), [])
        self.assertEqual(seen["token"], TOKEN)
        self.assertNotIn(TOKEN, seen["url"])
        self.assertTrue(seen["url"].startswith("http://localhost:8132" + tasker.API_PATH + "/daily"))

    def test_error_statuses_become_named_codes(self):
        cases = {401: "unauthorized", 403: "forbidden", 422: "bad_request",
                 429: "rate_limited", 503: "unavailable", 500: "http", 302: "redirect"}
        for status, code in cases.items():
            headers = {"retry-after": "17"} if status == 429 else {}
            if status == 302:
                headers = {"location": "https://elsewhere.example/"}
            with _client(lambda req, s=status, h=headers: httpx.Response(s, headers=h, json={"detail": "x"})) as c:
                with self.assertRaises(tasker.TaskerError) as e:
                    tasker.call(c, "/departments")
            self.assertEqual(e.exception.code, code, status)
            if status == 429:
                self.assertEqual(e.exception.retry_after, "17")


if __name__ == "__main__":
    unittest.main()
