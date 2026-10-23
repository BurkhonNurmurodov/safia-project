"""Startup DDL that never stalls the copy that is serving (2026-10-23).

During a worker swap the new worker runs every startup migration while the old
one serves. Almost all of them have nothing to do — the column, the index, the
table already exist — yet Postgres takes the lock FIRST and looks AFTER:
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` waits for an ACCESS EXCLUSIVE lock and
`CREATE INDEX IF NOT EXISTS` for a SHARE lock before either notices there is
nothing to add. One open transaction on that table (a slow request, a bot
update waiting on Telegram) makes the ALTER wait, and every query on the table
then queues behind the ALTER: the serving worker's pool fills, its requests
time out, and the new worker never gets ready. That is what the deploys of
23 Oct 2026 did, four times, at the 17:00 shift change.

So, for every SQL statement a startup step runs (`boot_steps`, both phases):

* **A statement whose target is already as asked is not sent.** The catalogue
  is read first (pg_attribute, pg_constraint, `to_regclass` — no table lock)
  and the statement becomes `SELECT 1`. Covered: ADD COLUMN IF NOT EXISTS,
  DROP COLUMN IF EXISTS, ALTER COLUMN … SET / DROP NOT NULL, DROP CONSTRAINT IF
  EXISTS (any comma-separated mix of these in one ALTER TABLE), CREATE [UNIQUE]
  INDEX IF NOT EXISTS, DROP INDEX / DROP TABLE IF EXISTS, CREATE TABLE IF NOT
  EXISTS.
* **Any other DDL waits at most `LOCK_TIMEOUT` for its lock**, set just for
  that statement and put back after it, so the serving worker's queries queue
  behind it for seconds, never minutes. In the boot phase every OTHER
  statement's lock wait is bounded too (`SET LOCAL` as its transaction
  begins): a boot UPDATE waiting on a row the serving worker holds wedged it.
* **A boot step whose DDL timed out is run again** (`TRIES`, a short pause
  between), whether the step raised or swallowed the error — a swallowed
  timeout would otherwise leave a column missing. Every step is safe to run
  twice: every boot already runs every step. Still busy after the last try →
  the boot fails, the supervisor keeps the old worker and the deploy rolls
  back. A deferred step is not retried (it may send a DM); a timeout there is
  recorded as its failure.

Nothing here can fail a statement it did not mean to touch: any surprise
(an unparsable statement, a transaction already aborted, a catalogue read that
errors) hands the statement on unchanged. Only statements on the thread a step
is running on are seen; requests on other threads are never touched.
"""
from __future__ import annotations

import re
import threading
import time
from typing import Callable, Optional

LOCK_TIMEOUT = "5s"
TRIES = 6

_state = threading.local()
_installed = False
_engine = None
# Across the whole boot, for the «ready» line: statements not sent because
# their target was already in place, DDL that ran under the timeout, and lock
# timeouts met.
totals = {"skipped": 0, "ran": 0, "busy": 0}
_tlock = threading.Lock()


def _count(key: str) -> None:
    with _tlock:
        totals[key] += 1

# Postgres codes: lock_not_available (lock_timeout) · deadlock_detected.
_BUSY_CODES = ("55P03", "40P01")

_DDL_HEAD = re.compile(
    r"^\s*(ALTER|CREATE|DROP|COMMENT|TRUNCATE|REINDEX|CLUSTER|LOCK)\b", re.I)
_IDENT = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
_QNAME = rf"({_IDENT}(?:\.{_IDENT})?)"


def _armed() -> bool:
    return bool(getattr(_state, "armed", False))


def _norm(stmt: str) -> str:
    s = re.sub(r"\s+", " ", stmt).strip()
    return s[:-1].rstrip() if s.endswith(";") else s


def _ident(name: str) -> str:
    """A name as Postgres stores it: quotes kept as written, otherwise folded."""
    return name[1:-1] if name.startswith('"') and name.endswith('"') else name.lower()


def _regname(qname: str) -> str:
    """`schema.name` / `name` in the text form `to_regclass` reads."""
    return qname if '"' in qname else qname.lower()


def _split(clauses: str) -> list[str]:
    """Split on top-level commas (not inside parentheses or quotes)."""
    out, depth, quote, cur = [], 0, None, []
    for ch in clauses:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in ("'", '"'):
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            out.append("".join(cur).strip())
            cur = []
            continue
        cur.append(ch)
    if cur:
        out.append("".join(cur).strip())
    return out


