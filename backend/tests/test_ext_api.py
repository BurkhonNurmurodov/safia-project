"""The external read API: its key wall and the closed day's clock parser."""
import unittest
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import HTTPException

from app.routers import ext_api


def _req(**headers):
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host="203.0.113.9"),
                           url=SimpleNamespace(path="/api/ext/v1/cells"))


class ExtApiTest(unittest.TestCase):
    def test_no_token_is_refused_before_the_database(self):
        for req in (_req(), _req(authorization="Basic abc")):
            with self.assertRaises(HTTPException) as e:
                ext_api._client(req, None)
            self.assertEqual(e.exception.status_code, 401)

    def test_token_state(self):
        from datetime import timedelta, timezone
        from app.services import api_tokens
        now = datetime(2026, 11, 11, tzinfo=timezone.utc)
        row = SimpleNamespace(revoked_at=None, expires_at=now + timedelta(days=1))
        self.assertEqual(api_tokens.state(row, now), "active")
        row.expires_at = now
        self.assertEqual(api_tokens.state(row, now), "expired")
        row.revoked_at = now
        self.assertEqual(api_tokens.state(row, now), "revoked")

    def test_manual_says_the_same_in_every_language(self):
        from app.services import ext_api_manual as m
        for lang in m.LANGS:
            self.assertEqual(set(m._S[lang]), set(m._S["en"]), lang)
            self.assertEqual(len(m.manual(lang)["blocks"]), len(m.manual("en")["blocks"]))
        self.assertEqual(m.manual("xx")["lang"], "ru")

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
