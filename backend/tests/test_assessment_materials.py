"""«Materiallar» — the files a candidate prepares from (2026-11-21).

The rules need no database (how a material is titled, which department it is
stored under, how the Jurnal files each act). The endpoints run where
`SAFIA_TEST_PG` names a server, with the archive-channel relay stubbed: every
file is one row; a title goes with one file only; a refused file adds nothing;
editing never touches the file; the list, the writes and the file itself are
the admin's alone.
"""
import io
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from fastapi import HTTPException

from app.services import action_log
from app.services import assessment as rules


class RulesTest(unittest.TestCase):
    def test_title_is_the_typed_one_else_the_file_name(self):
        self.assertEqual(rules.material_title("  Kaizen   qo'llanma ", "x.pdf"), "Kaizen qo'llanma")
        self.assertEqual(rules.material_title("", "Kaizen qo'llanma.pdf"), "Kaizen qo'llanma")
        self.assertEqual(rules.material_title(None, "tb_xavfsizlik_v2.final.docx"), "tb xavfsizlik v2.final")
        self.assertEqual(rules.material_title(None, "C:\\docs\\Тест.xlsx"), "Тест")
        self.assertEqual(rules.material_title(None, "README"), "README")
        self.assertEqual(rules.material_title(None, ".pdf"), ".pdf")       # nothing but an extension
        self.assertEqual(rules.material_title(None, None), "file")
        self.assertEqual(len(rules.material_title("x" * 500, "a.pdf")), rules.MAX_MATERIAL_TITLE)

    def test_department_is_one_of_the_five_or_general(self):
        for v in (None, "", rules.GENERAL):
            self.assertIsNone(rules.material_department(v))
        for d in rules.DEPARTMENTS:
            self.assertEqual(rules.material_department(d), d)
        with self.assertRaises(ValueError):
            rules.material_department("finance")

    def test_every_write_is_filed_in_the_jurnal(self):
        for method, path, action in (
            ("POST", "/api/assessment/materials", "assessment.material_added"),
            ("PUT", "/api/assessment/materials/7", "assessment.material_edited"),
            ("DELETE", "/api/assessment/materials/7", "assessment.material_deleted"),
            ("POST", "/api/assessment/materials/7/send", "assessment.material_sent"),
        ):
            self.assertEqual(action_log.classify(method, path), ("training", action))


class _Upload:
    """What `appeal_body` hands over for one file of a multipart body."""
    def __init__(self, name: str, data: bytes = b"x"):
        self.filename, self.file, self.size = name, io.BytesIO(data), len(data)


