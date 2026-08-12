"""
Worker-concerns («Ishchi havotirlari») sheet sync.

Source of truth is the «Liderlar Havotirlar» workbook:

  * its «Liderlar» registry tab lists ~180 (brigadir, leader, cell) rows, each
    linking to that cell's OWN spreadsheet;
  * each per-cell spreadsheet holds the cell's concern rows WITH the per-row
    «Статус» column (To do / Doing / Done / O'tqazish). The master «Umumiy»
    tab carries no statuses at all, and the registry's IMPORTRANGE summaries
    are current-month aggregates that overwrite themselves — so the per-cell
    sheets are the only place a defensible resolution KPI can come from.

The crawl is wipe-and-replace PER SHEET (each sheet in its own transaction):
sheets are edited in place, so an append-only merge would keep stale copies,
and per-sheet commits mean a process death mid-crawl loses nothing — every
already-committed sheet stays consistent and the next run simply re-crawls.
A sheet that fails to read keeps its previous rows (counted, reported, never
silently dropped).

Two KPI-critical data facts baked in here (this feeds a real leaders' KPI):

  * per-cell sheets are PRE-SEEDED with thousands of template rows whose
    status is already "To do" — only rows with actual concern text count;
  * the sheets' own % / «Дата завершения» columns are broken (131%, years
    like 1912) — we import raw statuses and dates only, and compute every
    percentage ourselves at read time.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import date as date_cls, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import WorkerConcern, WorkerConcernSyncMeta
from app.services.sheets_reader import get_client

log = logging.getLogger(__name__)

# The «Liderlar Havotirlar» workbook and its registry tab (gid).
REGISTRY_SHEET_ID = "1NPjqekVKK8JsU8eT4iwqV_adf6XYYZzJsALeliiQQhw"
REGISTRY_TAB_GID = 2069492854

# Filing dates outside this window are typos (the form happily accepts 1912 or
# 2027). Rows keep their raw spelling and stay in people-keyed KPIs, but carry
# date=None so date-bound charts exclude them — and the sync counts them.
DATE_MIN = date_cls(2025, 9, 1)  # workbook was created 2025-09-23

# Pacing between sheet reads. The Sheets API allows ~60 reads/min per user;
# ~180 sheets at this pace is a 2–4 minute crawl, which is why it runs as a
# background thread with a progress feed rather than inside a request.
_SHEET_PAUSE = 0.4
_RATE_RETRIES = 3
_RATE_SLEEP = 30

# A refresh whose heartbeat is older than this is a dead process's claim and
# may be taken over.
STALE_AFTER = timedelta(minutes=3)

_thread_lock = threading.Lock()

# Normalized header → field. Headers are matched by NAME, never by offset —
# these sheets get reshuffled (see sheets_reader._shift_layout for the history
# of what fixed offsets do to a KPI).
_HDR_DATE = "дата заполнения"
_HDR_LEADER = "лидер"
_HDR_OWNER = "хавотир эгаси"
_HDR_TEXT = "хавотир"
_HDR_STATUS = "статус"

_DATE_RE = re.compile(r"^\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*$")

# Status vocabulary observed across the cell sheets. «O'tqazish» spelling
# wobbles between apostrophe forms and alphabets, hence the prefix match.
_DEFERRED_PREFIXES = ("o'tqaz", "o`tqaz", "o‘tqaz", "otqaz", "утказ", "ўтказ", "o'tkaz", "otkaz")


def _norm_hdr(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _norm_status(raw: str) -> tuple[str, str | None]:
    """→ (status, status_raw-or-None). Only "done" ever counts as resolved;
    an unknown label lands in "other" with its raw spelling kept, so a new
    sheet vocabulary shows up in the register instead of vanishing."""
    s = _norm_hdr(raw)
    if s in ("done", "выполнено", "bajarildi"):
        return "done", None
    if s in ("doing", "в работе", "jarayonda"):
        return "doing", None
    if s in ("", "to do", "todo", "to-do"):
        return "todo", None
    if any(s.startswith(p) for p in _DEFERRED_PREFIXES):
        return "deferred", None
    return "other", (raw or "").strip()


def _parse_date(raw: str, today: date_cls) -> str | None:
    m = _DATE_RE.match(raw or "")
    if not m:
        return None
    mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yr < 100:
        yr += 2000
    try:
        d = date_cls(yr, mo, dy)
    except ValueError:
        # The sheets are US-format (M/D/YYYY) but a hand-typed 22/12/2025 slips
        # in; try the swapped order before giving up.
        try:
            d = date_cls(yr, dy, mo)
        except ValueError:
            return None
    if not (DATE_MIN <= d <= today + timedelta(days=3)):
        return None
    return d.isoformat()


def _extract_sheet_id(link: str) -> str | None:
    m = re.search(r"/d/([A-Za-z0-9_-]{20,})", link or "")
    return m.group(1) if m else None


def read_registry(gc) -> list[dict]:
    """The «Liderlar» tab → one entry per linked cell sheet.

    Two registry rows pointing at the SAME spreadsheet would make the second
    wipe the first's rows (sheet_id is the wipe-replace key), so duplicates are
    folded onto the first row and logged rather than imported twice."""
    sh = gc.open_by_key(REGISTRY_SHEET_ID)
    ws = next((w for w in sh.worksheets() if w.id == REGISTRY_TAB_GID), None)
    if ws is None:
        raise RuntimeError(f"registry tab gid={REGISTRY_TAB_GID} not found")
    rows = ws.get_all_values()
    out, seen = [], set()
    for r in rows[2:]:  # rows 1–2 are the two-line header
        brigadir = (r[0] if len(r) > 0 else "").strip()
        leader = (r[1] if len(r) > 1 else "").strip()
        cell = (r[2] if len(r) > 2 else "").strip()
        sid = _extract_sheet_id(r[3] if len(r) > 3 else "")
        if not sid or not cell:
            continue
        if sid in seen:
            log.warning("worker-concerns registry: duplicate link for cell %s ignored", cell)
            continue
        seen.add(sid)
        out.append({"brigadir": brigadir, "leader": leader, "cell": cell, "sheet_id": sid})
    return out


def _read_cell_sheet(gc, entry: dict, today: date_cls) -> tuple[list[WorkerConcern], int]:
    """One per-cell spreadsheet → its concern rows. Returns (rows, invalid_dates)."""
    sub = gc.open_by_key(entry["sheet_id"])
    ws = sub.worksheets()[0]
    values = ws.get_all_values()

    hdr_i, cols = None, {}
    for i, row in enumerate(values[:10]):
        normed = [_norm_hdr(c) for c in row]
        if _HDR_TEXT in normed and _HDR_STATUS in normed:
            hdr_i = i
            for j, h in enumerate(normed):
                # Exact matches; «хавотир эгаси» must never be mistaken for the
                # text column, hence equality rather than substring tests.
                if h.startswith(_HDR_DATE) and "date" not in cols:
                    cols["date"] = j
                elif h == _HDR_LEADER and "leader" not in cols:
                    cols["leader"] = j
                elif h == _HDR_OWNER and "owner" not in cols:
                    cols["owner"] = j
                elif h == _HDR_TEXT and "text" not in cols:
                    cols["text"] = j
                elif h == _HDR_STATUS and "status" not in cols:
                    # FIRST «Статус» column is authoritative; the duplicate
                    # second one is sparser and disagrees on pre-seeded rows.
                    cols["status"] = j
            break
    if hdr_i is None or "text" not in cols:
        raise RuntimeError(f"cell {entry['cell']}: no header row with «Хавотир»+«Статус»")

    def cell_at(row: list, key: str) -> str:
        j = cols.get(key)
        return (row[j] if j is not None and j < len(row) else "").strip()

    out, invalid = [], 0
    for row in values[hdr_i + 1:]:
        text = cell_at(row, "text")
        if not text:
            continue  # pre-seeded template row (status already "To do", no concern)
        status, status_raw = _norm_status(cell_at(row, "status"))
        raw_date = cell_at(row, "date")
        iso = _parse_date(raw_date, today)
        if iso is None and raw_date:
            invalid += 1
        out.append(WorkerConcern(
            sheet_id=entry["sheet_id"],
            reg_cell=entry["cell"],
            reg_brigadir=entry["brigadir"],
            reg_leader=entry["leader"],
            row_leader=cell_at(row, "leader"),
            owner=cell_at(row, "owner"),
            text=text,
            date=iso,
            date_raw=raw_date or None,
            status=status,
            status_raw=status_raw,
        ))
    return out, invalid


def _get_meta(db: Session) -> WorkerConcernSyncMeta:
    meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
    if not meta:
        meta = WorkerConcernSyncMeta(id=1)
        db.add(meta)
        db.commit()
    return meta


def _claim(db: Session) -> bool:
    """Mark the singleton row running, refusing while a live crawl holds it."""
    meta = _get_meta(db)
    now = datetime.now(timezone.utc)
    if meta.running and meta.heartbeat and (now - meta.heartbeat) < STALE_AFTER:
        return False
    meta.running = True
    meta.started_at = now
    meta.heartbeat = now
    meta.progress_done = 0
    meta.progress_total = 0
    db.commit()
    return True


def run_sync() -> dict:
    """Crawl the registry + every per-cell sheet. Blocking (minutes) — call via
    :func:`start_sync_thread` or the scheduler, never from a request handler."""
    db = SessionLocal()
    try:
        if not _claim(db):
            return {"status": "already_running"}
        gc = get_client()
        today = datetime.now(timezone.utc).date()
        try:
            registry = read_registry(gc)
        except Exception as exc:
            meta = _get_meta(db)
            meta.running = False
            meta.ok = False
            meta.message = f"registry read failed: {exc}"[:500]
            db.commit()
            log.exception("worker-concerns sync: registry read failed")
            return {"status": "error", "detail": str(exc)}

        meta = _get_meta(db)
        meta.progress_total = len(registry)
        db.commit()

        invalid_total, failed = 0, []
        for i, entry in enumerate(registry, 1):
            rows = None
            for attempt in range(_RATE_RETRIES):
                try:
                    rows, invalid = _read_cell_sheet(gc, entry, today)
                    break
                except Exception as exc:
                    msg = str(exc)
                    # Quota answers (429 / RESOURCE_EXHAUSTED) deserve a pause
                    # and another try; anything else fails this sheet outright.
                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "Quota" in msg:
                        log.warning("worker-concerns sync: rate-limited on %s, retrying", entry["cell"])
                        time.sleep(_RATE_SLEEP)
                        continue
                    log.warning("worker-concerns sync: cell %s failed: %s", entry["cell"], msg)
                    break
            if rows is None:
                failed.append(entry["cell"])
            else:
                invalid_total += invalid
                # Wipe-and-replace THIS sheet only, one transaction — a crash
                # here leaves every other sheet's rows untouched and committed.
                db.query(WorkerConcern).filter(
                    WorkerConcern.sheet_id == entry["sheet_id"]).delete()
                db.add_all(rows)
            meta = _get_meta(db)
            meta.progress_done = i
            meta.heartbeat = datetime.now(timezone.utc)
            db.commit()
            time.sleep(_SHEET_PAUSE)

        total = db.query(WorkerConcern).count()
        meta = _get_meta(db)
        meta.running = False
        meta.last_synced = datetime.now(timezone.utc)
        meta.ok = not failed
        meta.row_count = total
        meta.invalid_dates = invalid_total
        meta.failed_sheets = len(failed)
        meta.message = (
            None if not failed
            else f"{len(failed)} sheet(s) kept previous rows: {', '.join(failed[:12])}"
                 + ("…" if len(failed) > 12 else "")
        )
        db.commit()
        log.info("worker-concerns sync: %s rows from %s sheets (%s failed, %s invalid dates)",
                 total, len(registry), len(failed), invalid_total)
        return {"status": "ok", "rows": total, "sheets": len(registry),
                "failed": len(failed), "invalid_dates": invalid_total}
    except Exception as exc:
        # Belt-and-braces: never leave the claim stuck on an unexpected error.
        try:
            db.rollback()
            meta = _get_meta(db)
            meta.running = False
            meta.ok = False
            meta.message = str(exc)[:500]
            db.commit()
        except Exception:
            pass
        log.exception("worker-concerns sync failed")
        return {"status": "error", "detail": str(exc)}
    finally:
        db.close()


def start_sync_thread() -> bool:
    """Kick a crawl in a daemon thread. False when one is already running
    (either this process's thread or another process's fresh DB claim)."""
    if not _thread_lock.acquire(blocking=False):
        return False

    def _run():
        try:
            run_sync()
        finally:
            _thread_lock.release()

    threading.Thread(target=_run, name="worker-concerns-sync", daemon=True).start()
    return True


def register_boot_jobs() -> None:
    """Nightly crawl + a one-shot initial crawl when the table is empty.

    Mirrored in passenger_wsgi.py like every other boot job. Skips entirely
    when the Google service-account key isn't on this machine (local dev) —
    same pattern as leader-ai declining to register without an API key."""
    if not os.path.exists(settings.google_credentials_file):
        log.info("worker-concerns: no Google credentials file, sync jobs not registered")
        return
    from apscheduler.triggers.cron import CronTrigger
    from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at

    try:
        get_scheduler().add_job(
            run_sync,
            trigger=CronTrigger(hour=3, minute=30, timezone=SCHEDULER_TZ),
            id="worker-concerns-nightly", replace_existing=True,
        )
    except Exception:
        log.exception("worker-concerns: could not register nightly sync")

    db = SessionLocal()
    try:
        empty = db.query(WorkerConcern.id).first() is None
        meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
        stale_claim = bool(
            meta and meta.running and meta.heartbeat
            and (datetime.now(timezone.utc) - meta.heartbeat) >= STALE_AFTER
        )
        if stale_claim:
            # The previous process died mid-crawl; release the claim so the
            # page's Refresh button isn't dead until someone notices.
            meta.running = False
            db.commit()
        if empty:
            schedule_at("worker-concerns-initial",
                        datetime.now(timezone.utc) + timedelta(seconds=90), run_sync)
            log.info("worker-concerns: table empty, initial sync scheduled")
    finally:
        db.close()
