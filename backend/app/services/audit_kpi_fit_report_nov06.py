"""TEMPORARY boot report (2026-11-06): can `public.audit` feed «Texnologlar auditi»?

The operator asked whether `public.audit` — a table something outside this
codebase writes, owned by `safia_prod_rw` — fits one of the leaders' KPIs. The
only candidate is the empty fifth one, «Texnologlar auditi» (HR's rule: one
percentage per CELL per MONTH, > 90 % → 3, > 80 % → 2, > 70 % → 1, else 0,
weight 0.1 — `leaders_kpi.AUDIT_RULE`). To feed it, a row must say WHICH CELL,
WHEN, and a RESULT. This report answers those three from production, to
Burkhon's chat, once.

The 4 Nov report (deleted) read the columns through `information_schema`,
which lists only columns of a table the reader holds a privilege on — and this
app may not read `public.audit` — so this one reads the CATALOG (`pg_attribute`,
`pg_constraint`, `pg_index`), which anybody may: the columns, types, comments,
keys and foreign keys arrive whether or not the GRANT has been run. Rows (and
everything computed from them) only if it has.

READ-ONLY: one READ ONLY transaction, every statement bounded at 20 s and every
lock wait at 3 s, each read in a savepoint so one that fails costs its line.
Rows newest first, at most `MAX_ROWS`, credentials masked as the report door
masks them (`ops_door.mask_rows`). Per column: non-null count, distinct count,
the commonest values, number ranges, date spans and months, JSON top-level
keys, and how many of its distinct values are codes of our cells (verifix code
— exact, zero-stripped, or four digits at either end of a text — SAP work
centre, or `cells.id`). Also: who writes it (the role, its sessions' app names,
the table's insert/update counters), and what else that role owns. Writes
nothing but its flag (`startup.AUDIT_KPI_FIT_REPORT_FLAG`). Delete this module,
`startup.report_audit_kpi_fit` / `_audit_kpi_fit_job` and both entrypoint calls
once it has landed.
"""
from __future__ import annotations

import io
import json
import re
import time
from collections import Counter
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell
from app.services import cell_lookup, ops_door

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
MAX_ROWS = 20_000          # rows read for the per-column picture
FILE_ROWS = 1_000          # rows put in the workbook
CELL_CAP = 2_000           # one cell's text in the file
TOP_N = 8                  # commonest values per column
OWNER = "safia_prod_rw"

_TIME_TYPES = ("timestamp with time zone", "timestamp without time zone", "date")
_TIME_HINTS = ("created", "time", "date", "_at", "ts", "when", "stamp")
_EDGE4 = re.compile(r"^\s*(\d{4})(?!\d)|(?<!\d)(\d{4})\s*$")
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}")
# A column whose NAME says it may hold a cell: only there is a short number
# (28 for 0028) or a bare id read as a cell — a 0–100 score would otherwise
# «match» cells.id and the zero-stripped codes.
_CELL_NAME = re.compile(r"cell|code|yach|sex|tsex|division|dept|unit|warehouse|цех|ячей|подраздел", re.I)


def _q(db: Session, q: str, params: dict | None = None, problems: list | None = None) -> list:
    """One read in a savepoint: a read that fails costs that line only."""
    try:
        with db.begin_nested():
            return [dict(r._mapping) for r in db.execute(sql(q), params or {})]
    except Exception as exc:  # noqa: BLE001
        if problems is not None:
            problems.append(f"{' '.join(q.split())[:80]}… → {type(exc).__name__}: "
                            f"{str(exc).splitlines()[0][:160]}")
        return []


def _ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _order_column(cols: list[dict]) -> Optional[str]:
    timed = [c for c in cols if c.get("type") in _TIME_TYPES]
    for c in timed:
        if any(h in c["name"].lower() for h in _TIME_HINTS):
            return c["name"]
    if timed:
        return timed[0]["name"]
    for c in cols:
        if c["name"].lower() == "id":
            return c["name"]
    return None


# ── our cells, to match a column's values against ─────────────────────────────

def _cell_keys(db: Session) -> dict:
    vfx = cell_lookup.by_verifix(db)
    sap = {cell_lookup._norm(c) for (c,) in db.query(Cell.sap_code).all() if c}
    ids = {int(i) for (i,) in db.query(Cell.id).all()}
    return {"vfx": vfx, "sap": sap, "ids": ids}