def _relay(uploads):
    """`relay_uploads` without Telegram: every file «stored», in order."""
    return [{"name": u.filename, "mime": "application/pdf", "size": u.size,
             "file_id": f"FILE-{i}", "message_id": 100 + i} for i, u in enumerate(uploads)]


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class MaterialsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from sqlalchemy import text
        from app.routers import assessment as r
        self.r = r
        self.db = self.pg.Session()
        self.db.execute(text("TRUNCATE assessment_materials RESTART IDENTITY"))
        self.db.commit()
        self.admin = {"sub": "1", "full_name": "Admin"}
        for p in (mock.patch.object(r, "_is_admin", return_value=True),
                  mock.patch.object(r, "relay_uploads", side_effect=_relay)):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def _add(self, names, **fields):
        return self.r.add_materials(parsed={"fields": fields, "files": [_Upload(n) for n in names]},
                                    db=self.db, payload=self.admin)

    def _refused(self, code, fn, *a, **kw):
        with self.assertRaises(HTTPException) as ctx:
            fn(*a, **kw)
        self.assertEqual(ctx.exception.detail["code"], code)
        return ctx.exception

    def test_every_file_is_one_row(self):
        out = self._add(["Kaizen qo'llanma.pdf", "5S.pptx"], department="kaizen", note=" 2-bobni o'qing ")
        self.assertEqual(out["added"], 2)
        rows = self.r.list_materials(db=self.db, payload=self.admin)["rows"]
        self.assertEqual([m["title"] for m in rows], ["5S", "Kaizen qo'llanma"])       # newest first
        self.assertEqual({m["department"] for m in rows}, {"kaizen"})
        self.assertEqual({m["note"] for m in rows}, {"2-bobni o'qing"})
        self.assertEqual(rows[1]["name"], "Kaizen qo'llanma.pdf")
        self.assertEqual(rows[0]["created_by"], "Admin")
        self.assertNotIn("file_id", rows[0])          # the archive's handle never leaves the server

    def test_no_department_is_general(self):
        self._add(["Nizom.pdf"])
        self._add(["Nizom 2.pdf"], department="general")
        self.assertEqual([m["department"] for m in self.r.list_materials(db=self.db, payload=self.admin)["rows"]],
                         ["general", "general"])
        self._refused("bad_department", self._add, ["a.pdf"], department="finance")

    def test_a_title_goes_with_one_file(self):
        self.assertEqual(self._add(["scan0001.pdf"], title="TB yo'riqnomasi")["rows"][0]["title"], "TB yo'riqnomasi")
        self._refused("title_one", self._add, ["a.pdf", "b.pdf"], title="Ikkalasi")
        self._refused("file_required", self._add, [])
        self.assertEqual(len(self.r.list_materials(db=self.db, payload=self.admin)["rows"]), 1)

    def test_a_refused_file_adds_nothing(self):
        for status, code in ((413, "file_too_big"), (502, "store_failed"), (400, "bad_file")):
            with mock.patch.object(self.r, "relay_uploads", side_effect=HTTPException(status_code=status, detail="no")):
                e = self._refused(code, self._add, ["a.pdf", "b.pdf"])
            self.assertEqual(e.status_code, status)
        self.assertEqual(self.r.list_materials(db=self.db, payload=self.admin)["rows"], [])

    def test_edit_renames_moves_and_never_touches_the_file(self):
        mid = self._add(["a.pdf"], department="tb")["rows"][0]["id"]
        out = self.r.edit_material(mid, body={"title": "Yong'in xavfsizligi", "department": "general", "note": ""},
                                   db=self.db, payload={"sub": "2", "full_name": "Boshqa admin"})
        self.assertEqual((out["title"], out["department"], out["note"]), ("Yong'in xavfsizligi", "general", None))
        self.assertEqual((out["name"], out["updated_by"]), ("a.pdf", "Boshqa admin"))
        # a key left out is left alone
        self.assertEqual(self.r.edit_material(mid, body={"note": "1-bob"}, db=self.db, payload=self.admin)["title"],
                         "Yong'in xavfsizligi")
        self._refused("title_required", self.r.edit_material, mid, body={"title": "  "}, db=self.db, payload=self.admin)
        self._refused("bad_department", self.r.edit_material, mid, body={"department": "x"}, db=self.db, payload=self.admin)
        self._refused("not_found", self.r.edit_material, 999, body={}, db=self.db, payload=self.admin)

    def test_delete_takes_the_row(self):
        mid = self._add(["a.pdf"])["rows"][0]["id"]
        self.assertEqual(self.r.delete_material(mid, db=self.db, payload=self.admin), {"ok": True})
        self.assertEqual(self.r.list_materials(db=self.db, payload=self.admin)["rows"], [])
        self._refused("not_found", self.r.delete_material, mid, db=self.db, payload=self.admin)

    def test_send_puts_the_file_into_the_callers_chat_under_its_title_and_note(self):
        mid = self._add(["a.pdf"], title="Kaizen", note="2-bob")["rows"][0]["id"]
        with mock.patch("app.telegram_bot.bot") as bot:
            self.assertEqual(self.r.send_material(mid, db=self.db, payload={"sub": "777"}), {"ok": True})
            bot.send_document.assert_called_once_with(777, "FILE-0", caption="Kaizen\n\n2-bob")
            bot.send_document.side_effect = RuntimeError("blocked")
            self._refused("send_failed", self.r.send_material, mid, db=self.db, payload={"sub": "777"})
        self._refused("no_chat", self.r.send_material, mid, db=self.db, payload={"sub": "web-user"})

    def test_everything_is_the_admins_alone(self):
        mid = self._add(["a.pdf"])["rows"][0]["id"]
        judge = {"sub": "5", "full_name": "Hakam"}
        with mock.patch.object(self.r, "_is_admin", return_value=False):
            for call in (lambda: self.r.list_materials(db=self.db, payload=judge),
                         lambda: self._add(["b.pdf"]),
                         lambda: self.r.edit_material(mid, body={"title": "x"}, db=self.db, payload=judge),
                         lambda: self.r.delete_material(mid, db=self.db, payload=judge),
                         lambda: self.r.material_file(mid, db=self.db, payload=judge),
                         lambda: self.r.send_material(mid, db=self.db, payload=judge)):
                self.assertEqual(self._refused("admin_only", call).status_code, 403)
        self.assertEqual(len(self.r.list_materials(db=self.db, payload=self.admin)["rows"]), 1)


if __name__ == "__main__":
    unittest.main()
