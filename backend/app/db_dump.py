"""Pure-Python ``pg_dump`` substitute, for moving the database between hosts.

ahost gives the app no shell access to Postgres — no ``pg_dump``, no ``psql`` —
so a server move has to be driven from inside the running app. This module
reads the LIVE catalog (never ``Base.metadata``: anything a hand-run migration
added is still captured, and anything the models declare but the server never
got is correctly absent) and writes a plain ``.sql`` script that recreates the
whole ``public`` schema plus its data on an empty database.

Restore order is deliberately schema → data → constraints. Creating every
primary/foreign key AFTER the rows land means table order never matters, so
there is no topological sort and no self-referencing-FK special case; a table
that points at itself restores like any other.

Values are rendered by Postgres itself (``quote_nullable(col::text)``) rather
than by Python. The literal Postgres prints always coerces back to the column
type on INSERT, so JSONB, arrays, bytea, enums and timestamps round-trip
without a per-type formatter here.

Needs Postgres 12+ on the source (``pg_attribute.attgenerated``); the emitted
script itself restores onto anything 10+.
"""

from __future__ import annotations

import gzip
import logging
import os
import re
import time
from datetime import datetime, timezone

from app.database import engine

log = logging.getLogger(__name__)

# The restore path refuses any script that doesn't carry this line. It is the
# real guard on that endpoint: without it, "upload a file" would be a
# general-purpose SQL console pointed at production.
DUMP_MARKER = "Safia dashboard — full database dump"

SCHEMA = "public"

# Rows per multi-row INSERT. Big enough that the script isn't statement-bound,
# small enough that a web import tool (phpPgAdmin and friends, which is all
# some shared hosts give you) doesn't choke on a single monster statement.
ROWS_PER_INSERT = 200

# Server-side cursor page size — caps how many rows are ever held in memory.
FETCH_SIZE = 2000


def qi(name: str) -> str:
    """Quote an identifier."""
    return '"' + name.replace('"', '""') + '"'


def _qt(table: str) -> str:
    return f"{SCHEMA}.{qi(table)}"


def _fetch(cur, sql: str, params: tuple | None = None) -> list[tuple]:
    cur.execute(sql, params or ())
    return cur.fetchall()


def _driver_connection(raw):
    """The real psycopg2 connection behind SQLAlchemy's pool proxy."""
    for attr in ("driver_connection", "dbapi_connection", "connection"):
        conn = getattr(raw, attr, None)
        if conn is not None and hasattr(conn, "cursor"):
            return conn
    return raw


# ── Catalog readers ───────────────────────────────────────────────────────────

def _extensions(cur) -> list[str]:
    return [r[0] for r in _fetch(cur, """
        SELECT extname FROM pg_extension
        WHERE extname <> 'plpgsql'
        ORDER BY extname
    """)]


def _enum_types(cur) -> list[tuple[str, str]]:
    return _fetch(cur, """
        SELECT t.typname,
               string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
        FROM pg_type t
        JOIN pg_enum e      ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = %s
        GROUP BY t.typname
        ORDER BY t.typname
    """, (SCHEMA,))


def _sequences(cur) -> list[tuple]:
    """Standalone sequences only.

    An identity column's sequence is created by the CREATE TABLE that declares
    it (deptype 'i' = internal), so emitting a CREATE SEQUENCE for it would
    collide on restore. Serial-style sequences (deptype 'a') are separate
    objects and DO belong here.
    """
    return _fetch(cur, """
        SELECT c.relname,
               pg_catalog.format_type(s.seqtypid, NULL),
               s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle
        FROM pg_class c
        JOIN pg_sequence s  ON s.seqrelid = c.oid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s
          AND NOT EXISTS (
                SELECT 1 FROM pg_depend d
                WHERE d.objid   = c.oid
                  AND d.classid = 'pg_class'::regclass
                  AND d.deptype = 'i')
        ORDER BY c.relname
    """, (SCHEMA,))


def _sequence_ownership(cur) -> list[tuple[str, str, str]]:
    return _fetch(cur, """
        SELECT s.relname, t.relname, a.attname
        FROM pg_depend d
        JOIN pg_class s      ON s.oid = d.objid AND s.relkind = 'S'
        JOIN pg_class t      ON t.oid = d.refobjid
        JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        JOIN pg_namespace n  ON n.oid = s.relnamespace
        WHERE d.deptype = 'a' AND n.nspname = %s
        ORDER BY s.relname
    """, (SCHEMA,))


def _sequence_values(cur) -> list[tuple[str, int | None]]:
    return _fetch(cur, """
        SELECT sequencename, last_value
        FROM pg_sequences
        WHERE schemaname = %s
        ORDER BY sequencename
    """, (SCHEMA,))


