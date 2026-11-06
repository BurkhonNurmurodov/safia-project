"""A cap on JSON and form bodies (2026-11-06, the audit).

FastAPI reads and parses a request's whole body BEFORE it runs any dependency,
so the Telegram-origin guard and every login check come after it. nginx lets a
body of 512 MB through (the uploads need that), and the server's own address is
reachable without going through the proxy: one `POST /api/auth/web/login` with a
400 MB JSON body is read into memory and parsed on the one worker, and a few at
once finish a box that already swaps.

Uploads (multipart) are streamed to disk and keep nginx's limit. JSON and
urlencoded bodies are parsed whole in memory, and nothing the platform sends is
anywhere near this — the largest are the grid exports, bounded by
`grid_export.MAX_CELLS`. So those two content types get a cap of their own,
counted on the declared length AND on the bytes that actually arrive (a chunked
body declares nothing).

Pure ASGI, like the other middlewares here: a ContextVar and the threadpool
must stay on the same side of it.
"""
from __future__ import annotations

import json

MAX_JSON_BODY = 64 * 1024 * 1024

_CAPPED = (b"application/json", b"application/x-www-form-urlencoded")


class RequestTooLarge(Exception):
    pass


async def _refuse(send) -> None:
    body = json.dumps({"detail": "Request body too large"}).encode()
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                            (b"connection", b"close")]})
    await send({"type": "http.response.body", "body": body})


class JsonBodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or ())
        if not headers.get(b"content-type", b"").lower().startswith(_CAPPED):
            return await self.app(scope, receive, send)
        try:
            declared = int(headers.get(b"content-length") or 0)
        except ValueError:
            declared = 0
        if declared > MAX_JSON_BODY:
            return await _refuse(send)

        seen = 0
        started = False

        async def counted_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body") or b"")
                if seen > MAX_JSON_BODY:
                    raise RequestTooLarge()
            return msg

        async def tracked_send(msg):
            nonlocal started
            if msg["type"] == "http.response.start":
                started = True
            await send(msg)

        try:
            await self.app(scope, counted_receive, tracked_send)
        except RequestTooLarge:
            if not started:
                await _refuse(send)
