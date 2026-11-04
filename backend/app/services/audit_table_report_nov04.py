"""TEMPORARY boot report (2026-11-04): what `public.audit` is on production.

Abbos asked for `select * from public.audit;` on production. No model of this
platform creates a table by that name, so if it exists something outside this
codebase made it (a database tool, IT, another app sharing the database). The
report door could not be used (no ask key on the Mac the question came from),
so production's answer is DMed once to Abbos instead.

READ-ONLY: one READ ONLY transaction, every statement bounded at 20 s and every
lock wait at 3 s, each read in a savepoint so one that fails costs its line. It
reads whether `public.audit` exists and what it is (kind, owner, size, rows,
comment, whether this app may read it), its columns, every other relation or
schema with «audit» in its name, the triggers and functions that mention it,
the installed extensions, the platform's own audit-type tables (estimated
rows), and — when it exists — its rows, newest first, at most `MAX_ROWS`,
credentials masked as the report door masks them (`ops_door.mask_rows`). Sent
as a short message plus an .xlsx. Writes nothing but its flag
(`startup.AUDIT_TABLE_REPORT_FLAG`). Delete this module,
`startup.report_audit_table` and both entrypoint calls once it has landed.
"""
from __future__ import annotations

import io
import json
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.config import settings
from app.services import ops_door

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
MAX_ROWS = 20_000          # rows of public.audit put in the file
CELL_CAP = 2_000           # one cell's text in the file (Excel's limit is 32,767)

# The platform's own audit-type tables — named so a reader who meant one of
# these sees it beside the answer.
PLATFORM_AUDIT = ("action_logs", "capability_audit", "leader_task_config_audit",
                  "hr_document_history", "capability_uses")

_TIME_TYPES = ("timestamp with time zone", "timestamp without time zone", "date")
_TIME_HINTS = ("created", "time", "date", "_at", "ts", "when", "stamp")


def _q(db: Session, q: str, params: dict | None = None, problems: list | None = None) -> list:
    """One read in a savepoint: a read that fails costs that line only."""
    try:
        with db.begin_nested():
            return [dict(r._mapping) for r in db.execute(sql(q), params or {})]
    except Exception as exc:  # noqa: BLE001
        if problems is not None:
            problems.append(f"{' '.join(q.split())[:80]}… → {type(exc).__name__}: {str(exc).splitlines()[0][:160]}")
        return []


def _ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _order_column(cols: list[dict]) -> Optional[str]:
    """Newest first: the first time-typed column whose name says when, else the
    first time-typed column, else an `id`."""
    timed = [c for c in cols if c.get("data_type") in _TIME_TYPES]
    for c in timed:
        if any(h in c["column_name"].lower() for h in _TIME_HINTS):
            return c["column_name"]
    if timed:
        return timed[0]["column_name"]
    for c in cols:
        if c["column_name"].lower() == "id":
            return c["column_name"]
    return None


