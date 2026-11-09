"""«Profilni ko'rish» — the registrant's Telegram profile is shaped from the Bot
API's answers (docs/registration.md «The registrant's Telegram profile»).
Telegram is faked; no database is needed.

    ./venv/bin/python -m unittest tests.test_tg_profile
"""
from __future__ import annotations

import unittest
from unittest import mock

from fastapi import HTTPException

from app.routers import admin

CHAT = {
    "id": 42, "type": "private", "first_name": "Ali", "username": "ali",
    "bio": "Novvoy", "birthdate": {"day": 2, "month": 7, "year": 2005},
    "profile_accent_color_id": 4, "emoji_status_custom_emoji_id": "e1",
    "profile_background_custom_emoji_id": "e2",
    "personal_chat": {"id": -100, "type": "channel", "title": "Ali kanali"},
}
ANSWERS = {
    "getUserProfilePhotos": {"total_count": 1, "photos": [[
        {"file_id": "p160"}, {"file_id": "p320"}, {"file_id": "p640"}]]},
    "getUserProfileAudios": None,        # Telegram refused: the tab stays empty
    "getUserGifts": {"total_count": 2, "gifts": [
        {"type": "regular", "gift": {"star_count": 50, "sticker": {
            "file_id": "s1", "is_animated": True, "thumbnail": {"file_id": "t1"}}}},
        {"type": "unique", "gift": {"base_name": "Cap", "number": 7,
            "model": {"sticker": {"file_id": "s2", "is_video": True}},
            "backdrop": {"colors": {"center_color": 0x112233, "edge_color": 0xABCDEF}}}},
    ]},
    "getCustomEmojiStickers": [
        {"custom_emoji_id": "e1", "file_id": "w1"},                       # static webp
        {"custom_emoji_id": "e2", "file_id": "l2", "is_animated": True},  # lottie, no thumb
    ],
    "getChatMemberCount": 70,
}


def fake_call(method, **params):
    if method == "getChat":
        if params["chat_id"] == -100:
            return {"id": -100, "type": "channel", "title": "Ali kanali",
                    "username": "alikanal", "photo": {"small_file_id": "cp"}}
        return CHAT if params["chat_id"] == 42 else None
    return ANSWERS[method]


class TgProfile(unittest.TestCase):
    def setUp(self):
        db = mock.MagicMock()
        db.query.return_value.filter_by.return_value.first.return_value = mock.Mock(phone="+998901234567")
        self.db = db
        self._p = [mock.patch.object(admin, "_tg_call", side_effect=fake_call),
                   mock.patch.object(admin.settings, "telegram_bot_token", "x")]
        for p in self._p:
            p.start()

    def tearDown(self):
        for p in self._p:
            p.stop()

    def test_shape(self):
        r = admin.admin_tg_profile(42, db=self.db, _={})
        self.assertEqual(r["user"]["bio"], "Novvoy")
        self.assertEqual(r["phone"], "+998901234567")
        self.assertEqual(r["photos"], [{"thumb": "p320", "full": "p640"}])
        self.assertEqual(r["audios"], [])
        self.assertEqual(r["gifts"], [
            {"img": "t1", "stars": 50},
            {"img": None, "name": "Cap", "number": 7, "colors": ["#112233", "#abcdef"]},
        ])
        self.assertEqual(r["emoji_status"], "w1")
        self.assertIsNone(r["pattern"])           # an animated sticker with no thumbnail
        self.assertEqual(r["channel"]["username"], "alikanal")
        self.assertEqual(r["channel"]["photo"], "cp")
        self.assertEqual(r["channel"]["members"], 70)

    def test_unknown_account(self):
        with self.assertRaises(HTTPException) as e:
            admin.admin_tg_profile(7, db=self.db, _={})
        self.assertEqual(e.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