def _tables(cur) -> list[str]:
    return [r[0] for r in _fetch(cur, """
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relkind = 'r' AND NOT c.relispartition
        ORDER BY c.relname
    """, (SCHEMA,))]


def _columns(cur, table: str) -> list[tuple]:
    """(name, type, notnull, default, identity, generated) in attnum order."""
    return _fetch(cur, """
        SELECT a.attname,
               pg_catalog.format_type(a.atttypid, a.atttypmod),
               a.attnotnull,
               pg_get_expr(d.adbin, d.adrelid),
               a.attidentity,
               a.attgenerated
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    """, (f"{SCHEMA}.{qi(table)}",))


def _constraints(cur) -> list[tuple[str, str, str]]:
    """(table, name, definition) — PK/unique first, then checks, then FKs."""
    return _fetch(cur, """
        SELECT t.relname, c.conname, pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        JOIN pg_class t     ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = %s AND c.contype IN ('p', 'u', 'c', 'x', 'f')
        ORDER BY CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1
                                WHEN 'c' THEN 2 WHEN 'x' THEN 3 ELSE 4 END,
                 t.relname, c.conname
    """, (SCHEMA,))


def _indexes(cur) -> list[str]:
    """Index definitions, minus the ones a constraint already creates."""
    return [r[0] for r in _fetch(cur, """
        SELECT pg_get_indexdef(i.indexrelid)
        FROM pg_index i
        JOIN pg_class c     ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s
          AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid)
        ORDER BY c.relname, i.indexrelid::regclass::text
    """, (SCHEMA,))]


def _unsupported(cur) -> list[str]:
    """Object classes this dumper does not reproduce.

    ``create_all`` plus the startup ALTERs only ever make tables, sequences,
    indexes and constraints, so in practice these come back empty — but if
    someone hand-creates a trigger or a domain on the server, silently dropping
    it from a migration dump would be the worst possible failure. Report it
    instead: the caller surfaces the list, so "everything" stays honest.
    """
    found: list[str] = []
    for label, sql in (
        ("function/procedure", """
            SELECT p.proname FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = %s
              AND NOT EXISTS (SELECT 1 FROM pg_depend d
                              WHERE d.objid = p.oid AND d.deptype = 'e')
            ORDER BY p.proname"""),
        ("trigger", """
            SELECT t.tgname FROM pg_trigger t
            JOIN pg_class c     ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND NOT t.tgisinternal
            ORDER BY t.tgname"""),
        ("domain", """
            SELECT t.typname FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = %s AND t.typtype = 'd'
            ORDER BY t.typname"""),
        ("composite type", """
            SELECT t.typname FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = %s AND t.typtype = 'c'
              AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
            ORDER BY t.typname"""),
    ):
        for (name,) in _fetch(cur, sql, (SCHEMA,)):
            found.append(f"{label}: {name}")
    return found


def _views(cur) -> list[tuple[str, str, str]]:
    return _fetch(cur, """
        SELECT c.relname, c.relkind, pg_get_viewdef(c.oid, true)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relkind IN ('v', 'm')
        ORDER BY c.relname
    """, (SCHEMA,))


def table_inventory() -> list[dict]:
    """Cheap pre-flight listing for the admin UI: estimated rows + on-disk size.

    reltuples is the planner's estimate, not a COUNT(*) — instant on tables of
    any size, and only ever shown as an approximation.
    """
    with engine.connect() as conn:
        rows = conn.exec_driver_sql("""
            SELECT c.relname,
                   GREATEST(c.reltuples, 0)::bigint,
                   pg_total_relation_size(c.oid)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
            ORDER BY pg_total_relation_size(c.oid) DESC, c.relname
        """).fetchall()
    return [{"table": r[0], "rows": int(r[1]), "bytes": int(r[2])} for r in rows]


# ── DDL rendering ─────────────────────────────────────────────────────────────

def _column_ddl(col: tuple) -> str:
    name, ctype, notnull, default, identity, generated = col
    out = f"    {qi(name)} {ctype}"
    if identity in ("a", "d"):
        kind = "ALWAYS" if identity == "a" else "BY DEFAULT"
        out += f" GENERATED {kind} AS IDENTITY"
    elif generated == "s" and default:
        out += f" GENERATED ALWAYS AS ({default}) STORED"
    elif default is not None:
        out += f" DEFAULT {default}"
    if notnull:
        out += " NOT NULL"
    return out


