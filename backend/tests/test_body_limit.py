"""The JSON / form body cap (`app/body_limit`, 2026-11-06). No database.

A JSON body is read and parsed whole before any login check, so it is capped —
on the declared length AND on the bytes that arrive (a chunked body declares
nothing); uploads (multipart) keep nginx's limit.

    ./venv/bin/python -m unittest tests.test_body_limit
"""
from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from app import body_limit


def _scope(ctype: bytes, length: int | None = None) -> dict:
    headers = [(b"content-type", ctype)]
    if length is not None:
        headers.append((b"content-length", str(length).encode()))
    return {"type": "http", "method": "POST", "path": "/x", "headers": headers}


def _run(app, scope: dict, chunks: list[bytes]) -> list[dict]:
    queue = list(chunks)
    sent: list[dict] = []

    async def receive():
        if queue:
            body = queue.pop(0)
            return {"type": "http.request", "body": body, "more_body": bool(queue)}
        return {"type": "http.disconnect"}

    async def send(msg):
        sent.append(msg)

    asyncio.run(body_limit.JsonBodyLimitMiddleware(app)(scope, receive, send))
    return sent


class _ReadsBody:
    """An app that reads its whole body and echoes how much it got."""
    def __init__(self):
        self.called = False

    async def __call__(self, scope, receive, send):
        self.called = True
        got = b""
        while True:
            m = await receive()
            got += m.get("body", b"")
            if not m.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": str(len(got)).encode()})


def _status(sent: list[dict]) -> int:
    return next(m["status"] for m in sent if m["type"] == "http.response.start")


class JsonBodyLimit(unittest.TestCase):
    def setUp(self):
        patch = mock.patch.object(body_limit, "MAX_JSON_BODY", 10)
        patch.start()
        self.addCleanup(patch.stop)

    def test_a_declared_length_over_the_cap_is_refused_without_reading_it(self):
        app = _ReadsBody()
        sent = _run(app, _scope(b"application/json", 11), [b"x" * 11])
        self.assertEqual(_status(sent), 413)
        self.assertFalse(app.called)

    def test_a_chunked_body_over_the_cap_is_refused_as_it_arrives(self):
        app = _ReadsBody()
        sent = _run(app, _scope(b"application/json"), [b"x" * 6, b"x" * 6])
        self.assertEqual(_status(sent), 413)

    def test_a_form_body_is_capped_too(self):
        sent = _run(_ReadsBody(), _scope(b"application/x-www-form-urlencoded", 50), [b"x" * 50])
        self.assertEqual(_status(sent), 413)

    def test_a_body_under_the_cap_goes_through_untouched(self):
        sent = _run(_ReadsBody(), _scope(b"application/json; charset=utf-8", 5), [b"x" * 5])
        self.assertEqual(_status(sent), 200)
        self.assertEqual(sent[-1]["body"], b"5")

    def test_an_upload_keeps_its_own_limit(self):
        sent = _run(_ReadsBody(), _scope(b"multipart/form-data; boundary=x", 1000), [b"x" * 1000])
        self.assertEqual(_status(sent), 200)
        self.assertEqual(sent[-1]["body"], b"1000")


if __name__ == "__main__":
    unittest.main()
