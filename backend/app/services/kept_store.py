"""Kept answers that OUTLIVE the process (2026-11-13) — the store a
`KeptAnswers` may be given (`services/kept_answer.py`).

**Why.** A kept answer lived in the worker's memory, and a backend deploy swaps
the worker: 140 of them in the ten days before this was written, 5–24 a day.
«Hisobotlar» builds a month in 3.3–4.9 s (measured on production, 13 Nov), so
the first reader after every deploy waited that long per month — while the
very same figures had been built minutes earlier by the worker just retired.

**What.** One row of `kept_answers` per (store name, key): the answer as typed
JSON and when its build STARTED. `KeptAnswers` writes it after every build it
keeps and reads it when asked for a key it does not hold; what it does with an
answer another process built is its own rule (served at once, rebuilt behind).

**Never a source of truth, never in the way.** Every row can be deleted and is
simply built again. Every fault here — the database away, an answer this codec
cannot spell, a row it cannot read back — is a MISS or an unsaved answer,
counted and logged, never an exception in a request: the page then behaves as
it did before the store existed.

**Sessions of its own.** A build must stay on a session that has written
nothing (`labor_kept` keeps nothing from a session that wrote;
`idle_source.reuse_weights` is for read-only sessions), so nothing here touches
the caller's session: each call opens one, bounded to `STMT_MS` per statement,
and closes it.

**The codec is exact, and checked.** JSON alone turns a unit-id key into a
string and a tuple into a list — and a report whose per-unit figures are keyed
by strings prints «—» in every row without failing anywhere. `encode` tags what
JSON cannot spell (a dict with a non-string key, a tuple, a date, a Decimal, a
set), `decode` puts it back, and `save` reads its own text back and compares it
with the answer before writing: an answer that does not come back equal is not
stored. A type the codec does not know is refused the same way.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import weakref
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Hashable, Optional

from sqlalchemy.exc import IntegrityError

log = logging.getLogger(__name__)

# A store statement — a lock wait included — is cut after this long (Postgres,
# through `database._request_limits`): the read sits on a page's open path.
STMT_MS = 5_000

_TAG = "~#"


def _enc(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, dict):
        if all(isinstance(k, str) and not k.startswith(_TAG) for k in v):
            return {k: _enc(x) for k, x in v.items()}
        return {_TAG + "d": [[_enc(k), _enc(x)] for k, x in v.items()]}
    if isinstance(v, list):
        return [_enc(x) for x in v]
    if isinstance(v, tuple):
        return {_TAG + "t": [_enc(x) for x in v]}
    if isinstance(v, datetime):          # before `date`: a datetime is one
        return {_TAG + "dt": v.isoformat()}
    if isinstance(v, date):
        return {_TAG + "date": v.isoformat()}
    if isinstance(v, Decimal):
        return {_TAG + "dec": str(v)}
    if isinstance(v, frozenset):
        return {_TAG + "fset": [_enc(x) for x in v]}
    if isinstance(v, set):
        return {_TAG + "set": [_enc(x) for x in v]}
    raise TypeError(f"a {type(v).__name__} cannot be kept")


def _dec(v: Any) -> Any:
    if isinstance(v, list):
        return [_dec(x) for x in v]
    if isinstance(v, dict):
        if len(v) == 1:
            (k, x), = v.items()
            if k.startswith(_TAG):
                kind = k[len(_TAG):]
                if kind == "d":
                    return {_dec(a): _dec(b) for a, b in x}
                if kind == "t":
                    return tuple(_dec(i) for i in x)
                if kind == "dt":
                    return datetime.fromisoformat(x)
                if kind == "date":
                    return date.fromisoformat(x)
                if kind == "dec":
                    return Decimal(x)
                if kind == "fset":
                    return frozenset(_dec(i) for i in x)
                if kind == "set":
                    return {_dec(i) for i in x}
                raise ValueError(f"unknown tag {k!r}")
        return {k: _dec(x) for k, x in v.items()}
    return v


def encode(value: Any) -> str:
    """`value` as text `decode` gives back exactly. Raises TypeError on a type
    it does not know — an ORM row, a custom class — rather than guess."""
    return json.dumps(_enc(value), ensure_ascii=False, separators=(",", ":"))


def decode(text: str) -> Any:
    return _dec(json.loads(text))


def _trouble(v: Any, path: str = "answer") -> Optional[str]:
    """WHERE an answer cannot be kept exactly — the first value of a type the
    codec does not know, or a NaN (never equal to itself) — for the fault's
    message: it is read off the page's payload, by somebody with no log."""
    if isinstance(v, float) and v != v:
        return f"{path} is NaN"
    if v is None or isinstance(v, (bool, int, float, str, datetime, date, Decimal)):
        return None
    if isinstance(v, dict):
        for k, x in v.items():
            found = _trouble(k, f"{path} key {k!r}") or _trouble(x, f"{path}[{k!r}]")
            if found:
                return found
        return None
    if isinstance(v, (list, tuple, set, frozenset)):
        for i, x in enumerate(v):
            found = _trouble(x, f"{path}[{i}]")
            if found:
                return found
        return None
    return f"{path} is a {type(v).__name__}"


