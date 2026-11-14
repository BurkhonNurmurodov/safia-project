"""Answers a SESSION may reuse — the permission reads every guard repeats.

One ordinary request asked the same handful of questions many times over: the
page check alone ran 9 queries before the handler started (the active profile
twice, the profile-entry probe twice, the account's and the profile's grant and
deny rows separately), and every `has_cap` / `leaders_admin` inside the handler
asked them all again. Production counted 4.3M full reads of
`profile_permissions` and 4.15M of an EMPTY `user_capabilities` (2026-11-14
speed audit). Here each question is asked once per session.

Only plain immutable values are kept (tuples, frozensets, strings) — never ORM
objects or a dict a caller could mutate. The memo is dropped on every flush,
commit and rollback, is bypassed while the session holds unflushed changes (a
grant this request is writing is read back as written), and an answer older
than `MAX_AGE_S` is asked again, so a long-lived job session cannot hold one.
"""
from __future__ import annotations

from time import monotonic
from typing import Callable, Hashable, TypeVar

from sqlalchemy import event
from sqlalchemy.orm import Session

T = TypeVar("T")

_KEY = "session_memo"
MAX_AGE_S = 30.0


def get(db, key: Hashable, fn: Callable[[], T]) -> T:
    info = getattr(db, "info", None)
    if not isinstance(info, dict) or not isinstance(db, Session):
        return fn()
    if db.new or db.dirty or db.deleted:
        info.pop(_KEY, None)
        return fn()
    box = info.setdefault(_KEY, {})
    now = monotonic()
    hit = box.get(key)
    if hit is not None and now - hit[1] < MAX_AGE_S:
        return hit[0]
    val = fn()
    box[key] = (val, now)
    return val


def payload_key(payload) -> tuple:
    """A hashable stand-in for a JWT payload (every claim, compared by repr)."""
    return tuple(sorted((str(k), repr(v)) for k, v in (payload or {}).items()))


def _drop(session, *_a) -> None:
    session.info.pop(_KEY, None)


for _ev in ("after_flush", "after_commit", "after_rollback"):
    event.listen(Session, _ev, _drop)