def collect(db: Session) -> dict:
    problems: list[str] = []
    rep: dict = {"taken": datetime.now(TZ), "problems": problems}
    db.rollback()
    try:
        db.execute(sql("SET TRANSACTION READ ONLY"))
        db.execute(sql("SET LOCAL statement_timeout = '20s'"))
        db.execute(sql("SET LOCAL lock_timeout = '3s'"))

        rep["db"] = (_q(db, "SELECT current_database() AS db, current_user AS usr, "
                            "version() AS version", problems=problems) or [{}])[0]
        rel = _q(db, """
            SELECT n.nspname AS schema, c.relname AS name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
                        WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                        WHEN 'f' THEN 'foreign table' ELSE c.relkind::text END AS kind,
                   pg_get_userbyid(c.relowner) AS owner, c.reltuples::bigint AS est_rows,
                   pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
                   obj_description(c.oid, 'pg_class') AS comment,
                   has_table_privilege(c.oid, 'SELECT') AS can_read,
                   s.n_tup_ins AS inserts_since_stats_reset,
                   s.last_autoanalyze, s.last_analyze
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
             WHERE n.nspname = 'public' AND c.relname = 'audit'""", problems=problems)
        rep["audit"] = rel[0] if rel else None

        rep["related"] = _q(db, """
            SELECT n.nspname AS schema, c.relname AS name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
                        WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                        WHEN 'f' THEN 'foreign table' ELSE c.relkind::text END AS kind,
                   pg_get_userbyid(c.relowner) AS owner, c.reltuples::bigint AS est_rows,
                   pg_size_pretty(pg_total_relation_size(c.oid)) AS size
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r','p','v','m','f')
               AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
               AND (c.relname ILIKE '%audit%' OR n.nspname ILIKE '%audit%' OR c.relname = ANY(:plat))
             ORDER BY n.nspname, c.relname""", {"plat": list(PLATFORM_AUDIT)}, problems)
        rep["schemas"] = _q(db, "SELECT nspname AS schema, pg_get_userbyid(nspowner) AS owner "
                                "FROM pg_namespace WHERE nspname ILIKE '%audit%'", problems=problems)
        rep["triggers"] = _q(db, """
            SELECT tn.nspname AS on_schema, tc.relname AS on_table, tg.tgname AS trigger,
                   pn.nspname || '.' || p.proname AS function,
                   tg.tgenabled AS enabled, pg_get_triggerdef(tg.oid) AS definition
              FROM pg_trigger tg
              JOIN pg_class tc ON tc.oid = tg.tgrelid
              JOIN pg_namespace tn ON tn.oid = tc.relnamespace
              JOIN pg_proc p ON p.oid = tg.tgfoid
              JOIN pg_namespace pn ON pn.oid = p.pronamespace
             WHERE NOT tg.tgisinternal
               AND (p.prosrc ILIKE '%audit%' OR p.proname ILIKE '%audit%'
                    OR tc.relname ILIKE '%audit%' OR tg.tgname ILIKE '%audit%')
             ORDER BY tn.nspname, tc.relname, tg.tgname""", problems=problems)
        rep["functions"] = _q(db, """
            SELECT pn.nspname || '.' || p.proname AS function, l.lanname AS language,
                   pg_get_userbyid(p.proowner) AS owner, left(p.prosrc, 1500) AS source
              FROM pg_proc p
              JOIN pg_namespace pn ON pn.oid = p.pronamespace
              JOIN pg_language l ON l.oid = p.prolang
             WHERE pn.nspname NOT IN ('pg_catalog','information_schema')
               AND (p.prosrc ILIKE '%audit%' OR p.proname ILIKE '%audit%')
             ORDER BY 1 LIMIT 60""", problems=problems)
        rep["extensions"] = _q(db, "SELECT extname AS extension, extversion AS version "
                                   "FROM pg_extension ORDER BY 1", problems=problems)

        rep["columns"] = []
        rep["rows"] = []
        rep["row_columns"] = []
        rep["count"] = None
        rep["order_by"] = None
        rep["masked"] = []
        if rep["audit"]:
            rep["columns"] = _q(db, """
                SELECT ordinal_position AS n, column_name, data_type, udt_name,
                       is_nullable, column_default
                  FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'audit'
                 ORDER BY ordinal_position""", problems=problems)
            cnt = _q(db, "SELECT count(*) AS n FROM public.audit", problems=problems)
            rep["count"] = cnt[0]["n"] if cnt else None
            order = _order_column(rep["columns"])
            rep["order_by"] = order
            q = "SELECT * FROM public.audit"
            if order:
                q += f" ORDER BY {_ident(order)} DESC NULLS LAST"
            q += f" LIMIT {MAX_ROWS + 1}"
            try:
                with db.begin_nested():
                    res = db.execute(sql(q))
                    cols = [str(k) for k in res.keys()]
                    raw = [[ops_door.plain(v) for v in r] for r in res.fetchmany(MAX_ROWS + 1)]
                rep["truncated"] = len(raw) > MAX_ROWS
                masked: set = set()
                rep["rows"] = ops_door.mask_rows(cols, raw[:MAX_ROWS], masked)
                rep["row_columns"] = cols
                rep["masked"] = sorted(masked)
            except Exception as exc:  # noqa: BLE001
                problems.append(f"SELECT * FROM public.audit → {type(exc).__name__}: "
                                f"{str(exc).splitlines()[0][:200]}")
    finally:
        db.rollback()
    return rep


# ── text ──────────────────────────────────────────────────────────────────────