def _as_cell(v, keys: dict, hint: bool) -> Optional[str]:
    """How a value names one of our cells, or None. `hint`: the column's name
    says it may hold one."""
    if v is None or isinstance(v, (bool, dict, list)):
        return None
    s = str(v).strip()
    if not s:
        return None
    short = s.isdigit() and len(s) < 4
    if (hint or not short) and cell_lookup.resolve_verifix(keys["vfx"], s):
        return "verifix"
    m = _EDGE4.search(s)
    if m and cell_lookup.resolve_verifix(keys["vfx"], m.group(1) or m.group(2)):
        return "verifix (4 digits in text)"
    if cell_lookup._norm(s) in keys["sap"]:
        return "sap work centre"
    if hint and (isinstance(v, int) or s.isdigit()):
        try:
            if int(s) in keys["ids"]:
                return "cells.id"
        except ValueError:
            pass
    return None


def _num(v) -> Optional[float]:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", ".").replace("%", "").strip())
        except ValueError:
            return None
    return None


def _profile(cols: list[str], rows: list[list], keys: dict, masked_cols: set) -> list[dict]:
    """One line of facts per column, off the rows read."""
    out = []
    for i, name in enumerate(cols):
        vals = [r[i] for r in rows if r[i] not in (None, "")]
        p: dict = {"column": name, "non_null": len(vals), "rows": len(rows)}
        if name in masked_cols:
            p["note"] = "masked (credential-shaped)"
            out.append(p)
            continue
        hashable = [json.dumps(v, ensure_ascii=False, sort_keys=True) if isinstance(v, (dict, list)) else v
                    for v in vals]
        distinct = set(hashable)
        p["distinct"] = len(distinct)
        p["top"] = [(str(k)[:60], n) for k, n in Counter(hashable).most_common(TOP_N)]
        nums = [x for x in (_num(v) for v in vals) if x is not None]
        if vals and len(nums) == len(vals):
            p["min"], p["max"] = min(nums), max(nums)
            p["avg"] = round(sum(nums) / len(nums), 3)
        isos = [str(v)[:10] for v in vals if isinstance(v, str) and _ISO.match(v)]
        if vals and len(isos) == len(vals):
            p["from"], p["to"] = min(isos), max(isos)
            p["months"] = sorted(Counter(s[:7] for s in isos).items())
        dicts = [v for v in vals if isinstance(v, dict)]
        if dicts:
            p["json_keys"] = Counter(k for d in dicts for k in d.keys()).most_common(30)
        how = Counter()
        sample = list(distinct)[:5000]
        hint = bool(_CELL_NAME.search(name))
        for v in sample:
            k = _as_cell(v, keys, hint)
            if k:
                how[k] += 1
        if how:
            p["cells"] = {"of_distinct": len(sample), "matched": sum(how.values()),
                          "how": dict(how)}
        out.append(p)
    return out


