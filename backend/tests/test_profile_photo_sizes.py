"""A profile photo served at the size it is drawn, and kept by the browser
(services/profile_photo.py, app/browser_cache.py — 2026-11-13). No database.
"""
import unittest
from unittest import mock
from io import BytesIO

from PIL import Image

from app import browser_cache
from app.services import profile_photo


def _jpeg(side: int) -> bytes:
    img = Image.new("RGB", (side, side))
    img.putdata([((x * 7) % 256, (y * 5) % 256, (x + y) % 256)
                 for y in range(side) for x in range(side)])
    buf = BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


class Snap(unittest.TestCase):
    def test_a_size_is_rounded_up_to_one_that_is_served(self):
        self.assertEqual([profile_photo.snap(s) for s in (1, 20, 96, 97, 192)],
                         [96, 96, 96, 192, 192])

    def test_anything_else_is_the_stored_picture(self):
        for s in (None, 0, -5, 193, 512, 100000, "abc", ""):
            self.assertIsNone(profile_photo.snap(s), s)


class Smaller(unittest.TestCase):
    def test_a_stored_photo_is_scaled_down(self):
        stored = _jpeg(512)
        small = profile_photo.smaller(stored, 96)
        img = Image.open(BytesIO(small))
        self.assertEqual((img.size, img.format), ((96, 96), "JPEG"))
        self.assertLess(len(small), len(stored) / 4)

    def test_one_already_that_small_is_served_as_it_is(self):
        stored = _jpeg(80)
        self.assertIs(profile_photo.smaller(stored, 96), stored)
        self.assertIs(profile_photo.smaller(_jpeg(96), 96).__class__, bytes)


class Sized(unittest.TestCase):
    def setUp(self):
        profile_photo._small.clear()
        self.stored = _jpeg(512)
        self.loads = 0

    def load(self):
        self.loads += 1
        return self.stored

    def test_a_size_is_made_once_per_photo_version(self):
        a = profile_photo.sized("supervisor:1", "v1", 96, self.load)
        b = profile_photo.sized("supervisor:1", "v1", 96, self.load)
        self.assertIs(a, b)
        self.assertEqual(self.loads, 1)                 # the second needed no bytes at all
        profile_photo.sized("supervisor:1", "v1", 192, self.load)
        profile_photo.sized("supervisor:1", "v2", 96, self.load)     # the photo was replaced
        profile_photo.sized("supervisor:2", "v1", 96, self.load)
        self.assertEqual(self.loads, 4)

    def test_no_photo_is_no_answer_and_is_not_remembered(self):
        self.assertIsNone(profile_photo.sized("leader:9", "v1", 96, lambda: None))
        self.assertEqual(len(profile_photo._small), 0)

    def test_a_picture_that_cannot_be_scaled_is_served_as_stored(self):
        with self.assertLogs(level="ERROR"):
            got = profile_photo.sized("leader:7", "v1", 96, lambda: b"not a picture")
        self.assertEqual(got, b"not a picture")

    def test_the_copies_kept_are_bounded(self):
        with mock.patch.object(profile_photo, "_SMALL_MAX", 3):
            for i in range(6):
                profile_photo.sized(f"leader:{i}", "v1", 96, self.load)
        self.assertEqual(len(profile_photo._small), 3)


class RouteName(unittest.TestCase):
    def test_the_photo_module_keeps_its_name_in_the_profiles_router(self):
        # As `profile_photo` the GET route shadowed the module, and the admin
        # upload called `.store` on a function.
        from app.routers import profiles
        self.assertIs(profiles.profile_photo, profile_photo)
        self.assertTrue(callable(profiles.get_profile_photo))


PHOTO = "/api/profiles/photo/supervisor%3A12"
ASKED = [(b"content-type", b"image/jpeg"),
         (b"cache-control", b"private, max-age=31536000, immutable")]


class BrowserKept(unittest.TestCase):
    def test_a_photo_keeps_the_header_its_route_asked_for(self):
        got = dict(browser_cache.kept_headers(PHOTO, 200, ASKED))
        self.assertEqual(got[b"cache-control"], b"private, max-age=31536000, immutable")
        self.assertEqual(got[b"x-litespeed-cache-control"], b"no-cache")
        self.assertEqual(got[b"content-type"], b"image/jpeg")
        # No shared cache may keep it, and it must not hang on the token.
        self.assertNotIn(b"vary", got)
        self.assertNotIn(b"pragma", got)
        self.assertNotIn(b"expires", got)

    def test_anything_but_a_200_is_not_kept(self):
        for status in (401, 403, 404, 500, 304, None):
            self.assertIsNone(browser_cache.kept_headers(PHOTO, status, ASKED), status)

    def test_an_answer_that_did_not_ask_is_not_kept(self):
        for headers in ([], [(b"cache-control", b"max-age=60")],
                        [(b"cache-control", b"public, max-age=31536000, immutable")],
                        [(b"cache-control", b"private, max-age=600")]):
            self.assertIsNone(browser_cache.kept_headers(PHOTO, 200, headers), headers)

    def test_no_other_api_answer_is_ever_kept(self):
        for path in ("/api/leaderboard", "/api/profiles/photo-versions", "/api/profiles/me/details",
                     "/api/people/15/photo", "/api/auth/web/session", "/admin/settings"):
            self.assertIsNone(browser_cache.kept_headers(path, 200, ASKED), path)


if __name__ == "__main__":
    unittest.main()
