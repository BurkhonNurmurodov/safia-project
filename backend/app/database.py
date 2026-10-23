import logging

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

log = logging.getLogger("app.db")

# pool_pre_ping: the shared host drops Postgres connections that sit idle, and
# without a liveness test SQLAlchemy hands the dead one to the next caller —
# the first query after an idle gap raises OperationalError. In the web app
# that's a failed request the user retries away; in the bot it's a handler that
# dies before it sends anything, i.e. a command that answers with pure silence
# (see the _admin_ids() call at the top of /start). pool_recycle rotates
# connections out before the host's own idle timeout can reach them.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# A backend whose CLIENT is gone ends within seconds (2026-10-23). Postgres
# notices a vanished client only when it next writes to its socket, so a query
# — or a lock wait — of a worker the supervisor killed (a retiring worker after
# its 60 s grace, a boot abandoned mid-step) went on for as long as it lasted:
# on 23 Oct two killed boots' ALTER TABLE managers sat ~45 minutes in the lock
# queue and every `managers` query of the serving worker queued behind them.
# The setting (Postgres 14+, settable per session) makes the server check the
# socket every 5 s while a query runs. It is SET and COMMITTED once per new
# pooled connection; a server without it rejects the SET, which is swallowed —
# never put it in connect_args, where it would fail every connection there.
@event.listens_for(engine, "connect")
def _end_with_client(dbapi_conn, _record):
    try:
        cur = dbapi_conn.cursor()
        cur.execute("SET client_connection_check_interval = '5s'")
        cur.close()
        dbapi_conn.commit()
    except Exception:  # noqa: BLE001 — an older server: nothing changes
        try:
            dbapi_conn.rollback()
        except Exception:  # noqa: BLE001
            pass


# A REQUEST's statements are bounded (2026-10-23). On 23 Oct one «Brigadirlar
# reytingi» build's query ran ~50 minutes — Cloudflare had dropped the browser
# at 100 s — holding a pool connection and its locks, and the boots queued
# behind it stalled production for an hour. Nothing on the server bounded it.
# Every session handed out by get_db now runs each transaction under
# `SET LOCAL statement_timeout` (lock waits count too); a statement past it is
# cancelled (Postgres 57014), the request answers a JSON 503 «query_timeout»
# (main.py — no X-Safia-Restarting, so the client does not retry it) and the
# log says `[STATEMENT-TIMEOUT]`. 90 s: a request's statements take
# milliseconds to a few seconds (the slowest ones on record, 7–10 s, were fixed
# or bounded since), and a browser behind Cloudflare never sees an answer past
# 100 s anyway.
# NOT bounded, by construction (they never take a session from get_db): the
# scheduler's jobs, the boot steps (boot_ddl bounds their lock waits), db-dump
# and restore (raw connections), the bot, and every thread a request starts
# with a SessionLocal() of its own. A request path that legitimately needs
# longer calls `allow_long(db, ms)`.
REQUEST_STATEMENT_TIMEOUT_MS = 90_000


@event.listens_for(SessionLocal, "after_begin")
def _request_limits(session, _transaction, connection):
    ms = session.info.get("stmt_ms")
    if ms:
        connection.exec_driver_sql(f"SET LOCAL statement_timeout = {int(ms)}")


@event.listens_for(engine, "handle_error")
def _log_cancelled(ctx):
    # Logged here, at the driver, so a cancel is on record even when a caller
    # catches the error and carries on.
    orig = getattr(ctx, "original_exception", None)
    if getattr(orig, "pgcode", None) == "57014":
        log.warning("[STATEMENT-TIMEOUT] cancelled: %s", " ".join((ctx.statement or "").split())[:240])


def allow_long(db, ms: int = 300_000) -> None:
    """Lift a request session's statement limit to `ms` (0 = none) for the rest
    of this request — for the one path that legitimately needs it. Applies to
    the transaction already open too."""
    db.info["stmt_ms"] = int(ms) or None
    if db.in_transaction():
        db.execute(text(f"SET LOCAL statement_timeout = {int(ms)}"))


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    db.info["stmt_ms"] = REQUEST_STATEMENT_TIMEOUT_MS
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception:  # noqa: BLE001 — a dead connection must not raise after the response
            log.warning("request session close failed", exc_info=True)