def collect(db: Session) -> dict:
    problems: list[str] = []
    rep: dict = {"taken": datetime.now(TZ), "problems": problems}
    keys = _cell_keys(db)
    rep["our_cells"] = len({c["id"] for c in keys["vfx"].values()})
    db.rollback()
    try:
        db.execute(sql("SET TRANSACTION READ ONLY"))
        db.execute(sql("SET LOCAL statement_timeout = '20s'"))
        db.execute(sql("SET LOCAL lock_timeout = '3s'"))

        rep["db"] = (_q(db, "SELECT current_database() AS db, current_user AS usr",
                        problems=problems) or [{}])[0]
        rel = _q(db, """
            SELECT c.oid::bigint AS oid,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
                        WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                        WHEN 'f' THEN 'foreign table' ELSE c.relkind::text END AS kind,
                   pg_get_userbyid(c.relowner) AS owner, c.reltuples::bigint AS est_rows,
                   pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
                   obj_description(c.oid, 'pg_class') AS comment,
                   has_table_privilege(c.oid, 'SELECT') AS can_read,
                   s.n_live_tup, s.n_tup_ins, s.n_tup_upd, s.n_tup_del,
                   s.last_autoanalyze, s.last_autovacuum
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
             WHERE n.nspname = 'public' AND c.relname = 'audit'""", problems=problems)
        rep["audit"] = rel[0] if rel else None
        rep["columns"], rep["constraints"], rep["indexes"] = [], [], []
        rep["viewdef"] = None
        if rep["audit"]:
            oid = rep["audit"]["oid"]
            rep["columns"] = _q(db, """
                SELECT a.attnum AS n, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
                       a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expr,
                       col_description(a.attrelid, a.attnum) AS comment
                  FROM pg_attribute a
                  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                 WHERE a.attrelid = CAST(:oid AS oid) AND a.attnum > 0 AND NOT a.attisdropped
                 ORDER BY a.attnum""", {"oid": oid}, problems)
            rep["constraints"] = _q(db, """
                SELECT conname AS name, contype AS kind, pg_get_constraintdef(oid) AS definition
                  FROM pg_constraint WHERE conrelid = CAST(:oid AS oid) ORDER BY contype, conname""",
                                    {"oid": oid}, problems)
            rep["indexes"] = _q(db, """
                SELECT i.relname AS name, pg_get_indexdef(x.indexrelid) AS definition
                  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
                 WHERE x.indrelid = CAST(:oid AS oid) ORDER BY i.relname""", {"oid": oid}, problems)
            if rep["audit"]["kind"] in ("view", "materialized view"):
                vd = _q(db, "SELECT pg_get_viewdef(CAST(:oid AS oid), true) AS d", {"oid": oid}, problems)
                rep["viewdef"] = vd[0]["d"] if vd else None
            rep["fks_in"] = _q(db, """
                SELECT conrelid::regclass::text AS from_table, conname AS name,
                       pg_get_constraintdef(oid) AS definition
                  FROM pg_constraint WHERE confrelid = CAST(:oid AS oid)""", {"oid": oid}, problems)

        rep["role"] = (_q(db, """
            SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb,
                   (SELECT string_agg(g.rolname, ', ') FROM pg_auth_members m
                      JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid) AS member_of,
                   pg_has_role(current_user, r.oid, 'MEMBER') AS app_is_member
              FROM pg_roles r WHERE rolname = :r""", {"r": OWNER}, problems) or [None])[0]
        rep["sessions"] = _q(db, """
            SELECT usename, application_name, count(*) AS n,
                   min(backend_start) AS first_start, max(state_change) AS last_change
              FROM pg_stat_activity
             WHERE usename = :r
             GROUP BY 1, 2 ORDER BY 3 DESC""", {"r": OWNER}, problems)
        rep["owned"] = _q(db, """
            SELECT n.nspname AS schema, c.relname AS name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
                        WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                        WHEN 'S' THEN 'sequence' WHEN 'f' THEN 'foreign table'
                        ELSE c.relkind::text END AS kind,
                   c.reltuples::bigint AS est_rows,
                   pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
                   has_table_privilege(c.oid, 'SELECT') AS app_can_read
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE pg_get_userbyid(c.relowner) = :r AND c.relkind IN ('r','p','v','m','f','S')
             ORDER BY n.nspname, c.relname LIMIT 200""", {"r": OWNER}, problems)
        rep["triggers"] = _q(db, """
            SELECT tg.tgname AS trigger, tc.relname AS on_table, p.proname AS function
              FROM pg_trigger tg JOIN pg_class tc ON tc.oid = tg.tgrelid
              JOIN pg_proc p ON p.oid = tg.tgfoid
             WHERE NOT tg.tgisinternal
               AND (tc.relname = 'audit' OR p.prosrc ILIKE '%public.audit%' OR p.prosrc ILIKE '%into audit%')
             ORDER BY 2, 1""", problems=problems)

        rep["count"], rep["order_by"], rep["masked"] = None, None, []
        rep["row_columns"], rep["rows"], rep["profile"] = [], [], []
        rep["truncated"] = False
        if rep["audit"] and rep["audit"].get("can_read"):
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
                rows = ops_door.mask_rows(cols, raw[:MAX_ROWS], masked)
                rep["row_columns"], rep["rows"] = cols, rows
                rep["masked"] = sorted(masked)
                rep["profile"] = _profile(cols, rows, keys, set(masked))
            except Exception as exc:  # noqa: BLE001
                problems.append(f"SELECT * FROM public.audit → {type(exc).__name__}: "
                                f"{str(exc).splitlines()[0][:200]}")
    finally:
        db.rollback()
    return rep


