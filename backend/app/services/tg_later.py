"""Telegram work a request must not wait for (2026-10-07).

The second «Server was slow» DM named two buttons that were slow on their own,
with nothing else running: a bulk approval of live-day documents (12 s) and a
live day's close (17.6 s). Both commit their decision in milliseconds and then
TALK TO TELEGRAM before answering — a DM to every admin, shift manager and
supervisor concerned, one HTTPS round trip after another, and every approval
card edited in every chat it was sent to. The person who pressed the button
waited for all of it.

`run` hands such work to ONE background thread instead. One thread, so the
messages go out in the order the request queued them (a decision's notice
before its card is edited). The request's context is copied in, so Ghost Mode
(`notify_ctx`) still holds. A job that fails is logged and never reaches the
request — it has already answered. Jobs left in the queue at shutdown are
still run: `ThreadPoolExecutor` drains its queue before the interpreter exits.

What belongs here is network I/O whose RESULT the request does not need. A
call whose answer the request uses (the card fan-out that returns who was
carded, so they are spared a duplicate DM) stays inline.
"""
from __future__ import annotations

import contextvars
import logging
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)

_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tg-later")


def run(fn, *args, **kwargs) -> None:
    """Run `fn(*args, **kwargs)` after the current request, in queue order."""
    ctx = contextvars.copy_context()
    name = getattr(fn, "__qualname__", repr(fn))

    def job():
        try:
            ctx.run(fn, *args, **kwargs)
        except Exception:  # noqa: BLE001 — the request has already answered
            log.exception("tg_later: %s failed", name)

    try:
        _POOL.submit(job)
    except RuntimeError:     # interpreter shutting down: no queue left, do it now
        job()
