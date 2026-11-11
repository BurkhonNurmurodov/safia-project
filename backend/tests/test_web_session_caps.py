"""A password session holds the profile's grants only — never the account's."""
import unittest
from unittest import mock

from app import capabilities as caps


class WebSessionCaps(unittest.TestCase):
    def _caps(self, payload):
        with mock.patch.object(caps, "_profile_perm_modes", return_value={caps.MODE_GRANT}), \
             mock.patch.object(caps, "caps_for_profile", return_value={"page.view.overview": "all"}), \
             mock.patch.object(caps, "caps_for_user", return_value={"page.view.cells": "all"}):
            return caps.caller_caps(None, payload, "guest:1")

    def test_telegram_session_gets_account_grants(self):
        got = self._caps({"sub": "7", "role": "guest"})
        self.assertEqual(set(got), {"page.view.overview", "page.view.cells"})

    def test_password_session_gets_profile_grants_only(self):
        got = self._caps({"sub": "7", "role": "guest", "web": True})
        self.assertEqual(set(got), {"page.view.overview"})


if __name__ == "__main__":
    unittest.main()
