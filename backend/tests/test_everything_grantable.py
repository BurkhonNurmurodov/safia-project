"""Every page, admin page and admin power is grantable (the operator,
2026-11-19: «every single functionality and page can be granted on the
Permissions page and listed»). These fail the commit gate the day a new door
ships admin-only again, or names a grant the catalog does not hold."""
import os
import re
import unittest
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none")

ROOT = Path(__file__).resolve().parents[2]


class EverythingGrantable(unittest.TestCase):
    def test_no_endpoint_is_admin_only(self):
        from fastapi.routing import APIRoute
        from app.main import app
        from app.routers.admin import verify_admin

        def calls(dependant):
            for d in dependant.dependencies:
                yield d.call
                yield from calls(d)

        left = sorted(f"{'/'.join(sorted(r.methods))} {r.path}" for r in app.routes
                      if isinstance(r, APIRoute) and verify_admin in set(calls(r.dependant)))
        self.assertEqual(left, [], "admin-only endpoints no grant opens")

    def test_every_admin_panel_page_has_a_grant(self):
        from app.capabilities import CAPABILITIES
        nav = (ROOT / "frontend/src/config/adminNav.js").read_text()
        ids = set(re.findall(r'\{ id: "([\w-]+)",\s+group: "adm-', nav))
        self.assertTrue(ids)
        opened = set()
        for c in CAPABILITIES:
            t = c["tab"]
            opened |= {t} if isinstance(t, str) else set(t or ())
        self.assertEqual(ids - opened, set(), "admin pages no capability opens")

    def test_page_keys_match_the_frontend(self):
        from app.permissions import PAGE_KEYS
        pages = (ROOT / "frontend/src/config/pages.js").read_text()
        self.assertEqual(sorted(set(re.findall(r'\bkey: "([\w-]+)",\s+route:', pages))),
                         sorted(PAGE_KEYS))

    def test_every_page_admin_named_in_code_is_in_the_catalog(self):
        from app.capabilities import ADMIN_PAGES
        pat = re.compile(r'(?:page_admin\(\s*db,\s*\w+,\s*|require_page_admin\(\s*|adminOn\(\s*'
                         r'|page_admin_cap\(\s*|pageAdminCap\(\s*|"page\.admin\.)"?([\w-]+)"')
        named = set()
        for base, exts in (("backend/app", (".py",)), ("frontend/src", (".js", ".jsx"))):
            for p in (ROOT / base).rglob("*"):
                if p.suffix in exts and "node_modules" not in p.parts:
                    named |= set(pat.findall(p.read_text(errors="ignore")))
        named -= {"leaders", "p", "page", "pageKey"}   # leaders → leaders.admin; variables
        self.assertEqual(named - set(ADMIN_PAGES), set(), "page.admin grants the catalog lacks")


if __name__ == "__main__":
    unittest.main()
