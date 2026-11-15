"""The launcher's stored layout keeps its SHAPE (services/nav_layout.py)."""
import unittest

from app.services.nav_layout import LayoutError, clean, counts


def app(ident, pages=(), tabs=(), **extra):
    return {"id": ident, "pages": list(pages), "tabs": list(tabs), **extra}


class Clean(unittest.TestCase):
    def test_nothing_is_the_default(self):
        self.assertIsNone(clean(None))
        self.assertIsNone(clean({"apps": []}))

    def test_a_layout_round_trips(self):
        raw = {"apps": [
            app("overview", ["/overview", "/cells"]),
            app("x4f9k2a", [], [{"id": "xk81m0c", "label": {"ru": " Отчёты  дня "},
                                 "icon": "Folder", "pages": ["/reports"]}],
                label={"ru": "Склад", "en": ""}, icon="Package", hue="teal"),
        ], "loose": ["/assistant", "/cells"]}
        got = clean(raw)
        self.assertEqual(got["v"], 1)
        # Placed in an app first, so not loose as well.
        self.assertEqual(got["loose"], ["/assistant"])
        self.assertEqual([a["id"] for a in got["apps"]], ["overview", "x4f9k2a"])
        self.assertNotIn("label", got["apps"][0])
        mine = got["apps"][1]
        # An empty language is not stored; spaces are folded.
        self.assertEqual(mine["label"], {"ru": "Склад"})
        self.assertEqual((mine["icon"], mine["hue"]), ("Package", "teal"))
        self.assertEqual(mine["tabs"][0]["label"], {"ru": "Отчёты дня"})
        self.assertEqual(clean(got), got)
        self.assertEqual(counts(got), (2, 1, 4))

    def test_a_screen_sits_in_one_place(self):
        got = clean({"apps": [
            app("a", ["/x", "/y", "/x"]),
            app("b", ["/y"], [{"id": "t", "pages": ["/x", "/z"]}]),
        ]})
        self.assertEqual(got["apps"][0]["pages"], ["/x", "/y"])
        self.assertEqual(got["apps"][1]["pages"], [])
        self.assertEqual(got["apps"][1]["tabs"][0]["pages"], ["/z"])

    def test_what_is_not_a_layout_is_refused(self):
        bad = [
            [],                                             # not an object
            {"apps": "overview"},
            {"apps": [app("Over view")]},                   # id
            {"apps": [app("a"), app("a")]},                 # an app twice
            {"apps": [app("a", ["cells"])]},                # a path has a slash
            {"apps": [app("a", ["/x?y=1"])]},
            {"apps": [app("a", ["/" + "x" * 90])]},
            {"apps": [app("a", icon="<svg>")]},
            {"apps": [app("a", hue="#ff0000")]},
            {"apps": [app("a", label={"ru": "я" * 61})]},
            {"apps": [app("a", label="Склад")]},
            {"apps": [app("a", tabs=[{"id": "top"}])]},     # the headerless row
            {"apps": [app("a", tabs=[{"id": "t"}]), app("b", tabs=[{"id": "t"}])]},
            {"apps": [app(f"a{i}") for i in range(41)]},
            {"apps": [app("a", tabs=[{"id": f"t{i}"} for i in range(21)])]},
            {"apps": [app("a")], "loose": "/assistant"},
        ]
        for raw in bad:
            with self.assertRaises(LayoutError, msg=repr(raw)[:60]):
                clean(raw)


if __name__ == "__main__":
    unittest.main()
