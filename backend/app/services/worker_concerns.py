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

The crawl is INCREMENTAL by default: one Drive-metadata sweep (a separate,
far larger quota than Sheets reads) fetches every sheet's ``modifiedTime``,
and a sheet still at the modifiedTime of its last successful crawl is skipped
outright — the usual refresh touches a handful of sheets and finishes in
seconds, and a crawl that dies mid-run resumes almost for free because the
sheets it already committed carry fresh baselines. ``full=True`` (the nightly
job) re-reads everything regardless, as a safety net against the baseline
ever drifting; if Drive is unreachable (API not enabled, scope refused) the
sweep degrades to crawling everything — never to failing or skipping.

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

import gspread
from google.oauth2.service_account import Credentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import WorkerConcern, WorkerConcernSheetState, WorkerConcernSyncMeta

log = logging.getLogger(__name__)

# The «Liderlar Havotirlar» workbook and its registry tab (gid).
REGISTRY_SHEET_ID = "1NPjqekVKK8JsU8eT4iwqV_adf6XYYZzJsALeliiQQhw"
REGISTRY_TAB_GID = 2069492854

# Filing dates outside this window are typos (the form happily accepts 1912 or
# 2027). Rows keep their raw spelling and stay in people-keyed KPIs, but carry
# date=None so date-bound charts exclude them — and the sync counts them.
DATE_MIN = date_cls(2025, 9, 1)  # workbook was created 2025-09-23

# Pacing. Each CRAWLED sheet costs exactly ONE Sheets-API read (the sheet-less
# values_get in _read_cell_sheet; open_by_key + worksheets() used to burn two
# extra metadata reads per sheet) and the per-user quota is ~60 reads/min;
# 1.2s between sheets keeps a full crawl at ~50 reads/min — under the quota
# with margin (the first prod run at 0.4s hit sustained 429s from mid-crawl
# on). Full crawl of ~180 sheets ≈ 4–5 min; the usual incremental refresh
# crawls only the sheets whose Drive modifiedTime moved and finishes in
# seconds. Still a background thread with a progress feed either way.
_SHEET_PAUSE = 1.2
_RATE_RETRIES = 4
_RATE_SLEEP = 65          # quota windows are per-minute — sleep past a full one
# Every HTTP call gets a hard timeout: gspread ships with NONE, and one stalled
# socket froze the first prod crawl mid-run with the progress counter standing
# still. A timed-out sheet is retried, then failed and skipped — never hung on.
_HTTP_TIMEOUT = 60

# A refresh whose heartbeat is older than this is a dead process's claim and
# may be taken over. Backoff sleeps above touch the heartbeat first, so a live
# crawl waiting out a quota window never looks dead.
STALE_AFTER = timedelta(minutes=3)

# Errors worth retrying: quota answers and transient transport failures.
# Anything else fails the sheet immediately (kept rows stay, sheet is counted).
_RETRYABLE = ("429", "RESOURCE_EXHAUSTED", "Quota", "quota",
              "timed out", "timeout", "Connection", "connection")

# Failure cause → a code the page turns into a sentence in the viewer's own
# language. Classified HERE because the raw Google error is an English (often
# HTML) blob that no brigadir can act on, while the cause maps onto exactly one
# thing to go and do: fix the tab, re-share the sheet, fix the registry link.
# First match wins, so the specific patterns precede the generic ones.
_FAILURE_CODES = (
    # Our own header check — the sheet was READ fine, its first visible tab just
    # isn't a concerns tab (renamed header, rows above it, or a new first tab).
    ("header",     ("no header row",)),
    ("permission", ("PERMISSION_DENIED", "403", "does not have permission",
                    "The caller does not have permission")),
    ("missing",    ("404", "not found", "NOT_FOUND", "Requested entity was not found",
                    "SpreadsheetNotFound")),
    ("quota",      ("429", "RESOURCE_EXHAUSTED", "Quota", "quota")),
    ("network",    ("timed out", "timeout", "Connection", "connection", "SSL",
                    "500", "502", "503")),
)


def _classify_failure(msg: str) -> str:
    for code, needles in _FAILURE_CODES:
        if any(n in msg for n in needles):
            return code
    return "other"


_thread_lock = threading.Lock()


