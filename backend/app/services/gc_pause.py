"""The cyclic garbage collector, paused around ONE big build.

Born of the 19 Oct 2026 «Server was slow» DM: a 3.4 s freeze of the whole
server while the /leaders register was rebuilt on its background thread —
«GC 1.2 s (longest 0.2 s)» of it the collector. A build allocates a few hundred
thousand dicts and lists that live for a second or two; every 700 of them the
collector runs, and the ones that survive two passes are promoted until a FULL
collection walks the whole heap — holding the GIL, and so every request and the
event loop, from its first object to its last. None of those objects is ever
in a reference cycle (they are freed by reference counting when the build
returns), so the collector finds nothing and costs everything: measured on a
register-sized stand-in, the build ran three times faster with it paused.

`paused()` is COUNTED: overlapping builds on several threads share one pause,
and the collector is switched back on when the last of them ends — never
earlier, never twice. Only for a build that ENDS (a few seconds): the
collector is process-wide, and a pause that never ended would let cyclic
garbage pile up for good. Nothing is collected explicitly at the end — that
would be the very hold this exists to avoid; the next automatic pass takes
whatever the build left behind.
"""
from __future__ import annotations

import gc
import threading
from contextlib import contextmanager

_lock = threading.Lock()
_depth = 0
_was_on = True


@contextmanager
def paused():
    global _depth, _was_on
    with _lock:
        if _depth == 0:
            _was_on = gc.isenabled()
            gc.disable()
        _depth += 1
    try:
        yield
    finally:
        with _lock:
            _depth -= 1
            if _depth == 0 and _was_on:
                gc.enable()
