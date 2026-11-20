"""A browser session whose standing cannot be READ is refused with 503, never
401 — the browser drops its token on any 401, so a full DB pool used to sign
web users out (app/security._web_token_live)."""
import unittest
from unittest import mock

import jwt
from fastapi import HTTPException
from starlette.requests import Request

from app.config import settings
from app import security


def _request(payload):
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return Request({"type": "http", "method": "GET", "path": "/api/x",
                    "headers": [(b"authorization", f"Bearer {token}".encode())]})


class WebSessionGuardTests(unittest.TestCase):
    def test_unreadable_standing_is_503_not_401(self):
        with mock.patch("app.web_auth.web_session_is_live", side_effect=RuntimeError("pool full")):
            with self.assertRaises(HTTPException) as ctx:
                security._check_init_data(_request({"web": True, "wu": "aripova.m", "wv": 1}))
        self.assertEqual(ctx.exception.status_code, 503)

    def test_revoked_token_is_still_401(self):
        with mock.patch("app.web_auth.web_session_is_live", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                security._check_init_data(_request({"web": True, "wu": "aripova.m", "wv": 1}))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_live_token_passes(self):
        with mock.patch("app.web_auth.web_session_is_live", return_value=True):
            security._check_init_data(_request({"web": True, "wu": "aripova.m", "wv": 1}))


if __name__ == "__main__":
    unittest.main()
