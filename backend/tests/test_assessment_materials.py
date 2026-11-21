"""«Materiallar» — the files a candidate prepares from (2026-11-21).

The rules need no database (how a material is titled, which department it is
stored under, how a big file is cut into pieces, how the Jurnal files each act,
how the pieces are streamed back as one file). The endpoints run where
`SAFIA_TEST_PG` names a server, with the archive-channel relay stubbed: every
file is one row; a title goes with one file only; a refused file adds nothing;
editing never touches the file; a file over 20 MB arrives in pieces and is
listed only once they are exactly the file; a material may be a LINK — a web
address and nothing else — opened, sent as a message, its address editable;
the list, the writes and the file itself are the admin's alone.
"""
import asyncio
import io
import unittest
from datetime import datetime, timedelta, timezone
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

    def test_a_link_is_a_web_address_and_nothing_else(self):
        self.assertEqual(rules.material_url(" https://drive.google.com/file/d/1AbC/view?usp=sharing "),
                         ("https://drive.google.com/file/d/1AbC/view?usp=sharing", "drive.google.com"))
        # pasted without its scheme; `www.` is not part of the name shown
        self.assertEqual(rules.material_url("www.youtube.com/watch?v=x"), ("https://www.youtube.com/watch?v=x", "youtube.com"))
        self.assertEqual(rules.material_url("http://docs.safia.uz:8080/a")[1], "docs.safia.uz")
        for bad in ("", None, "javascript:alert(1)", "data:text/html,<b>x", "file:///etc/passwd", "ftp://host.com/a",
                    "https://", "https://localhost/x", "https://intranet/x", "https://user:pw@host.com/",
                    "https://a b.com/x", "just some words", "https://host.com/\nx", "x" * (rules.MAX_MATERIAL_URL + 1)):
            with self.assertRaises(ValueError, msg=repr(bad)[:40]):
                rules.material_url(bad)

    def test_a_big_file_is_cut_into_full_pieces_and_a_remainder(self):
        P = rules.MATERIAL_PART_BYTES
        self.assertLess(P, rules.MATERIAL_WHOLE_MB * 1024 * 1024)      # a piece the bot API hands back
        self.assertEqual([rules.material_part_count(n) for n in (0, 1, P, P + 1, 3 * P)], [0, 1, 1, 2, 3])
        size = 2 * P + 5
        whole = [(1, P), (2, P), (3, 5)]
        self.assertEqual(rules.material_parts_missing(size, whole), [])
        self.assertEqual(rules.material_parts_missing(size, whole[:2]), [3])
        self.assertEqual(rules.material_parts_missing(size, [(1, P), (3, 5)]), [2])
        self.assertEqual(rules.material_parts_missing(size, [(1, P), (2, P - 1), (3, 5)]), [2])   # a short middle piece
        self.assertEqual(rules.material_parts_missing(size, [(1, P), (2, P), (3, 6)]), [3])       # a wrong remainder
        self.assertEqual(rules.material_parts_missing(2 * P, [(1, P), (2, P)]), [])
        self.assertIsNone(rules.material_parts_missing(size, whole + [(4, 1)]))                  # not this file's pieces
        self.assertIsNone(rules.material_parts_missing(0, []))
        limits = rules.meta()["limits"]
        # `material_mb` stays the one-document limit a bundle from before the pieces reads
        self.assertEqual((limits["material_mb"], limits["material_max_mb"], limits["material_part_bytes"]),
                         (rules.MATERIAL_WHOLE_MB, rules.MAX_MATERIAL_MB, P))

    def test_every_write_is_filed_in_the_jurnal(self):
        self.assertFalse(action_log.should_record("POST", "/api/assessment/materials/parts"))   # the completed upload is the act
        for method, path, action in (
            ("POST", "/api/assessment/materials", "assessment.material_added"),
            ("POST", "/api/assessment/materials/complete", "assessment.material_added"),
            ("POST", "/api/assessment/materials/link", "assessment.material_added"),
            ("PUT", "/api/assessment/materials/7", "assessment.material_edited"),
            ("DELETE", "/api/assessment/materials/7", "assessment.material_deleted"),
            ("POST", "/api/assessment/materials/7/send", "assessment.material_sent"),
        ):
            self.assertEqual(action_log.classify(method, path), ("training", action))


class _Piece:
    """An open archive download: its bytes in chunks, and whether it was closed."""
    def __init__(self, data: bytes, fail: bool = False):
        self.data, self.fail, self.closed = data, fail, False

    def iter_content(self, chunk_size=0):
        yield self.data[:2]
        if self.fail:
            raise RuntimeError("telegram dropped the connection")
        yield self.data[2:]

    def close(self):
        self.closed = True


