"""A missing /assets file is answered `no-store`.

Left without a Cache-Control, Cloudflare stamped that 404 `max-age=14400` and
kept it at the edge — a browser would then hold «not found» for four hours
after the file was back (2026-11-26; a hazard closed, not a seen failure).
"""
import os
import tempfile
import unittest

from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.testclient import TestClient


class MissingAssetNotCached(unittest.TestCase):
    def test_404_is_no_store_and_a_file_stays_immutable(self):
        from app import main

        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "a.js"), "w") as f:
                f.write("1")
            client = TestClient(Starlette(routes=[
                Mount("/assets", main.ImmutableStaticFiles(directory=d)),
            ]))
            missing = client.get("/assets/nope.js")
            self.assertEqual(missing.status_code, 404)
            self.assertEqual(missing.headers.get("cache-control"), "no-store")
            self.assertIn("immutable", client.get("/assets/a.js").headers["cache-control"])


if __name__ == "__main__":
    unittest.main()
