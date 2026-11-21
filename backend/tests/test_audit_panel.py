"""The audit-panel client: where the password may go, what the panel's code is
read for, how a login is tried, and what a sample keeps."""
import unittest

import httpx

from app.services import audit_panel as ap


class AuditPanelTest(unittest.TestCase):
    def test_the_address_is_an_allow_list(self):
        ok = {
            "": ("https://dashboard.service.safiabakery.uz", "https://api.dashboard.service.safiabakery.uz"),
            "dashboard.service.safiabakery.uz/audit/kru?page=2": (
                "https://dashboard.service.safiabakery.uz", "https://api.dashboard.service.safiabakery.uz"),
            "https://api.dashboard.service.safiabakery.uz": (
                "https://dashboard.service.safiabakery.uz", "https://api.dashboard.service.safiabakery.uz"),
            "https://audit.safiacorporate.uz/#/list": ("https://audit.safiacorporate.uz", "https://api.audit.safiacorporate.uz"),
            "localhost:5173": ("http://localhost:5173", "http://localhost:5173"),
        }
        for raw, (ui, api) in ok.items():
            got = ap.norm_url(raw)
            self.assertEqual((got["ui"], got["api"]), (ui, api), raw)
        self.assertEqual(ap.norm_url("dashboard.service.safiabakery.uz/audit/kru?page=2")["url"],
                         "https://dashboard.service.safiabakery.uz/audit/kru")
        self.assertEqual(ap.norm_url("https://audit.safiacorporate.uz/#/list")["url"],
                         "https://audit.safiacorporate.uz/#/list")
        for raw in ("http://dashboard.service.safiabakery.uz",          # password in clear
                    "https://safiabakery.uz.evil.com", "https://evilsafiabakery.uz",
                    "https://evil.com", "http://localhost",                # no port
                    "https://user:pw@dashboard.service.safiabakery.uz",
                    "https://dashboard.service.safiabakery.uz:8443"):
            with self.assertRaises(ValueError, msg=raw):
                ap.norm_url(raw)

    def test_the_code_is_read_for_audit_paths(self):
        js = """
          const B="/tasker/api/v1"; fetch(`/tasker/api/v1/audits/list`);
          axios.post("/base/api/v1/v2/login",d); axios.post("/base/api/v1/v2/refresh-token",d);
          get("/kru/api/v1/revisions?size=50"); get(`/audit/api/v1/report/${id}`);
          const r={path:"/audit/kru"}; import("./AuditPage-a1B2c3D4.js"); x="https://api.dashboard.service.safiabakery.uz";
          get("/arc/api/v1/requests/factory");
        """
        got = ap.scan_code([js])
        self.assertIn("/tasker/api/v1/audits/list", got["audit_api"])
        self.assertIn("/kru/api/v1/revisions?size=50", got["audit_api"])
        self.assertIn("/audit/api/v1/report/${id}", got["audit_api"])
        self.assertNotIn("/arc/api/v1/requests/factory", got["audit_api"])
        self.assertEqual(got["login"], ["/base/api/v1/v2/login"])     # never the refresh
        self.assertIn("/audit/kru", got["routes"])
        self.assertIn("https://api.dashboard.service.safiabakery.uz", got["origins"])
        names = [m["name"] for m in got["modules"]]
        self.assertTrue({"tasker", "base", "kru", "audit", "arc"} <= set(names), names)
        chunks = ap._chunks(js, "https://p.safiabakery.uz/assets/index-x.js", "https://p.safiabakery.uz")
        self.assertIn("https://p.safiabakery.uz/assets/AuditPage-a1B2c3D4.js", chunks)

    def _client(self, handler):
        c = ap.api_client({"api": "http://localhost:9"})
        c._transport = httpx.MockTransport(handler)
        return c

    CFG = {"login": "kru", "_password": "s3cret"}

    def test_a_wrong_password_stops_the_tries(self):
        calls = []

        def handler(req):
            calls.append(req.url.path)
            return httpx.Response(404, json={"detail": "Invalid Credentials"})

        tok, tries = ap.login(self._client(handler), self.CFG, ["/base/api/v1/v2/login", "/x/login"])
        self.assertIsNone(tok)
        self.assertEqual(calls, ["/base/api/v1/v2/login"])   # one failed login, not two
        self.assertEqual(tries[-1]["code"], "rejected")
        self.assertNotIn("s3cret", repr(tries))

    def test_a_missing_path_moves_on_and_a_form_follows_a_422(self):
        def handler(req):
            if req.url.path == "/base/api/v1/v2/login":
                return httpx.Response(404, json={"detail": "Not Found"})
            if req.headers.get("content-type", "").startswith("application/json"):
                return httpx.Response(422, json={"detail": [{"loc": ["body", "username"], "msg": "field required"}]})
            return httpx.Response(200, json={"access_token": "eyJ.abc.def-token", "token_type": "bearer"})

        tok, tries = ap.login(self._client(handler), self.CFG, ["/base/api/v1/v2/login", "/auth/token"])
        self.assertEqual(tok, "eyJ.abc.def-token")
        self.assertEqual([t["code"] for t in tries], ["no_path", "shape", "ok"])
        self.assertNotIn("eyJ.abc.def-token", repr(tries))

    def test_a_sample_keeps_the_shape_and_masks(self):
        body = {"items": [{"id": 1, "date": "2026-11-20", "type_name": "КРУ Производство",
                           "division": {"name": "7213 Медовые коржи"}, "avg_rating": 87.5,
                           "auditor_token": "abc", "comment": "x" * 300}], "total": 11042, "page": 1}
        got = ap.shape_of(body)
        self.assertEqual((got["total"], got["count"]), (11042, 1))
        names = {f["name"] for f in got["fields"]}
        self.assertTrue({"date", "type_name", "division.name", "avg_rating"} <= names, names)
        self.assertEqual(got["sample"][0]["auditor_token"], "•••")
        self.assertLessEqual(len(got["sample"][0]["comment"]), 120)
        self.assertEqual(ap.shape_of([{"a": 1}, {"a": 2}])["count"], 2)

    def test_sample_targets_skip_path_parameters(self):
        spec = {"endpoints": [{"method": "GET", "path": "/kru/api/v1/audits", "params": [{"name": "page"}]},
                              {"method": "GET", "path": "/kru/api/v1/audits/{id}", "params": []},
                              {"method": "POST", "path": "/kru/api/v1/audits", "params": []}]}
        panel = {"audit_api": ["/tasker/api/v1/audits/list", "/audit/api/v1/report/${id}", "/audit/api/v1"]}
        got = [t["path"] for t in ap._sample_targets(spec, panel)]
        self.assertEqual(got, ["/kru/api/v1/audits", "/tasker/api/v1/audits/list"])
        self.assertEqual(ap._params_for(["page", "size", "date_from", "q"])["size"], 5)
        self.assertIn("date_from", ap._params_for(["date_from"]))

    def test_the_panel_is_read_chunk_by_chunk_and_never_off_site(self):
        files = {
            "/audit/kru": '<html><title> Service Desk </title><script type="module" src="/assets/index-AAAA1111.js"></script></html>',
            "/assets/index-AAAA1111.js": 'import("./Kru-BBBB2222.js");import("./Other-CCCC3333.js");'
                                         'x="https://evil.com/assets/x-DDDD4444.js";',
            "/assets/Kru-BBBB2222.js": 'get("/kru/api/v1/audits")',
            "/assets/Other-CCCC3333.js": 'get("/arc/api/v1/requests/factory")',
        }
        seen = []

        def handler(req):
            seen.append(str(req.url))
            if req.url.path == "/":
                return httpx.Response(302, headers={"location": "/audit/kru"})
            body = files.get(req.url.path)
            return httpx.Response(200, text=body) if body else httpx.Response(404)

        c = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
        cfg = ap.norm_url("https://panel.safiabakery.uz")
        got = ap.read_panel(c, cfg, 1e18)
        self.assertEqual(got["title"], "Service Desk")
        self.assertEqual(got["files"], 3)
        self.assertEqual(got["audit_api"], ["/kru/api/v1/audits"])
        self.assertFalse(any("evil.com" in u for u in seen), seen)
        # the audit-named chunk is read before the other one
        self.assertLess(seen.index("https://panel.safiabakery.uz/assets/Kru-BBBB2222.js"),
                        seen.index("https://panel.safiabakery.uz/assets/Other-CCCC3333.js"))

        def off_site(req):
            return httpx.Response(302, headers={"location": "https://evil.com/"})
        c2 = httpx.Client(transport=httpx.MockTransport(off_site), follow_redirects=False)
        with self.assertRaises(ap.PanelError) as e:
            ap.read_panel(c2, cfg, 1e18)
        self.assertEqual(e.exception.code, "off_list")


if __name__ == "__main__":
    unittest.main()