def _crawl_client() -> gspread.Client:
    """A DEDICATED gspread client for the crawl, with a per-request timeout.

    Deliberately not the shared ``sheets_reader.get_client()``: setting a
    timeout there would silently change every other sheet sync's behavior,
    and this crawl is the only minutes-long, hundreds-of-requests consumer."""
    creds = Credentials.from_service_account_file(
        settings.google_credentials_file,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            # Drive METADATA only — each sheet's modifiedTime, so an unchanged
            # sheet can be skipped without spending a Sheets read on it.
            "https://www.googleapis.com/auth/drive.metadata.readonly",
        ],
    )
    gc = gspread.authorize(creds)
    gc.set_timeout(_HTTP_TIMEOUT)
    return gc

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
    """One per-cell spreadsheet → its concern rows. Returns (rows, invalid_dates).

    ONE values read per sheet: a sheet-less A1 range addresses the first
    VISIBLE tab directly, where open_by_key + worksheets()[0] burned two extra
    metadata reads per sheet — 3× the Sheets quota for the same values. The
    trade: worksheets()[0] counted hidden tabs too, so if a cell sheet ever
    hides its first tab the header check below fails loudly and the sheet is
    reported as failed rather than silently misread."""
    resp = gc.http_client.values_get(entry["sheet_id"], "A1:ZZ")
    # values.get trims trailing empty cells/rows (get_all_values padded them);
    # the index-guarded cell_at below is already ragged-row-safe.
    values = resp.get("values", [])

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


_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"