# ── text ──────────────────────────────────────────────────────────────────────

def _fmt_num(x) -> str:
    return f"{x:g}" if isinstance(x, float) else str(x)


def _verdict(rep: dict) -> list[str]:
    """The three facts the KPI needs, as the data shows them."""
    prof = rep.get("profile") or []
    L = []
    cellish = sorted((p for p in prof if p.get("cells")),
                     key=lambda p: -p["cells"]["matched"] / max(p["cells"]["of_distinct"], 1))
    if cellish:
        p = cellish[0]
        c = p["cells"]
        L.append(f"WHICH CELL: «{p['column']}» — {c['matched']} of {c['of_distinct']} distinct values "
                 f"are our cells ({', '.join(f'{k} {n}' for k, n in c['how'].items())})")
    else:
        L.append("WHICH CELL: no column's values match our cells' codes")
    dated = [p for p in prof if p.get("from")]
    timed = [c["name"] for c in rep.get("columns") or [] if c.get("type") in _TIME_TYPES]
    if dated:
        p = dated[0]
        L.append(f"WHEN: «{p['column']}» {p['from']} → {p['to']} · "
                 f"{', '.join(f'{m}: {n}' for m, n in p['months'][-8:])}")
    elif timed:
        L.append(f"WHEN: date-typed columns {', '.join(timed)} (no values read)")
    else:
        L.append("WHEN: no date column")
    scores = [p for p in prof if "min" in p and p["column"].lower() not in ("id",)
              and p.get("distinct", 0) > 1 and not p.get("cells")]
    if scores:
        L.append("RESULT candidates: " + "; ".join(
            f"«{p['column']}» {_fmt_num(p['min'])}–{_fmt_num(p['max'])} (avg {_fmt_num(p['avg'])})"
            for p in scores[:6]))
    else:
        L.append("RESULT: no numeric column besides ids")
    return L


