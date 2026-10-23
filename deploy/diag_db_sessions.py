"""TEMPORARY (2026-10-23): who holds what in the database, printed into the
deploy log before and after the worker swap — the deploys of 23 Oct stalled
behind locks nobody could see. Read-only (pg_stat_activity), never fails the
deploy. Quoted literals are masked, so no value a query carried is printed.
Remove with its two steps in .gitea/workflows/deploy.yaml."""
import sys

import psycopg2
from dotenv import dotenv_values

label = sys.argv[1] if len(sys.argv) > 1 else ""
url = dotenv_values("/var/www/production/backend/.env").get("DATABASE_URL")
conn = psycopg2.connect(url, connect_timeout=10, application_name="deploy-diag")
conn.autocommit = True
cur = conn.cursor()
print(f"== database sessions {label} ==")
cur.execute(
    "SELECT coalesce(application_name, ''), coalesce(state, '-'), "
    "coalesce(wait_event_type || ':' || wait_event, '-'), count(*), "
    "max(extract(epoch FROM now() - xact_start))::int "
    "FROM pg_stat_activity WHERE datname = current_database() "
    "GROUP BY 1, 2, 3 ORDER BY 4 DESC")
for app, state, wait, n, age in cur.fetchall():
    print(f"  {n:3d} × {state:<28} {wait:<28} app={app!r:<18} oldest txn {age if age is not None else '-'} s")
cur.execute(
    "SELECT pid, state, extract(epoch FROM now() - xact_start)::int, "
    "extract(epoch FROM now() - query_start)::int, "
    "coalesce(wait_event_type || ':' || wait_event, '-'), pg_blocking_pids(pid), "
    "left(regexp_replace(regexp_replace(coalesce(query, ''), '''[^'']*''', '''…''', 'g'), "
    "'\\s+', ' ', 'g'), 160) "
    "FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() "
    "AND xact_start IS NOT NULL ORDER BY xact_start LIMIT 25")
rows = cur.fetchall()
print(f"-- {len(rows)} open transactions, oldest first --")
for pid, state, xa, qa, wait, blk, q in rows:
    print(f"  pid {pid} {state} txn {xa}s query {qa}s {wait} blocked_by={blk} · {q}")
cur.execute(
    "SELECT c.relname, l.mode, l.granted, count(*) FROM pg_locks l "
    "JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace "
    "WHERE n.nspname = 'public' AND l.database = (SELECT oid FROM pg_database "
    "WHERE datname = current_database()) AND (NOT l.granted OR l.mode IN "
    "('AccessExclusiveLock', 'ExclusiveLock', 'ShareRowExclusiveLock', 'ShareLock')) "
    "GROUP BY 1, 2, 3 ORDER BY 3, 4 DESC LIMIT 20")
locks = cur.fetchall()
print(f"-- {len(locks)} heavy or waiting table locks --")
for rel, mode, granted, n in locks:
    print(f"  {rel:<34} {mode:<24} {'granted' if granted else 'WAITING'} ×{n}")
conn.close()
