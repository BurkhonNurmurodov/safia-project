"""TEMPORARY (2026-10-23): end the database sessions a KILLED boot left behind.

A worker the supervisor kills mid-boot leaves its Postgres backend alive while
that backend waits on a lock — the server only notices the client is gone once
it gets the lock. On 23 Oct two `ALTER TABLE managers …` of killed boots waited
for ~45 minutes, and every query on `managers` of the SERVING worker queued
behind them until its pool was full: production stalled.

Ended here: a session of this database that has waited on a LOCK for more than
two minutes while running DDL (serving workers never run DDL, and a booting
worker gives up after 5 s since v4.320.2) or the boot's `UPDATE managers SET
factory_id …` attach. Nothing else is touched. Prints what it ended, literals
masked. Never fails the deploy. Remove with its step in deploy.yaml.
"""
import psycopg2
from dotenv import dotenv_values

url = dotenv_values("/var/www/production/backend/.env").get("DATABASE_URL")
conn = psycopg2.connect(url, connect_timeout=10, application_name="deploy-orphans")
conn.autocommit = True
cur = conn.cursor()
cur.execute(
    "SELECT pid, extract(epoch FROM now() - query_start)::int, "
    "left(regexp_replace(regexp_replace(coalesce(query, ''), '''[^'']*''', '''…''', 'g'), "
    "'\\s+', ' ', 'g'), 140) "
    "FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() "
    "AND state = 'active' AND wait_event_type = 'Lock' "
    "AND query_start < now() - interval '2 minutes' "
    "AND (query ~* '^\\s*(ALTER|CREATE|DROP|COMMENT)\\M' "
    "     OR query ~* '^\\s*UPDATE managers SET factory_id\\M')")
rows = cur.fetchall()
print(f"== orphaned boot sessions waiting on a lock: {len(rows)} ==")
for pid, age, q in rows:
    cur.execute("SELECT pg_terminate_backend(%s)", (pid,))
    print(f"  ended pid {pid} (waiting {age} s): {q} → {cur.fetchone()[0]}")
conn.close()