def text(rep: dict) -> str:
    L = [f"public.audit → «Texnologlar auditi»? — {rep['taken'].strftime('%d.%m.%Y %H:%M')} (Tashkent)"]
    d = rep.get("db") or {}
    if d:
        L.append(f"database {d.get('db')} · read as {d.get('usr')} · our cells: {rep.get('our_cells')}")
    a = rep.get("audit")
    L.append("")
    if not a:
        L.append("public.audit does NOT exist on production.")
    else:
        L.append(f"{a['kind']} · owner {a['owner']} · {a['size']} · ≈{a['est_rows']} rows "
                 f"(live {a.get('n_live_tup')}, inserted {a.get('n_tup_ins')}, updated {a.get('n_tup_upd')}, "
                 f"deleted {a.get('n_tup_del')} since stats reset)")
        L.append("this app MAY read it" if a.get("can_read")
                 else "this app may NOT read it — GRANT SELECT ON public.audit TO "
                      f"{d.get('usr') or 'safia_prod'}; is still needed, so no rows below")
        if a.get("comment"):
            L.append(f"comment: {a['comment']}")
        if rep["columns"]:
            L.append("")
            L.append("Columns:")
            for c in rep["columns"]:
                bits = [c["type"]]
                if c.get("not_null"):
                    bits.append("not null")
                if c.get("default_expr"):
                    bits.append(f"default {c['default_expr'][:60]}")
                line = f"· {c['name']} — {', '.join(bits)}"
                if c.get("comment"):
                    line += f" — «{c['comment'][:120]}»"
                L.append(line)
        if rep["constraints"]:
            L.append("Keys: " + " | ".join(f"{k['name']}: {k['definition'][:140]}" for k in rep["constraints"]))
        if rep["indexes"]:
            L.append("Indexes: " + " | ".join(i["definition"][:140] for i in rep["indexes"]))
        if rep.get("fks_in"):
            L.append("Referenced by: " + " | ".join(f"{f['from_table']}: {f['definition'][:120]}"
                                                     for f in rep["fks_in"]))
        if rep.get("viewdef"):
            L.append("View definition: " + " ".join(rep["viewdef"].split())[:1500])
        if rep["rows"]:
            more = f" (newest {MAX_ROWS:,} read)" if rep.get("truncated") else ""
            L.append("")
            L.append(f"Rows: {rep['count']:,}{more}" if isinstance(rep.get("count"), int)
                     else f"Rows read: {len(rep['rows']):,}{more}")
            L.append("")
            L.append("Fit for the KPI (one % per cell per month):")
            L.extend("· " + x for x in _verdict(rep))
            L.append("")
            L.append("Per column:")
            for p in rep["profile"]:
                line = f"· {p['column']}: {p['non_null']}/{p['rows']} filled"
                if p.get("note"):
                    line += f" · {p['note']}"
                else:
                    line += f" · {p.get('distinct')} distinct"
                    if "min" in p:
                        line += f" · {_fmt_num(p['min'])}…{_fmt_num(p['max'])}"
                    if p.get("from"):
                        line += f" · {p['from']} → {p['to']}"
                    if p.get("json_keys"):
                        line += " · keys " + ", ".join(k for k, _n in p["json_keys"][:12])
                    if p.get("top"):
                        line += " · e.g. " + "; ".join(f"{v} ×{n}" for v, n in p["top"][:4])
                L.append(line[:600])
            if rep["masked"]:
                L.append("masked as •••: " + ", ".join(rep["masked"][:20]))
    r = rep.get("role")
    L.append("")
    if r:
        L.append(f"Role {r['rolname']}: login {r['rolcanlogin']} · superuser {r['rolsuper']} · "
                 f"createrole {r['rolcreaterole']} · member of {r.get('member_of') or '—'} · "
                 f"this app is a member: {r.get('app_is_member')}")
    else:
        L.append(f"Role {OWNER}: not found")
    if rep.get("sessions"):
        L.append("Its sessions now: " + "; ".join(
            f"{s['usename']} · app «{s.get('application_name') or '—'}» ×{s['n']}" for s in rep["sessions"]))
    else:
        L.append("Its sessions now: none visible")
    owned = [o for o in rep.get("owned") or [] if not (o["schema"] == "public" and o["name"] == "audit")]
    if owned:
        L.append(f"Also owned by {OWNER} ({len(owned)}): " + ", ".join(
            f"{o['schema']}.{o['name']} ({o['kind']}, ≈{o['est_rows']})" for o in owned[:40]))
    if rep.get("triggers"):
        L.append("Triggers that write it: " + ", ".join(
            f"{t['on_table']}.{t['trigger']} → {t['function']}" for t in rep["triggers"][:15]))
    if rep["problems"]:
        L.append("")
        L.append("PROBLEMS: " + " | ".join(rep["problems"]))
    return "\n".join(L)


# ── workbook ──────────────────────────────────────────────────────────────────

def _cell(v):
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    if v is None or isinstance(v, (bool, int, float)):
        return v
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (dict, list, tuple)):
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
        _sheet(wb, "Rows", rep["row_columns"], rep["rows"][:FILE_ROWS])
    if rep["profile"]:
        keys = ["column", "rows", "non_null", "distinct", "min", "max", "avg", "from", "to",
                "months", "cells", "json_keys", "top", "note"]
        _sheet(wb, "Per column", keys, [[p.get(k) for k in keys] for p in rep["profile"]])
    if rep["columns"]:
        keys = ["n", "name", "type", "not_null", "default_expr", "comment"]
        _sheet(wb, "Columns", keys, [[c.get(k) for k in keys] for c in rep["columns"]])
    for title, key in (("Keys", "constraints"), ("Indexes", "indexes"), ("Sessions", "sessions"),
                       (f"Owned by {OWNER}"[:31], "owned"), ("Triggers", "triggers")):
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
    print("[startup] audit KPI fit report:\n" + body[:8000])
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
           "caption": "public.audit vs «Texnologlar auditi» — production's answer "
                      "(rows newest first; credentials as •••)."},
          files={"document": (f"public-audit-kpi-fit-{stamp}.xlsx", workbook(rep),
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    return len(chunks) + 1