class _Cat:
    """Catalogue reads on the statement's own connection (raw DBAPI cursor, so
    no listener sees them). They take no lock on any user table."""

    def __init__(self, dbapi_conn):
        self.conn = dbapi_conn
        self._cols: dict[str, Optional[dict]] = {}

    def _one(self, sql: str, args: tuple):
        cur = self.conn.cursor()
        try:
            cur.execute(sql, args)
            return cur.fetchall()
        finally:
            cur.close()

    def exists(self, qname: str) -> bool:
        return bool(self._one("SELECT to_regclass(%s) IS NOT NULL", (_regname(qname),))[0][0])

    def columns(self, qname: str) -> Optional[dict]:
        """column → NOT NULL?; None when the table does not exist."""
        if qname not in self._cols:
            if not self.exists(qname):
                self._cols[qname] = None
            else:
                rows = self._one(
                    "SELECT attname, attnotnull FROM pg_attribute "
                    "WHERE attrelid = to_regclass(%s) AND attnum > 0 AND NOT attisdropped",
                    (_regname(qname),))
                self._cols[qname] = {r[0]: bool(r[1]) for r in rows}
        return self._cols[qname]

    def default(self, qname: str, col: str) -> Optional[str]:
        """The column's default as Postgres prints it, None when it has none."""
        rows = self._one(
            "SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attribute a "
            "JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum "
            "WHERE a.attrelid = to_regclass(%s) AND a.attname = %s",
            (_regname(qname), col))
        return rows[0][0] if rows else None

    def constraint(self, qname: str, name: str) -> bool:
        return bool(self._one(
            "SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(%s) AND conname = %s",
            (_regname(qname), name)))


_RX_ALTER = re.compile(rf"^ALTER TABLE (IF EXISTS )?(?:ONLY )?{_QNAME} (.+)$", re.I)
_RX_ADD = re.compile(rf"^ADD (?:COLUMN )?IF NOT EXISTS ({_IDENT})(?= |$)", re.I)
_RX_DROPCOL = re.compile(rf"^DROP (?:COLUMN )?IF EXISTS ({_IDENT})(?: (?:CASCADE|RESTRICT))?$", re.I)
_RX_NOTNULL = re.compile(rf"^ALTER (?:COLUMN )?({_IDENT}) (SET|DROP) NOT NULL$", re.I)
_RX_DEFAULT = re.compile(rf"^ALTER (?:COLUMN )?({_IDENT}) (?:SET DEFAULT (.+)|DROP DEFAULT)$", re.I)
_RX_DROPCON = re.compile(rf"^DROP CONSTRAINT IF EXISTS ({_IDENT})(?: (?:CASCADE|RESTRICT))?$", re.I)
_RX_CREATE_IX = re.compile(
    rf"^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?IF NOT EXISTS {_QNAME} ON ", re.I)
_RX_DROP_REL = re.compile(
    rf"^DROP (INDEX|TABLE) (?:CONCURRENTLY )?IF EXISTS (.+?)(?: (?:CASCADE|RESTRICT))?$", re.I)
_RX_CREATE_TABLE = re.compile(rf"^CREATE TABLE IF NOT EXISTS {_QNAME}[ (]", re.I)


def _expr(e: str) -> str:
    """A default expression in one spelling: casts dropped, case folded
    outside quoted literals (`'supervisor'::character varying` = `'supervisor'`)."""
    parts = re.split(r"('(?:[^']|'')*')", e.strip())
    out = []
    for i, p in enumerate(parts):
        if i % 2:
            out.append(p)
        else:
            p = re.sub(r"::\s*[a-z_][a-z0-9_ ]*(\(\s*\d+(\s*,\s*\d+)?\s*\))?(\[\])?",
                       " ", p.lower())
            out.append(re.sub(r"\s+", " ", p).strip())
    e = "".join(out).strip()
    while e.startswith("(") and e.endswith(")") and e.count("(") == 1:
        e = e[1:-1].strip()
    return e


