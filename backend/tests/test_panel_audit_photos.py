"""«Auditlar» photos: a section page's photos per question, read once (again
only while young), kept by the panel's question id, offered on the rows, and
fetched through the photo door only for a path a page linked."""
import os
import sys
import unittest
from datetime import datetime, timedelta
from io import BytesIO
from unittest import mock

import httpx
from PIL import Image

from app.services import panel_audits as pa, sd_panel

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    sys.path.insert(0, os.path.dirname(__file__))
    from pg_scratch import SERVER, ScratchDB

A = "/uploads/tasks/2026/11/02/50121793606441.jpg"
B = "/uploads/tasks/2026/11/02/47191793606558.jpg"
C = "/uploads/tasks/2026/11/02/45661793606460.jpg"


def _section(rows: str, heads=("#", "Задача", "Результат", "Файл", "Подтвердил", "Статус")) -> str:
    th = "".join(f"<th>{h}</th>" for h in heads)
    return (f'<html><img src="/img/ic_info.svg"><table><tr><th>Цех</th><td>2811</td></tr></table>'
            f"<table><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table></html>")


def _item(item: int, *paths: str) -> str:
    files = "".join(f'<a href="{p}" data-toggle="lightbox"><img src="{p}" width="200"></a>' for p in paths) or "-"
    return f'<tr data-id="{item}" id="item-{item}"><td>1</td><td>Савол</td><td>Ок</td><td>{files}</td></tr>'


def _jpeg(side: int) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (side, side), (200, 120, 40)).save(buf, "JPEG")
    return buf.getvalue()


def _panel(pages: dict, files: dict | None = None):
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/login":
            if req.method == "GET":
                return httpx.Response(200, text='<input name="_csrf-backend" value="t">')
            return httpx.Response(302, headers={"location": "/"})
        if req.url.path == "/task-scheduler/view":
            page = pages.get(req.url.params.get("id"))
            return httpx.Response(200, text=page) if page else httpx.Response(404)
        if files and req.url.path in files:
            return httpx.Response(200, content=files[req.url.path], headers={"content-type": "image/jpeg"})
        return httpx.Response(404, text="nope")

    real = httpx.Client
    return mock.patch.object(sd_panel.httpx, "Client",
                             lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


class SectionPageTest(unittest.TestCase):
    def test_photos_per_question_in_page_order(self):
        page = _section(_item(19876803, C) + _item(19876804, A, B) + _item(19876805))
        self.assertEqual(sd_panel.parse_section(page), {19876803: [C], 19876804: [A, B]})

    def test_a_page_without_the_file_column_is_refused(self):
        with self.assertRaises(sd_panel.PanelError) as cm:
            sd_panel.parse_section(_section(_item(1, A), heads=("#", "Задача")))
        self.assertEqual(cm.exception.code, "shape")

    def test_only_panel_upload_paths_pass(self):
        self.assertTrue(sd_panel.PHOTO_PATH.fullmatch(A))
        for bad in ("/uploads/tasks/2026/11/02/a.php", "/uploads/../etc/passwd", "https://x.uz" + A,
                    "/img/ic_info.svg", "/uploads/tasks/2026/11/a.jpg"):
            self.assertIsNone(sd_panel.PHOTO_PATH.fullmatch(bad), bad)

    def test_a_photo_is_scaled_for_a_tile_and_whole_without(self):
        with _panel({}, files={A: _jpeg(800)}):
            small, mime = pa.photo_bytes(A, pa.PHOTO_SIDE)
            whole, _ = pa.photo_bytes(A, None)
            with self.assertRaises(sd_panel.PanelError):
                pa.photo_bytes(B, None)
        self.assertEqual(mime, "image/jpeg")
        self.assertEqual(Image.open(BytesIO(small)).size, (pa.PHOTO_SIDE, pa.PHOTO_SIDE))
        self.assertEqual(Image.open(BytesIO(whole)).size, (800, 800))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class PhotoReadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def test_read_once_kept_by_question_and_filtered(self):
        from app.models import PanelAuditRow, PanelAuditSection

        db = self.pg.Session()
        sd_panel.save(db, user="u", password="pw")
        today = datetime.now(pa.TZ).date()
        m = pa.first_of(today)
        rows = [(100, 1, today), (100, 2, today), (200, 3, today - timedelta(days=10)), (None, 4, today)]
        db.add_all([PanelAuditRow(kind="tech", month=m, day=d, task_id=t, question_id=q, question=f"q{q}")
                    for t, q, d in rows])
        db.commit()

        pages = {"100": _section(_item(1, A, B) + _item(2) + _item(9, C))}   # 200: gone (404)
        with _panel(pages):
            got = pa.read_photos(db)
        self.assertEqual((got["read"], got["photos"], got["failed"]), (2, 3, 0))
        self.assertEqual(pa.photo_due(db, datetime.now(pa.TZ)), [])

        # A young section is read again once PHOTO_AGAIN has passed; an old one never.
        db.query(PanelAuditSection).update({PanelAuditSection.read_at: datetime.now(pa.TZ) - timedelta(hours=3)})
        db.commit()
        self.assertEqual([t for t, _ in pa.photo_due(db, datetime.now(pa.TZ))], [100])

        d1 = today - timedelta(days=30)
        by_q = {r["question"]: r["photos"] for r in pa.rows(db, "tech", d1, today, {})["rows"]}
        self.assertEqual(by_q, {"q1": [A, B], "q2": [], "q3": [], "q4": []})
        yes = pa.rows(db, "tech", d1, today, {"photo": "yes"})["rows"]
        no = pa.rows(db, "tech", d1, today, {"photo": "no"})["rows"]
        self.assertEqual([r["question"] for r in yes], ["q1"])
        self.assertEqual(sorted(r["question"] for r in no), ["q2", "q3"])   # q4's section was never read

        self.assertTrue(pa.photo_known(db, A))
        self.assertTrue(pa.photo_known(db, C))
        self.assertFalse(pa.photo_known(db, "/uploads/tasks/2026/11/02/1.jpg"))
        db.close()


if __name__ == "__main__":
    unittest.main()