def text(rep: dict) -> str:
    L = [f"public.audit on production — {rep['taken'].strftime('%d.%m.%Y %H:%M')} (Tashkent)"]
    d = rep.get("db") or {}
    if d:
        L.append(f"database {d.get('db')} · read as {d.get('usr')}")
    a = rep.get("audit")
    if not a:
        L.append("")
        L.append("public.audit does NOT exist on production.")
    else:
        L.append("")
        L.append(f"EXISTS: {a['kind']} · owner {a['owner']} · {a['size']} · "
                 f"rows {rep['count'] if rep['count'] is not None else '≈' + str(a['est_rows'])}"
                 f"{'' if a.get('can_read') else ' · this app may NOT read it'}")
        if a.get("comment"):
            L.append(f"comment: {a['comment']}")
        if rep["columns"]:
            L.append("columns: " + ", ".join(f"{c['column_name']} ({c['udt_name']})" for c in rep["columns"]))
        if rep["rows"]:
            total = f"{rep['count']:,}" if isinstance(rep.get("count"), int) else "more"
            more = f" (newest {MAX_ROWS:,} of {total})" if rep.get("truncated") else ""
            by = f", newest first by {rep['order_by']}" if rep["order_by"] else ""
            L.append(f"rows in the file: {len(rep['rows']):,}{more}{by}")
        if rep["masked"]:
            L.append("masked as •••: " + ", ".join(rep["masked"][:20]))
    others = [r for r in rep.get("related") or [] if not (r["schema"] == "public" and r["name"] == "audit")]
    if others:
        L.append("")
        L.append("Other tables/views with «audit» in the name, and the platform's own audit tables:")
        for r in others:
            L.append(f"· {r['schema']}.{r['name']} — {r['kind']}, owner {r['owner']}, ≈{r['est_rows']} rows, {r['size']}")
    if rep.get("schemas"):
        L.append("schemas named *audit*: " + ", ".join(s["schema"] for s in rep["schemas"]))
    if rep.get("triggers"):
        L.append("")
        L.append("Triggers mentioning audit:")
        for t in rep["triggers"][:15]:
            L.append(f"· {t['on_schema']}.{t['on_table']} · {t['trigger']} → {t['function']}")
    if rep.get("functions"):
        L.append("Functions mentioning audit: " + ", ".join(f["function"] for f in rep["functions"][:15]))
    ext = [e["extension"] for e in rep.get("extensions") or []]
    if ext:
        L.append("extensions: " + ", ".join(ext))
    if rep["problems"]:
        L.append("")
        L.append("PROBLEMS: " + " | ".join(rep["problems"]))
    return "\n".join(L)


# ── workbook ──────────────────────────────────────────────────────────────────

def _cell(v):
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    if v is None or isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False, default=str)
    s = ILLEGAL_CHARACTERS_RE.sub("", str(v))
    return s if len(s) <= CELL_CAP else s[:CELL_CAP] + f"… [{len(s)} chars]"


def _sheet(wb, title: str, header: list[str], rows: list[list]) -> None:
    from openpyxl.styles import Font, PatternFill
    ws = wb.create_sheet(title)
    ws.append(header)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="C8973F")
    for r in rows:
        ws.append([_cell(v) for v in r])
    ws.freeze_panes = "A2"
    for i, h in enumerate(header, start=1):
        width = max([len(str(h))] + [min(len(str(r[i - 1] or "")), 60) for r in rows[:300]]) + 2
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(max(width, 8), 62)


def workbook(rep: dict) -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    for line in text(rep).split("\n"):
        ws.append([_cell(line)])
    ws.column_dimensions["A"].width = 120
    if rep["rows"]:
        _sheet(wb, "Rows", rep["row_columns"], rep["rows"])
    if rep["columns"]:
        keys = ["n", "column_name", "data_type", "udt_name", "is_nullable", "column_default"]
        _sheet(wb, "Columns", keys, [[c.get(k) for k in keys] for c in rep["columns"]])
    for title, key in (("Related tables", "related"), ("Triggers", "triggers"),
                       ("Functions", "functions"), ("Extensions", "extensions")):
        rows = rep.get(key) or []
        if rows:
            keys = list(rows[0].keys())
            _sheet(wb, title, keys, [[r.get(k) for k in keys] for r in rows])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── send ──────────────────────────────────────────────────────────────────────

def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=180)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    """The answer as a message (in chunks) plus the .xlsx. Returns the
    messages sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    body = text(rep)
    print("[startup] audit table report:\n" + body[:8000])
    chunks, cur = [], ""
    for line in body.split("\n"):
        line = line[:3900]
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    if cur:
        chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    stamp = rep["taken"].strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": "public.audit — production's answer (rows newest first; credentials as •••)."},
          files={"document": (f"public-audit-{stamp}.xlsx", workbook(rep),
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    return len(chunks) + 1
