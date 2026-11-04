"""«Audit jadvali» (/audit) — the `public.audit` table, read-only, admins only.

No model of this platform creates `public.audit`: something outside this
codebase writes it (a database tool, IT, another app sharing the database), so
nothing here knows its columns in advance. Every answer is built from the
catalog at request time — the columns, their types, the primary key, the column
that says WHEN — and the page draws whatever the table holds.

Read-only by construction: every request runs in a READ ONLY transaction with
statements bounded at 20 s (`database.allow_long`). Values pass through the
report door's masking (`ops_door.mask_rows`), so a column or value shaped like
a credential reads •••, and the search never looks inside such a column (a
search would otherwise reveal a masked value one character at a time).

Admins only (`verify_admin` on every route), never grantable: the page is an
`adminOnly` Laboratory row behind `RequireAdmin`.
"""
from __future__ import annotations

import io
import json
import re
from datetime import date, datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import allow_long, get_db
from app.routers.admin import verify_admin
from app.services import action_log, ops_door
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/audit-table", tags=["audit-table"])

SCHEMA, TABLE = "public", "audit"
TZ = ZoneInfo("Asia/Tashkent")
PAGE_SIZES = (25, 50, 100, 200)
MAX_PAGE = 10_000
CELL_CAP = 500             # one value in the table; the row's own view is whole
EXPORT_MAX = 20_000        # rows in one workbook
EXPORT_CELL_CAP = 5_000    # one value in the workbook (Excel stops at 32,767)
STATEMENT_MS = 20_000
_TIME_HINTS = ("created", "time", "date", "_at", "stamp", "when", "ts")

_KIND = {"r": "table", "p": "table", "v": "view", "m": "view", "f": "foreign"}


def _q(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _read_only(db: Session) -> None:
    db.execute(text("SET TRANSACTION READ ONLY"))
    allow_long(db, STATEMENT_MS)


def _kind_of(fmt: str, cat: str) -> str:
    f = (fmt or "").lower()
    if f.startswith("timestamp") and "with time zone" in f:
        return "timestamptz"
    if f.startswith("timestamp"):
        return "timestamp"
    if f == "date":
        return "date"
    if f in ("json", "jsonb"):
        return "json"
    if cat == "N":
        return "number"
    if cat == "B":
        return "bool"
    return "text"


def _meta(db: Session) -> dict:
    rel = db.execute(text("""
        SELECT c.oid::bigint AS oid, c.relkind AS relkind,
               pg_get_userbyid(c.relowner) AS owner, c.reltuples::bigint AS est_rows,
               pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
               obj_description(c.oid, 'pg_class') AS comment,
               has_table_privilege(c.oid, 'SELECT') AS can_read
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = :s AND c.relname = :t"""), {"s": SCHEMA, "t": TABLE}).mappings().first()
    db_user = db.execute(text("SELECT current_user")).scalar()
    if not rel:
        return {"exists": False, "schema": SCHEMA, "table": TABLE, "db_user": db_user}
    cols = db.execute(text("""
        SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
               t.typcategory AS cat, NOT a.attnotnull AS nullable
          FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
         WHERE a.attrelid = :oid AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum"""), {"oid": rel["oid"]}).mappings().all()
    pk = [r[0] for r in db.execute(text("""
        SELECT a.attname FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = :oid AND i.indisprimary"""), {"oid": rel["oid"]})]
    columns = [{"name": c["name"], "type": c["type"], "kind": _kind_of(c["type"], c["cat"]),
                "nullable": bool(c["nullable"]), "secret": ops_door.secret_name(c["name"])}
               for c in cols]
    times = [c for c in columns if c["kind"] in ("timestamptz", "timestamp", "date")]
    time_col = next((c["name"] for c in times if any(h in c["name"].lower() for h in _TIME_HINTS)),
                    times[0]["name"] if times else None)
    pk_col = pk[0] if len(pk) == 1 else None
    default = time_col or pk_col
    return {
        "exists": True, "schema": SCHEMA, "table": TABLE,
        "kind": _KIND.get(rel["relkind"], rel["relkind"]),
        "owner": rel["owner"], "size": rel["size"], "comment": rel["comment"],
        "est_rows": max(int(rel["est_rows"] or 0), 0), "can_read": bool(rel["can_read"]),
        # The account the app connects as — what a GRANT must name when it may not read.
        "db_user": db_user,
        "columns": columns, "pk": pk_col, "time_column": time_col,
        "default_sort": {"key": default, "dir": "desc"} if default else None,
    }


def _value(v, cap: Optional[int]):
    """A database value as JSON carries it: a moment on the plant's clock,
    everything else through the report door's own conversion."""
    if isinstance(v, datetime) and v.tzinfo is not None:
        v = v.astimezone(TZ).replace(tzinfo=None)
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds")
    out = ops_door.plain(v)
    if cap and isinstance(out, str) and len(out) > cap:
        return out[:cap] + "…"
    return out


def _cut(v, cap: int):
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False, default=str)
    if isinstance(v, str) and len(v) > cap:
        return v[:cap] + "…"
    return v