def _aware(dt: datetime) -> datetime:
    """SQLite hands a timezone-aware column back naive; Postgres does not."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Every store built in this process — weakly — for `health()`.
_STORES: "weakref.WeakSet[DbStore]" = weakref.WeakSet()
_STORES_LOCK = threading.Lock()


def health() -> dict:
    """What the stores of this process did since it started — on a payload
    next to its `timings`, so «is the store working» is answered by the page
    itself and not guessed at."""
    with _STORES_LOCK:
        stores = sorted(_STORES, key=lambda s: s.name)
    return {s.name: s.counts() for s in stores}


class DbStore:
    """One `KeptAnswers` instance's rows of `kept_answers`.

    `max_age_days`: a row older than this is not read (and `prune` deletes
    it) — the bound on how old an answer the store hands over can be.
    `session_factory` is for tests; left out, `app.database.SessionLocal`."""

    def __init__(self, name: str, *, max_age_days: float = 45,
                 session_factory: Optional[Callable[[], Any]] = None):
        self.name = name
        self.max_age = timedelta(days=max_age_days)
        self._factory = session_factory
        self._lock = threading.Lock()
        self._n = {"saved": 0, "read": 0, "errors": 0}
        self._last_error = ""
        self._logged = -1e9
        with _STORES_LOCK:
            _STORES.add(self)

    # ── plumbing ────────────────────────────────────────────────────────────
    def _session(self):
        if self._factory is not None:
            return self._factory()
        from app.database import SessionLocal
        s = SessionLocal()
        s.info["stmt_ms"] = STMT_MS
        return s

    @staticmethod
    def _id(key: Hashable) -> str:
        return hashlib.sha256(repr(key).encode("utf-8")).hexdigest()

    def _count(self, what: str) -> None:
        with self._lock:
            self._n[what] += 1

    def _fault(self, where: str, exc: BaseException) -> None:
        """Counted always; logged with its trace at most once a minute — a
        database that is away must not write a trace per request."""
        with self._lock:
            self._n["errors"] += 1
            self._last_error = f"{where}: {type(exc).__name__}: {str(exc)[:160]}"
            quiet = time.monotonic() - self._logged < 60
            if not quiet:
                self._logged = time.monotonic()
        if not quiet:
            log.error("kept store %s: %s failed", self.name, where, exc_info=exc)

    def counts(self) -> dict:
        with self._lock:
            out: dict = dict(self._n)
            if self._last_error:
                out["last_error"] = self._last_error
        return out

    # ── the four things a KeptAnswers asks ──────────────────────────────────
    def load(self, key: Hashable) -> Optional[tuple[datetime, Any]]:
        """(when its build started, the answer) for `key`, or None — nothing
        stored, a row too old, or one that cannot be read back (deleted)."""
        from app.models import KeptAnswerRow
        try:
            with self._session() as s:
                row = s.get(KeptAnswerRow, (self.name, self._id(key)))
                if row is None:
                    return None
                built_at, text = _aware(row.built_at), row.value
        except Exception as exc:  # noqa: BLE001 — a miss, never a failed request
            self._fault("load", exc)
            return None
        if _utcnow() - built_at > self.max_age:
            return None
        try:
            value = decode(text)
        except Exception as exc:  # noqa: BLE001
            self._fault("decode", exc)
            self.delete(key)
            return None
        self._count("read")
        return built_at, value

    def save(self, key: Hashable, built_at: datetime, value: Any) -> bool:
        """Keep `value` for `key` unless a row from a LATER build is already
        there. False when it was not stored — the answer is then simply kept
        in memory alone, as every answer was before the store."""
        from app.models import KeptAnswerRow
        try:
            text = encode(value)
            if decode(text) != value:
                raise ValueError("the answer does not come back equal")
        except Exception as exc:  # noqa: BLE001
            where = _trouble(value)
            self._fault("encode", ValueError(where) if where else exc)
            return False
        kid = self._id(key)
        clash: Optional[BaseException] = None
        for _attempt in (1, 2):
            try:
                with self._session() as s:
                    row = s.get(KeptAnswerRow, (self.name, kid))
                    if row is None:
                        s.add(KeptAnswerRow(name=self.name, key=kid, label=repr(key)[:200],
                                            built_at=built_at, value=text))
                    elif _aware(row.built_at) <= built_at:
                        row.built_at = built_at
                        row.value = text
                    s.commit()
                self._count("saved")
                return True
            except IntegrityError as exc:
                # Another copy (the worker being retired) inserted the row
                # between the read and the write: read it and take the newer.
                clash = exc
            except Exception as exc:  # noqa: BLE001
                self._fault("save", exc)
                return False
        if clash is not None:
            self._fault("save", clash)
        return False

    def delete(self, key: Hashable) -> None:
        from app.models import KeptAnswerRow
        try:
            with self._session() as s:
                s.query(KeptAnswerRow).filter(
                    KeptAnswerRow.name == self.name,
                    KeptAnswerRow.key == self._id(key)).delete(synchronize_session=False)
                s.commit()
        except Exception as exc:  # noqa: BLE001
            self._fault("delete", exc)

    def clear(self) -> None:
        """Every row of this store — `KeptAnswers.forget`."""
        from app.models import KeptAnswerRow
        try:
            with self._session() as s:
                s.query(KeptAnswerRow).filter(
                    KeptAnswerRow.name == self.name).delete(synchronize_session=False)
                s.commit()
        except Exception as exc:  # noqa: BLE001
            self._fault("clear", exc)

    def prune(self) -> int:
        """Delete the rows too old to be read. Returns how many went."""
        from app.models import KeptAnswerRow
        try:
            with self._session() as s:
                n = s.query(KeptAnswerRow).filter(
                    KeptAnswerRow.name == self.name,
                    KeptAnswerRow.built_at < _utcnow() - self.max_age,
                ).delete(synchronize_session=False)
                s.commit()
                return int(n or 0)
        except Exception as exc:  # noqa: BLE001
            self._fault("prune", exc)
            return 0
