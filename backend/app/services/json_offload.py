"""A handler's answer is turned into JSON OFF the event loop (2026-10-08).

FastAPI serialises a value a handler returns in `fastapi.routing.serialize_response`,
and for a route with no `response_model` — every route on this platform — that is
`jsonable_encoder(value)`: a pure-Python walk over every key and value of the
answer, run on the EVENT LOOP even when the handler itself ran in the threadpool.
Production runs one uvicorn process, so while one big answer is being walked no
other request on the server moves. Measured on a register-sized answer (12,000
rows × 13 tasks, 30 MB of JSON): 4.7 s of walking, then 0.4 s of `json.dumps`.

`install()` swaps that one function for a twin that does the walk in the
threadpool instead, and only when the answer is big enough for a thread hop to be
worth it (`_trivial`). The result is byte for byte what FastAPI produced: the same
`jsonable_encoder`, the same `JSONResponse` rendering it afterwards. Routes WITH a
response model keep FastAPI's own path (pydantic-core, already fast).

FastAPI looks `serialize_response` up as a module global on every request, so
replacing the module attribute is all it takes. Installed once from app/main.py;
`/api/leaders` and `/api/leaders/standing` already hand back a pre-rendered
`Response` (`routers/leaders._json_response`) and never reach it.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SCALARS = (str, int, float, bool, type(None))
_INLINE_MAX = 32          # a flat container this small is encoded where it stands

_installed = False


def _trivial(obj) -> bool:
    """Cheap enough to walk on the loop: a scalar, or a small container of
    scalars (`{"ok": True}`, a short id list). Anything nested or longer pays a
    thread hop, which costs far less than the walk it moves."""
    if isinstance(obj, _SCALARS):
        return True
    if isinstance(obj, dict):
        return len(obj) <= _INLINE_MAX and all(isinstance(v, _SCALARS) for v in obj.values())
    if isinstance(obj, (list, tuple)):
        return len(obj) <= _INLINE_MAX and all(isinstance(v, _SCALARS) for v in obj)
    return False


def install() -> None:
    global _installed
    if _installed:
        return
    try:
        import fastapi.routing as routing
        from fastapi.encoders import jsonable_encoder
        from starlette.concurrency import run_in_threadpool
    except Exception:  # noqa: BLE001 — never fail the boot over an optimisation
        logger.exception("json_offload: FastAPI internals not found — left as it was")
        return

    original = routing.serialize_response

    async def serialize_response(*, field=None, response_content, **kwargs):
        if field is None and not _trivial(response_content):
            return await run_in_threadpool(jsonable_encoder, response_content)
        return await original(field=field, response_content=response_content, **kwargs)

    serialize_response.__wrapped__ = original   # type: ignore[attr-defined]
    routing.serialize_response = serialize_response
    _installed = True
