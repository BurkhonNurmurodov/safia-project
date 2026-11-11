"""The external read API: its key wall and the closed day's clock parser."""
import unittest
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import HTTPException

from app.routers import ext_api


def _req(**headers):
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host="203.0.113.9"))


class ExtApiTest(unittest.TestCase):
    def test_no_key_and_wrong_key_are_refused(self):
        for req in (_req(), _req(**{"x-api-key": "nope"}), _req(authorization="Bearer nope")):
            with self.assertRaises(HTTPException) as e:
                ext_api._client(req)
            self.assertEqual(e.exception.status_code, 401)

    def test_stored_clock(self):
        d = date(2026, 11, 7)
        self.assertEqual(ext_api._stored_clock(d, "07:59 - 16:59 (8.47)"),
                         (datetime(2026, 11, 7, 7, 59), datetime(2026, 11, 7, 16, 59)))
        # a night shift leaves the next morning
        self.assertEqual(ext_api._stored_clock(d, "20:01 - 08:03 (11.1)")[1],
                         datetime(2026, 11, 8, 8, 3))
        self.assertEqual(ext_api._stored_clock(d, "X"), (None, None))
        self.assertEqual(ext_api._stored_clock(d, None), (None, None))
        self.assertEqual(ext_api._ts(datetime(2026, 11, 7, 7, 59)), "2026-11-07T07:59+05:00")


if __name__ == "__main__":
    unittest.main()