def _satisfied(stmt: str, cat: _Cat) -> bool:
    """True when running `stmt` would change nothing."""
    m = _RX_CREATE_IX.match(stmt)
    if m:
        return cat.exists(m.group(1))
    m = _RX_CREATE_TABLE.match(stmt)
    if m:
        return cat.exists(m.group(1))
    m = _RX_DROP_REL.match(stmt)
    if m:
        names = [n.strip() for n in _split(m.group(2))]
        if not all(re.fullmatch(_QNAME, n) for n in names):
            return False
        return not any(cat.exists(n) for n in names)
    m = _RX_ALTER.match(stmt)
    if not m:
        return False
    if_exists, table, rest = bool(m.group(1)), m.group(2), m.group(3)
    cols = cat.columns(table)
    if cols is None:
        return if_exists  # a missing table: a no-op only under IF EXISTS
    for clause in _split(rest):
        a = _RX_ADD.match(clause)
        if a:
            if _ident(a.group(1)) not in cols:
                return False
            continue
        d = _RX_DROPCOL.match(clause)
        if d:
            if _ident(d.group(1)) in cols:
                return False
            continue
        n = _RX_NOTNULL.match(clause)
        if n:
            col = _ident(n.group(1))
            if col not in cols or cols[col] != (n.group(2).upper() == "SET"):
                return False
            continue
        f = _RX_DEFAULT.match(clause)
        if f:
            col = _ident(f.group(1))
            if col not in cols:
                return False
            have = cat.default(table, col)
            want = f.group(2)
            if want is None:
                if have is not None:
                    return False
            elif have is None or _expr(have) != _expr(want):
                return False
            continue
        c = _RX_DROPCON.match(clause)
        if c:
            if cat.constraint(table, _ident(c.group(1))):
                return False
            continue
        return False  # a clause this module does not read: run it
    return True


def _empty_params(parameters):
    if isinstance(parameters, dict):
        return {}
    if isinstance(parameters, (list, tuple)):
        return ()
    return parameters


def _before(conn, cursor, statement, parameters, context, executemany):
    if not _armed() or executemany or not isinstance(statement, str):
        return statement, parameters
    if not _DDL_HEAD.match(statement):
        # In the boot phase EVERY statement's lock wait is bounded, DML too:
        # an UPDATE waiting on a row the serving worker holds would keep this
        # worker from ever getting ready, and anything of the serving worker
        # that needs the rows this step already changed queues behind it until
        # its pool is full. Set once per transaction, as it begins.
        if getattr(_state, "all_dml", False):
            try:
                dbapi = cursor.connection
                if not dbapi.autocommit and dbapi.get_transaction_status() == 0:
                    cur = dbapi.cursor()
                    try:
                        cur.execute("SET LOCAL lock_timeout = %s", (LOCK_TIMEOUT,))
                    finally:
                        cur.close()
            except Exception:  # noqa: BLE001
                pass
        return statement, parameters
    try:
        dbapi = cursor.connection
        # 3 = psycopg2's TRANSACTION_STATUS_INERROR: the statement fails
        # anyway, exactly as it always did.
        if dbapi.get_transaction_status() == 3:
            return statement, parameters
        stmt = _norm(statement)
        if _satisfied(stmt, _Cat(dbapi)):
            _count("skipped")
            return "SELECT 1", _empty_params(parameters)
        # Real work: wait at most LOCK_TIMEOUT for the lock, then put the
        # setting back exactly as it was (a session-level SET a step made
        # earlier on this connection included).
        cur = dbapi.cursor()
        try:
            cur.execute("SHOW lock_timeout")
            prev = cur.fetchone()[0]
            local = not dbapi.autocommit
            cur.execute(("SET LOCAL" if local else "SET") + " lock_timeout = %s", (LOCK_TIMEOUT,))
        finally:
            cur.close()
        _state.restore = (dbapi, prev, local)
        _count("ran")
        print(f"[startup] DDL (lock wait ≤ {LOCK_TIMEOUT}): {stmt[:160]}", flush=True)
    except Exception:  # noqa: BLE001 — never fail a statement over the guard
        _state.restore = None
    return statement, parameters


def _put_back(aborted: bool = False) -> None:
    r = getattr(_state, "restore", None)
    _state.restore = None
    if not r:
        return
    dbapi, prev, local = r
    if local and aborted:
        return  # the failed transaction takes its SET LOCAL with it
    try:
        cur = dbapi.cursor()
        try:
            cur.execute(("SET LOCAL" if local else "SET") + " lock_timeout = %s", (prev,))
        finally:
            cur.close()
    except Exception:  # noqa: BLE001
        pass


