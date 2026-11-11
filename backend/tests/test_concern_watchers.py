"""Who gets every new concern (concerns.tell_watchers, 2026-11-11)."""
import unittest

from app.routers.concerns import ALL_CONCERNS_WATCHERS, _name_words


def _match(name):
    return any(w <= _name_words(name) for w in ALL_CONCERNS_WATCHERS)


class WatcherNameTest(unittest.TestCase):
    def test_umarbek_in_any_spelling(self):
        for n in ("Karimov Umarbek", "Umarbek Karimov", "Каримов Умарбек Ботирович",
                  "KARIMOV UMARBEK"):
            self.assertTrue(_match(n), n)

    def test_namesakes_do_not_match(self):
        for n in ("Karimova Umida", "Umarbek Karimjonov", "", None):
            self.assertFalse(_match(n), n)


if __name__ == "__main__":
    unittest.main()
