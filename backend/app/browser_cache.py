"""The ONE kind of /api answer a browser may keep (2026-11-13).

Every API answer leaves marked ``no-store`` (`main.NoStoreAPIMiddleware`): it
is one viewer's data, and a cache that replayed it to another did exactly that
on the old host. A profile photo is the exception this module names. Its URL
carries the photo's version (``?v=``), its bytes are the same for every
approved session, and its route asks for ``private, immutable`` — yet the
middleware overwrote that like everything else, so every avatar on every page
was downloaded again in every session: the twenty faces of «Brigadirlar
reytingi» were 637 KB each time the page was opened.

So a 200 from a path in ``PATHS`` that itself asks for ``private`` and
``immutable`` keeps its ``Cache-Control``. ``private`` still forbids every
shared cache; the LiteSpeed opt-out still rides along. It gets no ``Vary:
Authorization``: the token changes with every sign-in, and a picture that only
matched the token it was fetched with would be kept for nothing. Anything else
from such a path — a 404, a 401, an answer that did not ask — is ``no-store``
like the rest.

**A new path belongs in ``PATHS`` only if its answer is the same for everybody
who may read it AND its URL changes whenever the answer does.** The frontend
must then send the request with ``_browserKept`` (utils/api.js): an answer read
off the disk carries the headers of the day it was downloaded, and says
nothing about the server now.
"""
from __future__ import annotations

from typing import Optional

PATHS = ("/api/profiles/photo/",)

# What the no-store rule adds and a kept answer must not carry.
_STRIP = (b"pragma", b"expires", b"x-litespeed-cache-control")


def kept_headers(path: str, status, headers) -> Optional[list]:
    """The headers to send when this answer is one the browser may keep;
    None = it is not (the caller marks it ``no-store``)."""
    if status != 200 or not path.startswith(PATHS):
        return None
    asked = b", ".join(v.lower() for k, v in headers if k.lower() == b"cache-control")
    if b"private" not in asked or b"immutable" not in asked:
        return None
    return ([(k, v) for k, v in headers if k.lower() not in _STRIP]
            + [(b"x-litespeed-cache-control", b"no-cache")])
