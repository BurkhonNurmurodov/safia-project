"""The Google-sheet read behind «O'z vaqtida yetkazish» (`services/ontime.py`).

The logistics team keeps an «on time report» workbook: every day somebody pastes
the stores' SAP orders into «заявки» and the factory's SAP production receipts
into «поставка», and the «свод» tabs work out, per product and shipping wave,
how much of what was ordered was produced inside that wave's time window
(«заход»). The summary tabs only fill a day somebody typed into their header,
so the platform reads the RAW tabs and applies the formula itself — every day
the raw tabs hold is counted (the operator's call, 2026-10-20).

What is kept, replaced WHOLE by every complete read, in one transaction:

- `ontime_demand`   — Σ ordered quantity per order day × material × wave;
- `ontime_receipts` — Σ received quantity per entry day × second × material;
- `ontime_materials`— each material's name and group;
- `ontime_windows`  — each group's wave windows (start / end of the day).

Columns are found by their HEADER text (row 1), never by letter, so a column
the team inserts or moves does not break the read. Values are read UNFORMATTED:
a real date arrives as a serial number, a pasted one as text, and both parse.

The sheet is THE `SheetSource` named «ontime», set on the admin «Ma'lumotlar»
tab and shared (as Viewer) with the platform's Google service account. Read in
row chunks, paced under the Sheets API's per-minute quota, on a thread of its
own — every two hours from 07:20 to 23:20 Tashkent, ~4 minutes after a boot
whose last good read is older than two hours, and on an admin's button. A read
that finds no orders or no windows writes NOTHING: the page goes on showing the
last good read, and says the newest one failed.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import delete

from app.database import SessionLocal
from app.models import (
    OntimeDemand, OntimeMaterial, OntimeRead, OntimeReceipt, OntimeWindow, SheetSource,
)

log = logging.getLogger(__name__)

SOURCE = "ontime"
TAB_ORDERS = "заявки"
TAB_RECEIPTS = "поставка"
TAB_WAVES = "заход"

CHUNK = 40_000              # rows per Sheets request (~5 MB of JSON for «заявки»)
PAUSE_S = 1.2               # between requests: the API allows 60 reads/min per user
MAX_ROWS = 3_000_000        # a hard stop, far above the 1.2 M rows the sheet holds
BOOT_DELAY_S = 240
BOOT_IF_OLDER = timedelta(hours=2)
SCHEDULE_HOURS = "7-23/2"   # Tashkent; minute 20
SCHEDULE_MINUTE = 20
STALE_RUNNING = timedelta(minutes=30)
MAX_WAVE = 9

_lock = threading.Lock()


# ── when a read last happened ────────────────────────────────────────────────

def now_aware() -> datetime:
    return datetime.now(timezone.utc)


def sheet_id(db) -> Optional[str]:
    src = db.query(SheetSource).filter(SheetSource.name == SOURCE).first()
    sid = (src.sheet_id or "").strip() if src else ""
    return sid or None


def last_read(db, ok_only: bool = False) -> Optional[OntimeRead]:
    q = db.query(OntimeRead)
    if ok_only:
        q = q.filter(OntimeRead.ok.is_(True))
    return q.order_by(OntimeRead.id.desc()).first()


def running(db) -> bool:
    """A read in progress (here or in the other copy during a deploy). A row
    left open by a process that died is not a read in progress."""
    rd = last_read(db)
    if rd is None or rd.finished_at is not None:
        return False
    started = rd.started_at
    if started is None:
        return False
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return now_aware() - started < STALE_RUNNING


def read_state(db) -> dict:
    """What the page says about the data under it."""
    rd = last_read(db)
    ok = last_read(db, ok_only=True)
    return {
        "configured": sheet_id(db) is not None,
        "running": running(db),
        "last": _read_out(rd),
        "ok": _read_out(ok),
    }


def _read_out(rd: Optional[OntimeRead]) -> Optional[dict]:
    if rd is None:
        return None
    return {
        "started_at": rd.started_at.isoformat() if rd.started_at else None,
        "finished_at": rd.finished_at.isoformat() if rd.finished_at else None,
        "trigger": rd.trigger,
        "ok": rd.ok,
        "error": rd.error,
        "order_rows": rd.order_rows,
        "receipt_rows": rd.receipt_rows,
        "first_day": rd.first_day.isoformat() if rd.first_day else None,
        "last_day": rd.last_day.isoformat() if rd.last_day else None,
        "notes": rd.notes or {},
    }


# ── parsing the cells ────────────────────────────────────────────────────────

_EPOCH = date(1899, 12, 30)
_DMY = re.compile(r"^\s*(\d{1,2})[.\s/-](\d{1,2})[.\s/-](\d{2,4})\s*$")
_YMD = re.compile(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})")
_HMS = re.compile(r"^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?")
_WAVE = re.compile(r"(\d+)")


def _norm(s: Any) -> str:
    """A header, folded: «Кол-во в ЕИ ввода» == «Кол-вовЕИввода»."""
    return re.sub(r"[\s.\-_/]+", "", str(s or "")).lower().replace("ё", "е")


def parse_day(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        n = int(v)
        if 20_000 < n < 80_000:        # 1954 … 2119 — a serial, not a stray number
            return _EPOCH + timedelta(days=n)
        return None
    s = str(v).strip()
    m = _DMY.match(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    m = _YMD.match(s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def parse_secs(v: Any) -> Optional[int]:
    """A clock as seconds after midnight: a day fraction (0.5 = 12:00), the
    fractional part of a date-time serial, or «4:19:29» / «04:19»."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        if f < 0:
            return None
        frac = f - int(f) if f >= 1 else f
        return min(86_399, int(round(frac * 86_400)))
    m = _HMS.match(str(v))
    if not m:
        return None
    h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if h > 24 or mi > 59 or se > 59:
        return None
    return min(86_399, h * 3600 + mi * 60 + se)