def _sequence_ddl(seq: tuple) -> str:
    name, seqtype, start, incr, smin, smax, cache, cycle = seq
    return (
        f"CREATE SEQUENCE {_qt(name)}\n"
        f"    AS {seqtype}\n"
        f"    START WITH {start}\n"
        f"    INCREMENT BY {incr}\n"
        f"    MINVALUE {smin}\n"
        f"    MAXVALUE {smax}\n"
        f"    CACHE {cache}"
        f"{' CYCLE' if cycle else ''};\n"
    )


_HEADER_SETTINGS = """SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;
SET TIME ZONE 'UTC';
SET search_path = public, pg_catalog;
"""


# ── The dump ──────────────────────────────────────────────────────────────────

def dump_to_file(path: str, *, include_drops: bool = True) -> dict:
    """Write a gzip-compressed ``.sql`` restore script to ``path``.

    Returns ``{"tables": n, "rows": n, "bytes": n, "started": iso}``.
    """
    started = datetime.now(timezone.utc)
    raw = engine.raw_connection()
    pg = _driver_connection(raw)
    total_rows = 0

    try:
        cur = pg.cursor()
        # Same snapshot for the catalog reads and every table, so a write that
        # lands mid-dump can't produce a row referencing a table we already
        # passed. Best-effort: harmless to skip if a statement already ran.
        try:
            cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        except Exception:
            pg.rollback()
            cur = pg.cursor()
        # extra_float_digits: guarantees float8 renders round-trip-exact even on
        # a pre-12 server. UTC keeps repeat dumps byte-comparable (timestamptz
        # literals carry their offset either way, so values are safe regardless).
        cur.execute("SET extra_float_digits = 3")
        cur.execute("SET TIME ZONE 'UTC'")

        extensions = _extensions(cur)
        enums      = _enum_types(cur)
        sequences  = _sequences(cur)
        seq_owners = _sequence_ownership(cur)
        tables     = _tables(cur)
        views      = _views(cur)
        constraints = _constraints(cur)
        indexes    = _indexes(cur)
        skipped    = _unsupported(cur)
        columns    = {t: _columns(cur, t) for t in tables}

        with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
            w = f.write

            # Keep this line built from DUMP_MARKER — the restore path gates on it.
            w(f"--\n-- {DUMP_MARKER}\n")
            w(f"-- Generated {started.strftime('%Y-%m-%d %H:%M:%S')} UTC "
              f"by the admin panel (no pg_dump on this host).\n")
            w(f"-- Schema: {SCHEMA}   Tables: {len(tables)}\n")
            w("--\n-- RESTORE (target database must exist):\n")
            w("--     gunzip -c <thisfile>.sql.gz | psql \"$DATABASE_URL\"\n")
            w("--\n-- The script runs inside one transaction: if anything fails,\n")
            w("-- nothing is applied and the target is left untouched.\n")
            if include_drops:
                w("--\n-- WARNING: this dump DROPS every object listed below before\n")
                w("-- recreating it. Do not run it against a database whose contents\n")
                w("-- you still need.\n")
            if skipped:
                w("--\n-- NOT INCLUDED — this dumper covers tables, sequences, enums,\n")
                w("-- indexes, constraints and views only. Recreate these by hand:\n")
                for item in skipped:
                    w(f"--     {item}\n")
            w("--\n\n")
            w(_HEADER_SETTINGS)
            w("\nBEGIN;\n")

            if extensions:
                w("\n-- Extensions ---------------------------------------------------\n")
                for ext in extensions:
                    w(f"CREATE EXTENSION IF NOT EXISTS {qi(ext)};\n")

            if include_drops:
                w("\n-- Drop existing objects ----------------------------------------\n")
                for name, relkind, _ in views:
                    kw = "MATERIALIZED VIEW" if relkind == "m" else "VIEW"
                    w(f"DROP {kw} IF EXISTS {_qt(name)} CASCADE;\n")
                for t in tables:
                    w(f"DROP TABLE IF EXISTS {_qt(t)} CASCADE;\n")
                for seq in sequences:
                    w(f"DROP SEQUENCE IF EXISTS {_qt(seq[0])} CASCADE;\n")
                for name, _ in enums:
                    w(f"DROP TYPE IF EXISTS {_qt(name)} CASCADE;\n")

            if enums:
                w("\n-- Enum types ---------------------------------------------------\n")
                for name, labels in enums:
                    w(f"CREATE TYPE {_qt(name)} AS ENUM ({labels});\n")

            if sequences:
                w("\n-- Sequences ----------------------------------------------------\n")
                for seq in sequences:
                    w(_sequence_ddl(seq))

            w("\n-- Tables -------------------------------------------------------\n")
            for t in tables:
                cols = columns[t]
                w(f"\nCREATE TABLE {_qt(t)} (\n")
                w(",\n".join(_column_ddl(c) for c in cols))
                w("\n);\n")

            if seq_owners:
                w("\n-- Sequence ownership -------------------------------------------\n")
                for seq, tbl, col in seq_owners:
                    w(f"ALTER SEQUENCE {_qt(seq)} OWNED BY {_qt(tbl)}.{qi(col)};\n")

            w("\n-- Data ---------------------------------------------------------\n")
            for t in tables:
                # STORED generated columns are recomputed by the target and
                # cannot appear in an INSERT column list.
                cols = [c for c in columns[t] if c[5] != "s"]
                if not cols:
                    continue
                total_rows += _write_table_data(w, pg, t, [c[0] for c in cols])

            if constraints:
                w("\n-- Constraints (after data: insert order is then irrelevant) -----\n")
                for tbl, name, definition in constraints:
                    w(f"ALTER TABLE ONLY {_qt(tbl)} ADD CONSTRAINT {qi(name)} {definition};\n")

            if indexes:
                w("\n-- Indexes ------------------------------------------------------\n")
                for definition in indexes:
                    w(f"{definition};\n")

            if views:
                w("\n-- Views --------------------------------------------------------\n")
                for name, relkind, definition in views:
                    kw = "MATERIALIZED VIEW" if relkind == "m" else "VIEW"
                    w(f"CREATE {kw} {_qt(name)} AS\n{definition}\n")

            w("\n-- Sequence positions (so new inserts don't collide) --------------\n")
            for name, last in _sequence_values(cur):
                if last is not None:
                    # Quoted inside the literal so an unusual sequence name
                    # still resolves as regclass.
                    w(f"SELECT pg_catalog.setval('{SCHEMA}.{qi(name)}', {last}, true);\n")

            w("\nCOMMIT;\n")
            w(f"\n-- End of dump — {len(tables)} tables, {total_rows} rows.\n")

        cur.close()
    finally:
        try:
            pg.rollback()
        except Exception:
            pass
        raw.close()

    return {
        "tables":  len(tables),
        "rows":    total_rows,
        "bytes":   os.path.getsize(path),
        "started": started.isoformat(),
        "skipped": skipped,
    }