class StreamPartsTest(unittest.TestCase):
    """A file kept in pieces leaves as ONE download: the pieces in order."""

    def _read(self, resp) -> bytes:
        async def collect():
            return b"".join([chunk async for chunk in resp.body_iterator])
        return asyncio.run(collect())

    def test_pieces_are_stitched_in_order_under_the_files_own_name(self):
        from app.routers import leader_tasks as lt
        pieces = {"A": _Piece(b"hello "), "B": _Piece(b"big "), "C": _Piece(b"file")}
        with mock.patch.object(lt, "_open_tg_file", side_effect=lambda fid: (pieces[fid], {})) as opened:
            resp = lt._stream_tg_parts(["A", "B", "C"], name="Видео дарс.mp4", mime="video/mp4", size=14)
            self.assertEqual(opened.call_count, 1)             # only the first, before the response starts
            self.assertEqual(self._read(resp), b"hello big file")
        self.assertTrue(all(p.closed for p in pieces.values()))
        self.assertEqual(resp.headers["content-length"], "14")
        self.assertTrue(resp.headers["content-disposition"].startswith("attachment;"))
        self.assertIn("filename*=UTF-8''%D0%92", resp.headers["content-disposition"])
        self.assertEqual(resp.headers["x-content-type-options"], "nosniff")
        self.assertEqual(resp.headers["cache-control"], "no-store")

    def test_a_missing_first_piece_is_refused_before_anything_is_sent(self):
        from app.routers import leader_tasks as lt
        with mock.patch.object(lt, "_open_tg_file", side_effect=HTTPException(status_code=404, detail="gone")):
            with self.assertRaises(HTTPException) as ctx:
                lt._stream_tg_parts(["A", "B"], name="a.pdf", size=8)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_a_piece_failing_midway_cuts_the_stream_short(self):
        from app.routers import leader_tasks as lt
        pieces = {"A": _Piece(b"1234"), "B": _Piece(b"5678", fail=True)}
        with mock.patch.object(lt, "_open_tg_file", side_effect=lambda fid: (pieces[fid], {})):
            resp = lt._stream_tg_parts(["A", "B"], name="a.pdf", size=8)
            with self.assertRaises(RuntimeError):      # never a clean end with the tail missing
                self._read(resp)
        self.assertTrue(pieces["B"].closed)


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
        self.db.execute(text("TRUNCATE assessment_material_parts, assessment_materials RESTART IDENTITY"))
        self.db.commit()
        self.admin = {"sub": "1", "full_name": "Admin"}
        # A piece is 4 bytes here, so a ten-byte «file» is three of them.
        for p in (mock.patch.object(r, "_is_admin", return_value=True),
                  mock.patch.object(r, "relay_uploads", side_effect=_relay),
                  mock.patch.object(r.leader_appeal_chat, "relay_file",
                                    side_effect=lambda data, name: (f"TG:{name}:{data.decode()}", 7)),
                  mock.patch.object(rules, "MATERIAL_PART_BYTES", 4)):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()

    def _add(self, names, **fields):
        return self.r.add_materials(parsed={"fields": fields, "files": [_Upload(n) for n in names]},
                                    db=self.db, payload=self.admin)

    KEY = "0123456789abcdef0123456789abcdef"

    def _piece(self, seq, data: bytes, key=None, name="Katta dars.mp4"):
        return self.r.add_material_part(
            parsed={"fields": {"upload": key or self.KEY, "seq": str(seq), "name": name},
                    "files": [_Upload(f"{name}.part", data)]},
            db=self.db, payload=self.admin)

    def _complete(self, size, key=None, name="Katta dars.mp4", **fields):
        return self.r.complete_material(body={"upload": key or self.KEY, "name": name, "size": size, **fields},
                                        db=self.db, payload=self.admin)

    def _parts(self):
        from app.models import AssessmentMaterialPart as P
        self.db.expire_all()
        return self.db.query(P).order_by(P.upload, P.seq).all()

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
        self.assertTrue(rows[0]["sendable"])          # one archive document: the bot can send it on

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

    def test_a_big_file_arrives_in_pieces_and_is_listed_once_whole(self):
        self._piece(3, b"ij")                    # any order
        self._piece(1, b"abcd")
        self.assertEqual(self.r.list_materials(db=self.db, payload=self.admin)["rows"], [])   # nothing yet
        e = self._refused("upload_incomplete", self._complete, 10)
        self.assertEqual((e.status_code, e.detail["missing"]), (409, [2]))
        self._piece(2, b"efg")                   # a short middle piece is not the file either
        self.assertEqual(self._refused("upload_incomplete", self._complete, 10).detail["missing"], [2])
        self._piece(2, b"efgh")                  # sent again: it replaces the piece
        out = self._complete(10, department="okk", note="12 daqiqa", title="  HACCP video ")
        self.assertEqual((out["title"], out["department"], out["note"], out["name"], out["size"], out["mime"]),
                         ("HACCP video", "okk", "12 daqiqa", "Katta dars.mp4", 10, "video/mp4"))
        self.assertFalse(out["sendable"])        # kept in pieces: a browser downloads it, the bot cannot send it
        self.assertEqual([m["id"] for m in self.r.list_materials(db=self.db, payload=self.admin)["rows"]], [out["id"]])
        parts = self._parts()
        self.assertEqual([(p.seq, p.size, p.material_id) for p in parts], [(1, 4, out["id"]), (2, 4, out["id"]), (3, 2, out["id"])])
        self.assertEqual(parts[1].file_id, "TG:Katta dars.mp4.part002:efgh")
        # the same upload cannot be completed, or added to, twice
        self._refused("upload_done", self._complete, 10)
        self._refused("upload_done", self._piece, 1, b"abcd")

        # the file leaves as its pieces in order, under its own name
        with mock.patch("app.routers.leader_tasks._stream_tg_parts", return_value="STREAM") as stream:
            self.assertEqual(self.r.material_file(out["id"], db=self.db, payload=self.admin), "STREAM")
        stream.assert_called_once_with([p.file_id for p in parts], name="Katta dars.mp4", mime="video/mp4", size=10)
        self._refused("too_big_to_send", self.r.send_material, out["id"], db=self.db, payload={"sub": "777"})

        # deleting the material takes its pieces
        self.r.delete_material(out["id"], db=self.db, payload=self.admin)
        self.assertEqual(self._parts(), [])

    def test_a_file_with_no_title_in_pieces_is_called_by_its_name(self):
        self._piece(1, b"abcd")
        self._piece(2, b"e")
        out = self._complete(5, name="5S_taqdimot.pptx")
        self.assertEqual((out["title"], out["department"], out["note"]), ("5S taqdimot", "general", None))

    def test_a_piece_is_refused_unless_it_is_one(self):
        self._refused("bad_upload", self._piece, 1, b"abcd", key="not-a-key")
        self._refused("bad_part", self._piece, 0, b"abcd")
        past = rules.material_part_count(rules.MAX_MATERIAL_MB * 1024 * 1024) + 1
        self._refused("bad_part", self._piece, past, b"abcd")          # past the last piece of the biggest file
        self._refused("bad_part", self._piece, 1, b"abcde")            # over a piece's size
        self._refused("bad_part", self._piece, 1, b"")
        with mock.patch.object(self.r.leader_appeal_chat, "relay_file", return_value=None):
            self.assertEqual(self._refused("store_failed", self._piece, 1, b"abcd").status_code, 502)
        self.assertEqual(self._parts(), [])
        # and an upload is refused whole when it cannot be this file
        self._refused("bad_file", self._complete, 0)
        self._refused("bad_upload", self._complete, 10, key="xyz")
        self._refused("upload_incomplete", self._complete, 10)                       # no piece at all
        e = self._refused("file_too_big", self._complete, rules.MAX_MATERIAL_MB * 1024 * 1024 + 1)
        self.assertEqual(e.status_code, 413)
        self._piece(1, b"abcd")
        self._refused("upload_incomplete", self._complete, 3)                        # more than the file holds
        self._refused("bad_department", self._complete, 4, department="finance")
        self.assertEqual(self.r.list_materials(db=self.db, payload=self.admin)["rows"], [])

    def test_pieces_of_an_abandoned_upload_are_swept_a_day_later(self):
        from app.models import AssessmentMaterialPart as P
        old, fresh = "a" * 32, "b" * 32
        self._piece(1, b"abcd", key=old)
        self._piece(1, b"abcd", key=fresh)
        self.db.query(P).filter(P.upload == old).update(
            {"created_at": datetime.now(timezone.utc) - timedelta(days=2)}, synchronize_session=False)
        self.db.commit()
        self._piece(1, b"xy")
        self._complete(2)
        self.assertEqual(sorted({p.upload for p in self._parts()}), sorted([fresh, self.KEY]))

    LINK = "https://drive.google.com/file/d/1AbC/view?usp=sharing"

    def _link(self, **body):
        return self.r.add_material_link(body={"url": self.LINK, "title": "HACCP video", **body},
                                        db=self.db, payload=self.admin)

    def test_a_material_may_be_a_link(self):
        out = self._link(department="okk", note=" 40 daqiqa ")
        self.assertEqual((out["url"], out["title"], out["department"], out["note"]),
                         (self.LINK, "HACCP video", "okk", "40 daqiqa"))
        self.assertEqual((out["name"], out["size"], out["sendable"]), ("drive.google.com", None, True))
        self.assertEqual(self.r.list_materials(db=self.db, payload=self.admin)["rows"][0]["url"], self.LINK)
        # a link has no name of its own to fall back on, and must be a web address
        self._refused("title_required", self._link, title="  ")
        self._refused("bad_url", self._link, url="javascript:alert(1)")
        self._refused("bad_url", self._link, url="")
        self._refused("bad_department", self._link, department="finance")
        self.assertEqual(len(self.r.list_materials(db=self.db, payload=self.admin)["rows"]), 1)
        # nothing to download: the address is opened instead
        self.assertEqual(self._refused("is_link", self.r.material_file, out["id"], db=self.db, payload=self.admin).status_code, 409)
        # the bot sends it as a message: title, note, the address last
        with mock.patch("app.telegram_bot.bot") as bot:
            self.assertEqual(self.r.send_material(out["id"], db=self.db, payload={"sub": "777"}), {"ok": True})
            bot.send_message.assert_called_once_with(777, f"HACCP video\n\n40 daqiqa\n\n{self.LINK}")
            bot.send_document.assert_not_called()

    def test_a_links_address_can_be_changed_and_a_file_has_none(self):
        link = self._link()["id"]
        out = self.r.edit_material(link, body={"url": "youtu.be/abc", "title": "HACCP video"}, db=self.db, payload=self.admin)
        self.assertEqual((out["url"], out["name"]), ("https://youtu.be/abc", "youtu.be"))
        self._refused("bad_url", self.r.edit_material, link, body={"url": "ftp://x.com/a"}, db=self.db, payload=self.admin)
        # a key left out is left alone
        self.assertEqual(self.r.edit_material(link, body={"note": "1-qism"}, db=self.db, payload=self.admin)["url"], "https://youtu.be/abc")
        file_ = self._add(["a.pdf"])["rows"][0]
        self.assertIsNone(file_["url"])
        self._refused("not_a_link", self.r.edit_material, file_["id"], body={"url": self.LINK}, db=self.db, payload=self.admin)
        # the page sends a file's (absent) address back unchanged: not a change
        self.assertEqual(self.r.edit_material(file_["id"], body={"url": None, "title": "A"}, db=self.db, payload=self.admin)["title"], "A")

    def test_the_link_column_is_added_to_a_table_from_before_it(self):
        from sqlalchemy import text
        from app import startup
        self._add(["a.pdf"])
        self.db.execute(text("ALTER TABLE assessment_materials DROP COLUMN url"))
        self.db.commit()
        for _ in range(2):          # idempotent
            with mock.patch.object(startup, "SessionLocal", self.pg.Session):
                startup.add_assessment_material_links()
        self.db.expire_all()
        rows = self.r.list_materials(db=self.db, payload=self.admin)["rows"]
        self.assertEqual([(m["name"], m["url"]) for m in rows], [("a.pdf", None)])

    def test_everything_is_the_admins_alone(self):
        mid = self._add(["a.pdf"])["rows"][0]["id"]
        judge = {"sub": "5", "full_name": "Hakam"}
        with mock.patch.object(self.r, "_is_admin", return_value=False):
            for call in (lambda: self.r.list_materials(db=self.db, payload=judge),
                         lambda: self._add(["b.pdf"]),
                         lambda: self._piece(1, b"abcd"),
                         lambda: self._complete(4),
                         lambda: self._link(),
                         lambda: self.r.edit_material(mid, body={"title": "x"}, db=self.db, payload=judge),
                         lambda: self.r.delete_material(mid, db=self.db, payload=judge),
                         lambda: self.r.material_file(mid, db=self.db, payload=judge),
                         lambda: self.r.send_material(mid, db=self.db, payload=judge)):
                self.assertEqual(self._refused("admin_only", call).status_code, 403)
        self.assertEqual(len(self.r.list_materials(db=self.db, payload=self.admin)["rows"]), 1)


if __name__ == "__main__":
    unittest.main()