def _after(conn, cursor, statement, parameters, context, executemany):
    if _armed():
        _put_back()


def _on_error(exception_context):
    if not _armed():
        return
    _put_back(aborted=True)
    orig = getattr(exception_context, "original_exception", None)
    code = getattr(orig, "pgcode", None)
    if code in _BUSY_CODES:
        _state.busy = (getattr(_state, "busy", 0) or 0) + 1
        _state.busy_stmt = _norm(str(getattr(exception_context, "statement", "") or ""))[:140]
        _count("busy")


def install(engine) -> None:
    """Hook the engine once (Postgres only)."""
    global _installed, _engine
    if _installed or engine.dialect.name != "postgresql":
        return
    _engine = engine
    from sqlalchemy import event
    event.listen(engine, "before_cursor_execute", _before, retval=True)
    event.listen(engine, "after_cursor_execute", _after)
    event.listen(engine, "handle_error", _on_error)
    _installed = True


def _arm(all_dml: bool = False) -> None:
    _state.armed = True
    _state.all_dml = all_dml
    _state.busy = 0
    _state.restore = None


def _disarm() -> int:
    _state.armed = False
    # A restore still pending here never saw its statement end. A SET LOCAL
    # ends with its transaction anyway (and sending one now could open a
    # transaction on a connection already back in the pool); a session-level
    # SET must not stay on a pooled connection.
    r = getattr(_state, "restore", None)
    if r and r[2]:
        _state.restore = None
    _put_back()
    return getattr(_state, "busy", 0) or 0


def holders() -> list[str]:
    """Who could be holding the lock: every other session of this database in
    a transaction older than the lock wait, oldest first — what it is doing
    now and the last thing it ran. One line each, for the journal."""
    if _engine is None:
        return []
    try:
        raw = _engine.raw_connection()
        try:
            cur = raw.cursor()
            cur.execute(
                "SELECT pid, coalesce(application_name, ''), state, "
                "extract(epoch FROM now() - xact_start)::int, "
                "coalesce(wait_event_type || ':' || wait_event, ''), "
                "left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 140) "
                "FROM pg_stat_activity WHERE datname = current_database() "
                "AND pid <> pg_backend_pid() AND xact_start < now() - interval '4 seconds' "
                "ORDER BY xact_start LIMIT 8")
            rows = cur.fetchall()
            raw.rollback()
        finally:
            raw.close()
    except Exception as exc:  # noqa: BLE001 — a report, never a reason to fail
        return [f"(could not read pg_stat_activity: {exc})"]
    return [f"pid {r[0]} {r[2]} {r[3]} s in transaction {r[4]} {r[1]} · {r[5]}".strip()
            for r in rows] or ["(no other transaction older than 4 s)"]


class Busy(RuntimeError):
    """A startup step's DDL found its tables busy on every try."""


def guarded(fn: Callable, args: tuple, kwargs: dict, name: str, retry: bool):
    """Run one startup step under the guard. `retry` (the boot phase): a step
    whose DDL timed out on a lock is run again; on the last try it raises
    `Busy`. Without `retry` (the deferred phase) a timeout raises `Busy` once
    the step is done, so the step is recorded as failed."""
    if not _installed:
        return fn(*args, **kwargs)
    tries = TRIES if retry else 1
    for attempt in range(1, tries + 1):
        _arm(all_dml=retry)
        err: Optional[BaseException] = None
        result = None
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — re-raised below
            err = exc
        finally:
            busy = _disarm()
        if not busy:
            if err is not None:
                raise err
            return result
        stmt = getattr(_state, "busy_stmt", "")
        if attempt < tries:
            wait = min(2 * attempt, 6)
            print(f"[startup] {name}: a table was busy (lock wait > {LOCK_TIMEOUT}) on "
                  f"«{stmt}», try {attempt}/{tries} — again in {wait} s", flush=True)
            if attempt == 1:
                for line in holders():
                    print(f"[startup]   holder: {line}", flush=True)
            time.sleep(wait)
            continue
        who = holders()
        for line in who:
            print(f"[startup]   holder: {line}", flush=True)
        raise Busy(f"{name}: its tables stayed busy on {tries} tries — «{stmt}» — "
                   f"the serving worker keeps running. Holders: " + " | ".join(who)) from err