# ── Restore ───────────────────────────────────────────────────────────────────

_DOLLAR_RE = re.compile(r"\$[A-Za-z_]\w*\$|\$\$")

# Transaction control is Python's job during a restore (see restore_from_file),
# and these two session settings are ours to choose, so they're dropped from the
# script rather than obeyed.
_SKIP_PREFIXES = (
    "begin", "commit", "rollback", "start transaction", "end",
    "set statement_timeout", "set lock_timeout",
)


def iter_statements(fh):
    """Yield SQL statements from a dump file object, one at a time.

    Splitting on ``;`` alone is wrong: any note or worker name containing a
    semicolon would cut a statement in half. So this tracks quoting properly —
    single-quoted literals (where ``''`` is the escape, since the dump sets
    standard_conforming_strings=on), quoted identifiers, dollar-quoted bodies,
    and both comment styles. Streams line by line, so a 100 MB dump never lands
    in memory whole.
    """
    buf: list[str] = []
    state = "normal"
    tag = ""
    depth = 0

    for line in fh:
        i, n = 0, len(line)
        while i < n:
            ch = line[i]

            if state == "normal":
                if ch == "'":
                    state = "squote"; buf.append(ch); i += 1
                elif ch == '"':
                    state = "dquote"; buf.append(ch); i += 1
                elif line.startswith("--", i):
                    i = n                      # comment runs to end of line
                elif line.startswith("/*", i):
                    state = "block"; depth = 1; i += 2
                elif ch == "$" and (m := _DOLLAR_RE.match(line, i)):
                    tag = m.group(0); state = "dollar"
                    buf.append(tag); i = m.end()
                elif ch == ";":
                    stmt = "".join(buf).strip()
                    buf = []; i += 1
                    if stmt:
                        yield stmt
                else:
                    buf.append(ch); i += 1

            elif state == "squote":
                buf.append(ch)
                if ch == "'":
                    if i + 1 < n and line[i + 1] == "'":
                        buf.append("'"); i += 2; continue
                    state = "normal"
                i += 1

            elif state == "dquote":
                buf.append(ch)
                if ch == '"':
                    if i + 1 < n and line[i + 1] == '"':
                        buf.append('"'); i += 2; continue
                    state = "normal"
                i += 1

            elif state == "block":
                if line.startswith("/*", i):
                    depth += 1; i += 2
                elif line.startswith("*/", i):
                    depth -= 1; i += 2
                    if depth == 0:
                        state = "normal"
                else:
                    i += 1

            elif state == "dollar":
                if line.startswith(tag, i):
                    buf.append(tag); i += len(tag); state = "normal"
                else:
                    buf.append(ch); i += 1

    tail = "".join(buf).strip()
    if tail:
        yield tail