def _drive_modified_times(gc, sheet_ids: list[str], touch) -> dict[str, str] | None:
    """sheet_id → current Drive ``modifiedTime`` for every reachable sheet.

    Drive metadata is a SEPARATE (and far larger) quota than Sheets reads, so
    asking "which of the ~180 sheets changed?" costs one or two listing calls
    instead of 180 paced Sheets reads. Sheets the listing can't see (link-
    shared rather than shared with the service account) are fetched one by
    one — quick, and still off the Sheets quota. An id that stays unresolved
    is simply absent from the map, which the caller treats as "changed".

    Returns None when Drive is unavailable altogether (API not enabled on the
    project, scope refused, network down) — the caller then crawls everything,
    i.e. exactly the pre-incremental behavior. This sweep must only ever make
    the sync cheaper, never fail it and never skip a sheet on a guess."""
    times: dict[str, str] = {}
    try:
        page_token = None
        while True:
            params = {
                "q": "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                "fields": "nextPageToken,files(id,modifiedTime)",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            data = gc.http_client.request("get", _DRIVE_FILES_URL, params=params).json()
            for f in data.get("files", []):
                if f.get("modifiedTime"):
                    times[f["id"]] = f["modifiedTime"]
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    except Exception as exc:
        log.warning("worker-concerns sync: Drive sweep unavailable (%s) — crawling all sheets",
                    str(exc)[:200])
        return None
    missing = [sid for sid in sheet_ids if sid not in times]
    for i, sid in enumerate(missing, 1):
        try:
            data = gc.http_client.request(
                "get", f"{_DRIVE_FILES_URL}/{sid}",
                params={"fields": "modifiedTime", "supportsAllDrives": "true"}).json()
            if data.get("modifiedTime"):
                times[sid] = data["modifiedTime"]
        except Exception:
            pass  # stays absent → crawled this run, asked about again next run
        if i % 25 == 0:
            touch()  # keep the claim's heartbeat fresh through a long fallback loop
    return times


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


def run_sync(full: bool = False) -> dict:
    """Crawl the registry + the per-cell sheets that changed since their last
    successful crawl (EVERY sheet when ``full`` — the nightly safety net).
    Blocking (seconds to a few minutes) — call via :func:`start_sync_thread`
    or the scheduler, never from a request handler."""
    db = SessionLocal()
    try:
        if not _claim(db):
            return {"status": "already_running"}
        gc = _crawl_client()
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

        def _touch():
            """Keep the claim visibly alive — called before every long sleep so
            a crawl waiting out a quota window is never mistaken for a dead one
            (and taken over, doubling the crawl)."""
            m = _get_meta(db)
            m.heartbeat = datetime.now(timezone.utc)
            db.commit()

        # One Drive-metadata sweep decides what actually needs crawling. The
        # sweep runs even for full=True so every successful crawl refreshes
        # its baseline; ``full`` only disables the skip decision below.
        mtimes = _drive_modified_times(gc, [e["sheet_id"] for e in registry], _touch)
        baseline: dict[str, str | None] = {}
        if mtimes is not None:
            baseline = {s.sheet_id: s.modified_time
                        for s in db.query(WorkerConcernSheetState).all()}

        to_crawl, skipped = [], 0
        for entry in registry:
            mt = (mtimes or {}).get(entry["sheet_id"])
            entry["mtime"] = mt
            # Skip only on positive proof: a known current revision equal to
            # the revision whose rows are already committed. No Drive answer,
            # no baseline row, or any mismatch → the sheet is crawled.
            if not full and mt and baseline.get(entry["sheet_id"]) == mt:
                skipped += 1
            else:
                to_crawl.append(entry)

        meta = _get_meta(db)
        meta.progress_total = len(to_crawl)
        db.commit()

        invalid_total, failures = 0, []
        for i, entry in enumerate(to_crawl, 1):
            rows, err = None, ""
            for attempt in range(_RATE_RETRIES):
                try:
                    rows, invalid = _read_cell_sheet(gc, entry, today)
                    break
                except Exception as exc:
                    msg = err = str(exc)
                    # Quota answers and transient transport errors (incl. the
                    # per-request timeout) deserve a pause and another try;
                    # anything else fails this sheet outright.
                    if any(t in msg for t in _RETRYABLE) and attempt < _RATE_RETRIES - 1:
                        log.warning("worker-concerns sync: retryable error on %s (%s), waiting %ss",
                                    entry["cell"], msg[:120], _RATE_SLEEP)
                        _touch()
                        time.sleep(_RATE_SLEEP)
                        continue
                    log.warning("worker-concerns sync: cell %s failed: %s", entry["cell"], msg[:300])
                    break
            if rows is None:
                # The cell alone was never actionable — carry the classified
                # cause and the raw text, since the log this used to be the only
                # copy of lives on the server, out of reach of the page.
                failures.append({
                    "cell": entry["cell"],
                    "sheet_id": entry["sheet_id"],
                    "code": _classify_failure(err),
                    "detail": err[:300],
                })
            else:
                invalid_total += invalid
                # Wipe-and-replace THIS sheet only, one transaction — a crash
                # here leaves every other sheet's rows untouched and committed.
                db.query(WorkerConcern).filter(
                    WorkerConcern.sheet_id == entry["sheet_id"]).delete()
                db.add_all(rows)
                if entry["mtime"] is not None:
                    # The skip baseline rides in the SAME transaction as the
                    # rows: a stored modifiedTime always means "the committed
                    # rows are exactly this revision". Sweep-time is stamped
                    # (not re-fetched), so an edit landing mid-crawl reads as
                    # a mismatch next run — the safe direction.
                    db.merge(WorkerConcernSheetState(
                        sheet_id=entry["sheet_id"], modified_time=entry["mtime"],
                        crawled_at=datetime.now(timezone.utc)))
            meta = _get_meta(db)
            meta.progress_done = i
            meta.heartbeat = datetime.now(timezone.utc)
            db.commit()
            if i < len(to_crawl):
                time.sleep(_SHEET_PAUSE)

        total = db.query(WorkerConcern).count()
        meta = _get_meta(db)
        meta.running = False
        meta.last_synced = datetime.now(timezone.utc)
        meta.ok = not failures
        meta.row_count = total
        meta.invalid_dates = invalid_total
        meta.failed_sheets = len(failures)
        meta.failures = failures or None
        # The page renders ``failures`` itself, cause and all; this stays the
        # plain-language fallback for anything that only has the string. Naming
        # the cells AFTER the word "cells" so a lone code («4613») can no longer
        # be read as a row count, which is what the old wording did.
        cells = ", ".join(f["cell"] for f in failures[:12])
        meta.message = (
            None if not failures
            else f"{len(failures)} sheet(s) could not be re-read and still show "
                 f"earlier data — cells: {cells}" + ("…" if len(failures) > 12 else "")
        )
        db.commit()
        log.info("worker-concerns sync: %s rows from %s sheets (%s crawled, %s skipped unchanged, "
                 "%s failed, %s invalid dates)",
                 total, len(registry), len(to_crawl), skipped, len(failures), invalid_total)
        return {"status": "ok", "rows": total, "sheets": len(registry),
                "crawled": len(to_crawl), "skipped": skipped,
                "failed": len(failures), "invalid_dates": invalid_total}
    except Exception as exc:
        # Belt-and-braces: never leave the claim stuck on an unexpected error.
        try:
            db.rollback()
            meta = _get_meta(db)
            meta.running = False
            meta.ok = False
            meta.message = str(exc)[:500]
            # The run died wholesale (no registry, no client): the previous
            # run's per-sheet list describes sheets this run never opened, so
            # keeping it would blame cells for a failure that wasn't theirs.
            meta.failures = None
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
            # Nightly is the FULL crawl — the safety net that re-reads every
            # sheet so the incremental baselines can never drift unnoticed.
            kwargs={"full": True},
            id="worker-concerns-nightly", replace_existing=True,
        )
    except Exception:
        log.exception("worker-concerns: could not register nightly sync")

    db = SessionLocal()
    try:
        empty = db.query(WorkerConcern.id).first() is None
        meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
        if meta and meta.running:
            # Whatever crawl the previous process was running died with it —
            # release the claim so the page's Refresh button isn't dead.
            meta.running = False
            db.commit()
        # Catch-up crawl when the FIRST crawl never completed (empty table, or
        # a mid-crawl death left rows but no last_synced). A crawl that died
        # after at least one full success is left to the nightly job — data is
        # stale but usable, and re-crawling on every deploy would thrash.
        if empty or not (meta and meta.last_synced):
            schedule_at("worker-concerns-initial",
                        datetime.now(timezone.utc) + timedelta(seconds=90), run_sync)
            log.info("worker-concerns: no completed sync yet, catch-up crawl scheduled")
    finally:
        db.close()