def parse_qty(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_wave(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        n = int(v)
    else:
        m = _WAVE.search(str(v))
        if not m:
            return None
        n = int(m.group(1))
    return n if 1 <= n <= MAX_WAVE else None


def _text(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


# ── the sheet ────────────────────────────────────────────────────────────────

class SheetError(Exception):
    """A read that cannot go on — its code is what the page words."""
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def _col(i: int) -> str:
    """0-based column index → A1 letters."""
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _find_tab(sh, name: str):
    want = _norm(name)
    for ws in sh.worksheets():
        if _norm(ws.title) == want:
            return ws
    raise SheetError("no_tab", name)


def _call(fn, *a, **kw):
    """One Sheets request, retried through the per-minute quota (429) and a
    transient 5xx — never more than three times."""
    from gspread.exceptions import APIError
    for attempt in range(4):
        try:
            return fn(*a, **kw)
        except APIError as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(20 * (attempt + 1))
                continue
            if code == 403:
                raise SheetError("forbidden", str(exc)[:200]) from exc
            if code == 404:
                raise SheetError("not_found", str(exc)[:200]) from exc
            raise


def _headers(ws, wanted: dict[str, tuple[str, ...]]) -> dict[str, int]:
    """Row 1's columns for the fields named, by header text. A header matches
    when its folded text equals, or starts with, one of the field's names."""
    row = _call(ws.row_values, 1) or []
    folded = [_norm(h) for h in row]
    out: dict[str, int] = {}
    for field, names in wanted.items():
        for i, h in enumerate(folded):
            if h and any(h == n or h.startswith(n) for n in names):
                out[field] = i
                break
    return out


def _chunks(ws, cols: dict[str, int]):
    """The tab's rows from row 2 on, `CHUNK` at a time, as dicts of the fields
    asked for. Stops at the first empty chunk or the grid's last row."""
    lo, hi = min(cols.values()), max(cols.values())
    last = min(ws.row_count or MAX_ROWS, MAX_ROWS)
    start = 2
    while start <= last:
        end = min(start + CHUNK - 1, last)
        rng = f"{_col(lo)}{start}:{_col(hi)}{end}"
        vals = _call(ws.get, rng, value_render_option="UNFORMATTED_VALUE",
                     date_time_render_option="SERIAL_NUMBER")
        rows = list(vals or [])
        if not rows:
            return
        out = []
        for r in rows:
            out.append({f: (r[i - lo] if i - lo < len(r) else None) for f, i in cols.items()})
        yield out
        if len(rows) < end - start + 1:
            return
        start = end + 1
        time.sleep(PAUSE_S)


ORDER_COLS = {
    "day": ("датадокумента",),
    "material": ("материал",),
    "name": ("краткийтекст", "краткийтекстматериала"),
    "group": ("группаматериалов",),
    "qty": ("количествозаказа", "количествовзаказе", "колвозаказа"),
    "wave": ("заход",),
}
RECEIPT_COLS = {
    "material": ("материал",),
    "name": ("названиематериала", "краткийтекст"),
    "qty": ("колвовеиввода", "колвов", "количество"),
    "day": ("датаввода",),
    "time": ("времяввода",),
}


def read_orders(ws, notes: dict) -> tuple[dict, dict, int, Optional[date], Optional[date]]:
    cols = _headers(ws, ORDER_COLS)
    missing = [f for f in ("day", "material", "qty", "wave") if f not in cols]
    if missing:
        raise SheetError("no_columns", f"{TAB_ORDERS}: {', '.join(missing)}")
    demand: dict[tuple, list] = {}
    mats: dict[str, tuple[str, str]] = {}
    rows = 0
    skipped = {"no_day": 0, "no_material": 0, "no_qty": 0, "no_wave": 0}
    first = last = None
    for chunk in _chunks(ws, cols):
        for r in chunk:
            mat = _text(r.get("material"))
            if not mat:
                if any(v not in (None, "") for v in r.values()):
                    skipped["no_material"] += 1
                continue
            rows += 1
            d = parse_day(r.get("day"))
            if d is None:
                skipped["no_day"] += 1
                continue
            q = parse_qty(r.get("qty"))
            if q is None:
                skipped["no_qty"] += 1
                continue
            w = parse_wave(r.get("wave"))
            if w is None:
                skipped["no_wave"] += 1
                continue
            grp = _text(r.get("group"))
            name = _text(r.get("name"))
            k = (d, mat, w)
            a = demand.get(k)
            if a is None:
                demand[k] = [q, 1, grp]
            else:
                a[0] += q
                a[1] += 1
                if not a[2] and grp:
                    a[2] = grp
            if name or grp:
                old = mats.get(mat)
                mats[mat] = (name or (old[0] if old else ""), grp or (old[1] if old else ""))
            first = d if first is None or d < first else first
            last = d if last is None or d > last else last
    notes["orders_skipped"] = {k: v for k, v in skipped.items() if v}
    return demand, mats, rows, first, last


def read_receipts(ws, notes: dict, mats: dict) -> tuple[dict, int]:
    cols = _headers(ws, RECEIPT_COLS)
    missing = [f for f in ("material", "qty", "day", "time") if f not in cols]
    if missing:
        raise SheetError("no_columns", f"{TAB_RECEIPTS}: {', '.join(missing)}")
    rec: dict[tuple, float] = {}
    rows = 0
    skipped = {"no_day": 0, "no_time": 0, "no_qty": 0}
    for chunk in _chunks(ws, cols):
        for r in chunk:
            mat = _text(r.get("material"))
            if not mat:
                continue
            rows += 1
            d = parse_day(r.get("day"))
            if d is None:
                skipped["no_day"] += 1
                continue
            s = parse_secs(r.get("time"))
            if s is None:
                skipped["no_time"] += 1
                continue
            q = parse_qty(r.get("qty"))
            if q is None:
                skipped["no_qty"] += 1
                continue
            k = (d, s, mat)
            rec[k] = rec.get(k, 0.0) + q
            name = _text(r.get("name"))
            if name and mat not in mats:
                mats[mat] = (name, "")
    notes["receipts_skipped"] = {k: v for k, v in skipped.items() if v}
    return rec, rows


def read_windows(ws, notes: dict) -> list[dict]:
    """«заход» F:I — group · wave · start · end, one row each. The small table
    above them (пирог / сдоба / … with bare clocks) names no wave and is not a
    window, so it falls out on its own. A group-wave written twice keeps its
    FIRST row (the sheet's SUMIFS would have added the two clocks together)."""
    vals = _call(ws.get, "F1:I600", value_render_option="UNFORMATTED_VALUE",
                 date_time_render_option="SERIAL_NUMBER") or []
    out: list[dict] = []
    seen: set = set()
    dup: list[str] = []
    for i, r in enumerate(vals, start=1):
        r = list(r) + [None] * (4 - len(r))
        grp = _text(r[0])
        w = parse_wave(r[1]) if isinstance(r[1], str) and "№" in r[1] else None
        s, e = parse_secs(r[2]), parse_secs(r[3])
        if not grp or w is None or s is None or e is None:
            continue
        key = (grp.casefold(), w)
        if key in seen:
            dup.append(f"{grp} № {w}")
            continue
        seen.add(key)
        out.append({"grp": grp, "wave": w, "start_s": s, "end_s": e, "pos": i})
    if dup:
        notes["windows_duplicate"] = dup[:20]
    return out


# ── one read ─────────────────────────────────────────────────────────────────

def run_read(trigger: str) -> dict:
    """One complete read. Refuses while another read runs (this process or a
    second copy during a deploy). Never raises."""
    if not _lock.acquire(blocking=False):
        return {"started": False, "reason": "busy"}
    db = SessionLocal()
    rd = None
    try:
        if running(db):
            return {"started": False, "reason": "busy"}
        sid = sheet_id(db)
        if not sid:
            return {"started": False, "reason": "not_configured"}
        rd = OntimeRead(started_at=now_aware(), trigger=trigger[:120])
        db.add(rd)
        db.commit()
        rd_id = rd.id

        from app.services.sheets_reader import _reset_client, get_client
        notes: dict = {}
        try:
            sh = _call(get_client().open_by_key, sid)
            ws_w = _find_tab(sh, TAB_WAVES)
            windows = read_windows(ws_w, notes)
            if not windows:
                raise SheetError("no_windows", TAB_WAVES)
            demand, mats, order_rows, first, last = read_orders(_find_tab(sh, TAB_ORDERS), notes)
            if not demand:
                raise SheetError("no_orders", TAB_ORDERS)
            rec, receipt_rows = read_receipts(_find_tab(sh, TAB_RECEIPTS), notes, mats)
        except Exception:
            _reset_client()
            raise

        db.execute(delete(OntimeDemand))
        db.execute(delete(OntimeReceipt))
        db.execute(delete(OntimeMaterial))
        db.execute(delete(OntimeWindow))
        db.bulk_insert_mappings(OntimeDemand, [
            {"day": d, "material": m, "wave": w, "qty": a[0], "lines": a[1], "grp": a[2] or None}
            for (d, m, w), a in demand.items()
        ])
        db.bulk_insert_mappings(OntimeReceipt, [
            {"day": d, "sec": s, "material": m, "qty": q} for (d, s, m), q in rec.items()
        ])
        db.bulk_insert_mappings(OntimeMaterial, [
            {"material": m, "name": n or None, "grp": g or None} for m, (n, g) in mats.items()
        ])
        db.bulk_insert_mappings(OntimeWindow, windows)
        row = db.get(OntimeRead, rd_id)
        row.finished_at = now_aware()
        row.ok = True
        row.order_rows = order_rows
        row.receipt_rows = receipt_rows
        row.first_day = first
        row.last_day = last
        row.notes = notes
        db.commit()

        from app.services import ontime
        ontime.forget()
        from app.services import action_log
        action_log.record_system("sync_export", "sync.ontime_read", db=None, details=[
            ("trigger", trigger), ("orders", order_rows), ("receipts", receipt_rows),
            ("days", f"{first} … {last}"), ("windows", len(windows)),
        ])
        log.info("ontime: read %s orders, %s receipts (%s … %s)", order_rows, receipt_rows, first, last)
        return {"started": True, "ok": True, "orders": order_rows, "receipts": receipt_rows}
    except SheetError as exc:
        db.rollback()
        _fail(db, rd, exc.code + (f": {exc.detail}" if exc.detail else ""))
        return {"started": True, "ok": False, "error": exc.code}
    except Exception as exc:  # noqa: BLE001 — a background read must report, never die silently
        db.rollback()
        log.exception("ontime: read failed")
        _fail(db, rd, f"{type(exc).__name__}: {exc}"[:500])
        return {"started": True, "ok": False, "error": "error"}
    finally:
        db.close()
        _lock.release()


def _fail(db, rd: Optional[OntimeRead], error: str) -> None:
    if rd is None:
        return
    try:
        row = db.get(OntimeRead, rd.id)
        if row is not None:
            row.finished_at = now_aware()
            row.ok = False
            row.error = (error or "error")[:500]
            db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("ontime: could not record the failed read")


def start_read(trigger: str) -> bool:
    """The admin's button: a read on a thread of its own."""
    if _lock.locked():
        return False
    threading.Thread(target=run_read, args=(trigger,), name="ontime-read", daemon=True).start()
    return True


def _boot() -> None:
    db = SessionLocal()
    try:
        if not sheet_id(db):
            log.info("ontime: no sheet configured — no boot read")
            return
        ok = last_read(db, ok_only=True)
        fin = ok.finished_at if ok else None
        if fin is not None and fin.tzinfo is None:
            fin = fin.replace(tzinfo=timezone.utc)
        due = fin is None or now_aware() - fin > BOOT_IF_OLDER
    finally:
        db.close()
    if due:
        run_read("boot")


def _scheduled() -> None:
    db = SessionLocal()
    try:
        ok = sheet_id(db) is not None
    finally:
        db.close()
    if ok:
        run_read("schedule")


def register_jobs() -> None:
    """Every two hours 07:20 → 23:20 Tashkent, and a catch-up read after boot
    when the last good one is older than two hours. Mirrored in
    passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        get_scheduler().add_job(
            _scheduled,
            trigger=CronTrigger(hour=SCHEDULE_HOURS, minute=SCHEDULE_MINUTE, timezone=SCHEDULER_TZ),
            id="ontime-read", replace_existing=True)
        schedule_at("ontime-boot", datetime.now(timezone.utc) + timedelta(seconds=BOOT_DELAY_S), _boot)
        log.info("ontime: jobs registered (every 2 h from 07:20)")
    except Exception:  # noqa: BLE001
        log.exception("ontime: could not register the jobs")