def _open_dump(path: str, gzipped: bool):
    # STRICT decoding on purpose. errors="replace" would let a corrupt or
    # partially-uploaded dump quietly load with U+FFFD in place of real
    # characters; a loud UnicodeDecodeError that aborts the transaction is by
    # far the better outcome when the payload is a database restore.
    if gzipped:
        return gzip.open(path, "rt", encoding="utf-8")
    return open(path, "r", encoding="utf-8")


def restore_from_file(path: str, *, gzipped: bool) -> dict:
    """Execute a dump produced by :func:`dump_to_file` against this database.

    Everything runs in ONE transaction that this function controls, so a failure
    anywhere leaves the database exactly as it was — a half-restored database
    would be far worse than a failed restore. The script's own BEGIN/COMMIT are
    skipped so that guarantee can't be subverted by the file.
    """
    with _open_dump(path, gzipped) as fh:
        head = fh.read(4096)
    if DUMP_MARKER not in head:
        raise ValueError(
            "This file is not a Safia database dump (missing the header marker). "
            "Only a dump produced by the Backup tab can be restored here."
        )

    started = time.monotonic()
    executed = skipped = 0

    # Drop our own idle pooled connections first: they hold no locks, but
    # clearing them removes the most likely reason a DROP TABLE would block.
    engine.dispose()

    raw = engine.raw_connection()
    pg = _driver_connection(raw)
    try:
        cur = pg.cursor()
        cur.execute("SET statement_timeout = 0")
        # Fail fast instead of hanging forever if a live request holds a lock.
        cur.execute("SET lock_timeout = '60s'")

        with _open_dump(path, gzipped) as fh:
            for stmt in iter_statements(fh):
                low = stmt.lstrip().lower()
                if low.startswith(_SKIP_PREFIXES):
                    skipped += 1
                    continue
                try:
                    cur.execute(stmt)
                except Exception as exc:
                    pg.rollback()
                    snippet = " ".join(stmt.split())[:300]
                    raise RuntimeError(
                        f"Failed after {executed} statements: {exc}\n\nStatement: {snippet}"
                    ) from exc
                executed += 1

        pg.commit()
        cur.close()
    finally:
        raw.close()
        # New pooled connections, so nothing cached against the old tables.
        engine.dispose()

    return {
        "statements": executed,
        "skipped":    skipped,
        "elapsed":    round(time.monotonic() - started, 1),
    }


def _write_table_data(w, pg, table: str, colnames: list[str]) -> int:
    """Stream one table out as batched multi-row INSERTs. Returns the row count.

    Each row arrives pre-rendered as a ``(lit, lit, …)`` tuple built by
    quote_nullable() on the server, so no Python-side type formatting is
    involved and the literals coerce back to the exact column types.
    """
    tuple_expr = " || ',' || ".join(f"quote_nullable({qi(c)}::text)" for c in colnames)
    select = f"SELECT '(' || {tuple_expr} || ')' FROM {_qt(table)}"
    collist = ", ".join(qi(c) for c in colnames)
    prefix = f"INSERT INTO {_qt(table)} ({collist}) VALUES\n"

    # Named cursor = server-side; the result set never lands in this process
    # whole. Falls back to a client-side cursor if the driver has no such
    # thing (psycopg2 does; keep the fallback so a driver swap doesn't break).
    safe = "".join(ch if ch.isalnum() else "_" for ch in table)
    try:
        cur = pg.cursor(name=f"safia_dump_{safe}")
        cur.itersize = FETCH_SIZE
    except Exception:
        cur = pg.cursor()

    cur.execute(select)
    count, batch = 0, []
    w(f"\n-- {table}\n")
    try:
        while True:
            rows = cur.fetchmany(FETCH_SIZE)
            if not rows:
                break
            for (literal,) in rows:
                batch.append(literal)
                if len(batch) >= ROWS_PER_INSERT:
                    w(prefix + ",\n".join(batch) + ";\n")
                    count += len(batch)
                    batch = []
        if batch:
            w(prefix + ",\n".join(batch) + ";\n")
            count += len(batch)
    finally:
        cur.close()

    if count == 0:
        w("-- (empty)\n")
    return count