def _like(q: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", q) + "%"


def _where(meta: dict, q: str, date_from: Optional[date], date_to: Optional[date]):
    """The filter, shared by the page, its count and the export."""
    parts, params = [], {}
    cols = meta["columns"]
    q = (q or "").strip()
    if q:
        searchable = [c["name"] for c in cols if not c["secret"]]
        if searchable:
            parts.append("concat_ws(' ', " + ", ".join(f"t.{_q(n)}::text" for n in searchable)
                         + ") ILIKE :q ESCAPE '\\'")
            params["q"] = _like(q)
    tc = meta.get("time_column")
    if tc and (date_from or date_to):
        kind = next(c["kind"] for c in cols if c["name"] == tc)
        col = f"t.{_q(tc)}"
        if date_from:
            params["df"] = date_from
            parts.append(f"{col} >= :df" if kind == "date" else
                         f"{col} >= (CAST(:df AS date)::timestamp AT TIME ZONE 'Asia/Tashkent')"
                         if kind == "timestamptz" else f"{col} >= CAST(:df AS date)::timestamp")
        if date_to:
            params["dt"] = date_to + timedelta(days=1)
            parts.append(f"{col} < :dt" if kind == "date" else
                         f"{col} < (CAST(:dt AS date)::timestamp AT TIME ZONE 'Asia/Tashkent')"
                         if kind == "timestamptz" else f"{col} < CAST(:dt AS date)::timestamp")
    return (" WHERE " + " AND ".join(parts)) if parts else "", params


def _order(meta: dict, sort: Optional[str], dir_: str) -> str:
    names = {c["name"] for c in meta["columns"]}
    key = sort if sort in names else (meta.get("default_sort") or {}).get("key")
    if not key:
        return ""
    d = "ASC" if (dir_ or "").lower() == "asc" else "DESC"
    tail = f", t.{_q(meta['pk'])} {d}" if meta.get("pk") and meta["pk"] != key else ""
    return f" ORDER BY t.{_q(key)} {d} NULLS LAST{tail}"


def _select(db: Session, meta: dict, where: str, params: dict, order: str,
            limit: int, offset: int, cap: Optional[int]):
    res = db.execute(text(f"SELECT * FROM {_q(SCHEMA)}.{_q(TABLE)} t{where}{order} "
                          f"LIMIT :lim OFFSET :off"), {**params, "lim": limit, "off": offset})
    names = [str(k) for k in res.keys()]
    raw = [[_value(v, cap) for v in r] for r in res.fetchall()]
    masked: set = set()
    rows = ops_door.mask_rows(names, raw, masked)
    return names, rows, sorted(masked)


def _require(meta: dict) -> None:
    if not meta["exists"]:
        raise HTTPException(404, {"code": "missing", "message": "public.audit does not exist"})
    if not meta["can_read"]:
        raise HTTPException(403, {"code": "no_read", "message": "the app may not read public.audit",
                                  "owner": meta["owner"]})


@router.get("/meta")
def get_meta(payload: dict = Depends(verify_admin), db: Session = Depends(get_db)):
    """What `public.audit` is: whether it exists, its columns and their kinds,
    the column a period applies to, the default order."""
    _read_only(db)
    try:
        return _meta(db)
    finally:
        db.rollback()


@router.get("/rows")
def get_rows(
    page: int = Query(1, ge=1, le=MAX_PAGE),
    size: int = Query(50),
    q: str = Query("", max_length=200),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort: Optional[str] = None,
    dir: str = Query("desc"),
    payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """One page of the table, the filter applied, newest first by default.
    `total` is the exact count under the filter, or None (with `est_rows`)
    when counting did not finish inside the statement limit."""
    if size not in PAGE_SIZES:
        size = 50
    _read_only(db)
    try:
        meta = _meta(db)
        _require(meta)
        where, params = _where(meta, q, date_from, date_to)
        order = _order(meta, sort, dir)
        names, rows, masked = _select(db, meta, where, params, order,
                                      size, (page - 1) * size, CELL_CAP)
        rows = [[_cut(v, CELL_CAP) for v in r] for r in rows]
        total = None
        try:
            with db.begin_nested():
                total = db.execute(text(f"SELECT count(*) FROM {_q(SCHEMA)}.{_q(TABLE)} t{where}"),
                                   params).scalar()
        except Exception:  # noqa: BLE001 — a count past the limit is not an error
            total = None
        return {"columns": names, "rows": rows, "masked": masked, "page": page, "size": size,
                "total": total, "est_rows": meta["est_rows"], "cap": CELL_CAP}
    finally:
        db.rollback()


@router.get("/row")
def get_row(key: str = Query(..., max_length=500), payload: dict = Depends(verify_admin),
            db: Session = Depends(get_db)):
    """One row WHOLE, by its primary key (a table with none is read from its
    page, where long values are cut)."""
    _read_only(db)
    try:
        meta = _meta(db)
        _require(meta)
        if not meta["pk"]:
            raise HTTPException(409, {"code": "no_pk", "message": "public.audit has no single-column primary key"})
        names, rows, masked = _select(db, meta, f" WHERE t.{_q(meta['pk'])}::text = :k", {"k": key},
                                      "", 1, 0, None)
        if not rows:
            raise HTTPException(404, {"code": "gone", "message": "the row is no longer there"})
        return {"columns": names, "row": rows[0], "masked": masked}
    finally:
        db.rollback()


class ExportBody(BaseModel):
    q: str = Field("", max_length=200)
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    sort: Optional[str] = None
    dir: str = "desc"
    columns: List[str] = Field(default_factory=list, max_length=500)   # visible, in screen order
    title: str = Field("public.audit", max_length=200)
    scope: str = Field("", max_length=500)
    prepared: str = Field("", max_length=100)


@router.post("/export.xlsx")
def export_xlsx(body: ExportBody, request: Request, payload: dict = Depends(verify_admin),
                db: Session = Depends(get_db)):
    """The filtered rows in the screen's column order, ≤ EXPORT_MAX."""
    from openpyxl import Workbook
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    from openpyxl.styles import Alignment, Font, PatternFill

    _read_only(db)
    try:
        meta = _meta(db)
        _require(meta)
        where, params = _where(meta, body.q, body.date_from, body.date_to)
        order = _order(meta, body.sort, body.dir)
        names, rows, masked = _select(db, meta, where, params, order,
                                      EXPORT_MAX + 1, 0, EXPORT_CELL_CAP)
    finally:
        db.rollback()
    cut = len(rows) > EXPORT_MAX
    rows = rows[:EXPORT_MAX]
    keep = [n for n in body.columns if n in names] or names
    idx = [names.index(n) for n in keep]

    def cell(v):
        if v is None or isinstance(v, (bool, int, float)):
            return v
        v = _cut(v, EXPORT_CELL_CAP)
        return ILLEGAL_CHARACTERS_RE.sub("", str(v))

    wb = Workbook()
    ws = wb.active
    ws.title = "audit"
    ws.append([cell(body.title or "public.audit")])
    ws["A1"].font = Font(bold=True, size=14)
    meta_line = " · ".join(x for x in (body.scope, body.prepared) if x)
    ws.append([cell(meta_line)])
    ws["A2"].font = Font(color="666666", size=10)
    ws.append([])
    ws.append(keep)
    for c in ws[4]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="C8973F")
        c.alignment = Alignment(vertical="center")
    for r in rows:
        ws.append([cell(r[i]) for i in idx])
    if cut:
        ws.append([])
        ws.append([f"… first {EXPORT_MAX:,} rows of more"])
    ws.freeze_panes = "A5"
    for i, n in enumerate(keep, start=1):
        sample = [len(str(r[idx[i - 1]] or "")) for r in rows[:300]]
        ws.column_dimensions[ws.cell(row=4, column=i).column_letter].width = \
            min(max([len(n)] + [min(s, 60) for s in sample]) + 2, 62)
    buf = io.BytesIO()
    wb.save(buf)
    action_log.enrich(rows=len(rows), columns=len(keep), cut=cut, masked=masked)
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    return deliver_xlsx(request, payload, f"public-audit-{stamp}.xlsx", buf.getvalue(),
                        caption=body.title or "public.audit")
