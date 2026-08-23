"""
ARC service-ticket mirror (page /arc).

The ARC API (services/arc_client.py) is walked page by page and every ticket
is UPSERTED on its uuid — the API carries no updated_at, so there is nothing
to diff against and every walk re-writes every row it sees. Two passes:

  * **quick** — the first QUICK_MAX_PAGES pages (newest tickets first, which
    is where anything that changes lives), every INTERVAL_MIN minutes;
  * **full** — every page, nightly at 03:15 and on the page's Refresh. Only a
    full walk that actually FINISHED may declare rows «missing» (the API
    stopped returning them): a quick pass cannot tell "gone" from "further
    down than I looked", so it never touches ``missing_since``.

Same shape as the worker-concerns crawl (thread + DB claim + heartbeat +
scheduler): each page commits on its own, so a process death mid-walk loses
nothing already written and the next pass simply walks again; the claim's
heartbeat is what makes a dead pass takeover-able instead of a permanent
«running» that leaves the Refresh button dead.

Nothing here logs or stores a credential — see the client module.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ArcRequest, ArcSyncMeta
from app.services import action_log, arc_client, arc_discovery
from app.services.arc_client import ArcAuthError, ArcTransientError, configured

log = logging.getLogger(__name__)

# A pass whose heartbeat is older than this is a dead process's claim and may
# be taken over.
STALE_AFTER = timedelta(minutes=3)
# The quick pass reads this many pages from the top and stops.
QUICK_MAX_PAGES = 30
# Quick-pass cadence.
INTERVAL_MIN = 15
# The stored openapi document is refreshed when older than this.
SPEC_MAX_AGE = timedelta(days=7)

_thread_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_meta(db: Session) -> ArcSyncMeta:
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    if not meta:
        meta = ArcSyncMeta(id=1)
        db.add(meta)
        db.commit()
    return meta


def _live(meta: Optional[ArcSyncMeta]) -> bool:
    """Is a pass ACTUALLY running? The stored flag alone lies after a process
    death; a claim without a fresh heartbeat is a dead claim."""
    if not (meta and meta.running):
        return False
    hb = meta.heartbeat
    if hb is None:
        return False
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    return (_now() - hb) < STALE_AFTER


def _claim(db: Session, mode: str) -> bool:
    """Mark the singleton row running, refusing while a live pass holds it."""
    meta = _get_meta(db)
    if _live(meta):
        return False
    now = _now()
    meta.running = True
    meta.mode = mode
    meta.started_at = now
    meta.heartbeat = now
    meta.progress_done = 0
    meta.progress_total = 0
    db.commit()
    return True


# Every column the upsert rewrites — everything normalize_item produces plus
# the sync stamps. remote_id is the conflict key and stays; first_seen_at is
# the insert's server default and is deliberately NOT in this set.
_UPSERT_COLS = (
    "request_num", "branch_id", "branch_name", "country_id", "description",
    "category_id", "category_name", "category_is_urgent", "category_deadline_hours",
    "deadline", "deadline_time", "master_id", "master_name", "status",
    "normalized_status", "status_color", "is_overdue", "created_at",
    "cancelled_at", "finished_at", "completed_at", "extra_phone", "latitude",
    "longitude", "deny_reason", "sended_to_sap", "photo_report", "comment_report",
    "document_url", "has_other_active", "other_active_count", "client_name",
    "raw", "synced_at", "missing_since",
)


def _upsert_page(db: Session, items: list[dict], now: datetime) -> list[str]:
    """Insert-or-update one page of tickets in a single statement; returns the
    remote ids it wrote (the full walk's «seen» set)."""
    # Keyed by remote_id: the same uuid twice in one page (a page boundary
    # shifting under a walk) would make ON CONFLICT touch a row twice, which
    # Postgres refuses outright. Last occurrence wins.
    by_id: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        rec = arc_client.normalize_item(item)
        if not rec["remote_id"]:
            continue
        rec["synced_at"] = now
        rec["missing_since"] = None    # seen again → no longer missing
        by_id[rec["remote_id"]] = rec
    ids = list(by_id)
    if not ids:
        return ids
    stmt = pg_insert(ArcRequest).values(list(by_id.values()))
    stmt = stmt.on_conflict_do_update(
        index_elements=["remote_id"],
        set_={c: getattr(stmt.excluded, c) for c in _UPSERT_COLS},
    )
    db.execute(stmt)
    return ids


def _status_catalog(db: Session) -> list[dict]:
    """Distinct (status, normalized_status, status_color) triples with counts,
    over rows the API still returns — the filter's option list."""
    q = (db.query(ArcRequest.status, ArcRequest.normalized_status,
                  ArcRequest.status_color, func.count(ArcRequest.id))
         .filter(ArcRequest.missing_since.is_(None))
         .group_by(ArcRequest.status, ArcRequest.normalized_status, ArcRequest.status_color)
         .order_by(ArcRequest.status))
    return [{"status": s, "normalized_status": ns, "status_color": col, "count": n}
            for s, ns, col, n in q.all()]


def _maybe_fetch_spec(db: Session, client: httpx.Client, meta: ArcSyncMeta) -> None:
    """Store the API's openapi document once (or when a week old). Runs after
    the pass's first successful call, so the token is already good; any
    failure is a skipped nicety, never a failed pass."""
    fetched = meta.spec_fetched_at
    if fetched is not None and fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    if meta.spec is not None and fetched and (_now() - fetched) < SPEC_MAX_AGE:
        return
    doc = arc_client.fetch_openapi(client)
    if doc is None:
        return
    meta.spec = doc
    meta.spec_fetched_at = _now()
    db.commit()


def run_sync(mode: str = "full") -> dict:
    """Walk the API and upsert every ticket seen (all pages when ``mode`` is
    «full», the first QUICK_MAX_PAGES otherwise). Blocking — call through
    :func:`start_sync_thread` or the scheduler, never from a request handler."""
    if not configured():
        return {"status": "not_configured"}
    mode = "quick" if mode == "quick" else "full"
    db = SessionLocal()
    try:
        if not _claim(db, mode):
            return {"status": "already_running"}

        seen: set[str] = set()
        remote_total = 0
        pages_seen = 0
        walked_all = False
        spec_checked = False
        started = _now()
        with httpx.Client(timeout=arc_client._TIMEOUT) as client:
            # Never probed, and about to walk everything? Measure FIRST, on
            # this connection: a filter discovered after the walk would leave
            # the register short until the next pass, and the first full sync
            # after an upgrade is exactly when that costs the most. ~40 cheap
            # size=1 calls, once in the mirror's life (and on demand from the
            # page's «API» panel).
            if mode == "full" and _get_meta(db).probe_at is None:
                try:
                    arc_discovery.run_probe(db, client)
                except Exception as exc:              # noqa: BLE001
                    log.warning("arc probe during sync failed: %s", str(exc)[:200])
            # The measured filter set — what makes the API hand over more than
            # its defaults do. Empty means «the defaults were already widest».
            filters = arc_discovery.active_filters(db)
            if filters:
                log.info("arc sync (%s): walking with discovered filters %s", mode, filters)
            for items, page, pages, total in arc_client.iter_requests(client, extra=filters):
                now = _now()
                if not spec_checked:
                    # First successful call of the pass — the login just worked.
                    spec_checked = True
                    _maybe_fetch_spec(db, client, _get_meta(db))
                remote_total = total
                ids = _upsert_page(db, items, now)
                seen.update(ids)
                pages_seen = page
                # Commit + heartbeat + progress per page: a death here keeps
                # every page already written, and the page shows «12/87».
                meta = _get_meta(db)
                meta.progress_done = page
                meta.progress_total = min(pages, QUICK_MAX_PAGES) if mode == "quick" else pages
                meta.heartbeat = now
                db.commit()
                if page >= pages or not items:
                    walked_all = True
                    break
                if mode == "quick" and page >= QUICK_MAX_PAGES:
                    break

        now = _now()
        missing_marked = 0
        if mode == "full" and walked_all and seen:
            # Only a COMPLETED full walk that actually SAW tickets may say a
            # row is gone: everything the API still returns was stamped
            # synced_at >= started this pass, so a row last stamped before the
            # pass began is newly missing. A 200 with an empty page 1 (an
            # upstream hiccup, a scoped-out account) must never void the whole
            # register — hence the ``seen`` guard.
            missing_marked = (
                db.query(ArcRequest)
                .filter(ArcRequest.missing_since.is_(None))
                .filter((ArcRequest.synced_at.is_(None)) | (ArcRequest.synced_at < started))
                .update({ArcRequest.missing_since: now}, synchronize_session=False)
            )
            db.commit()

        meta = _get_meta(db)
        meta.running = False
        meta.ok = True
        meta.last_synced = now
        meta.heartbeat = now
        meta.row_count = db.query(ArcRequest).filter(ArcRequest.missing_since.is_(None)).count()
        meta.remote_total = remote_total
        meta.status_catalog = _status_catalog(db)
        if mode == "full" and walked_all:
            meta.last_full_at = now
        meta.message = None
        db.commit()
        log.info("arc sync (%s): %s pages, %s tickets seen, remote total %s, %s newly missing",
                 mode, pages_seen, len(seen), remote_total, missing_marked)
        # One register row per pass that actually MIRRORED something. A quick
        # pass that read no ticket (a transient 200 with an empty page, an
        # account scoped out from under us) writes nothing: the point of the
        # row is "the mirror moved", and a line every fifteen minutes saying it
        # did not is exactly the noise that makes a register unreadable. The
        # two early returns above (`not_configured`, `already_running`) never
        # reach here, and a failed pass leaves its reason on `meta.message`.
        if seen:
            action_log.record_system(
                "sync_export", "sync.arc_pass", db=db,
                details=[("mode", mode), ("rows", len(seen)),
                         ("total", remote_total), ("pages", pages_seen),
                         ("missing", missing_marked)],
            )
        return {"status": "ok", "mode": mode, "pages": pages_seen,
                "seen": len(seen), "remote_total": remote_total,
                "missing": missing_marked}
    except Exception as exc:
        # Never leave the claim stuck. str(exc) is credential-free by the
        # client's construction, and the page shows it verbatim.
        try:
            db.rollback()
            meta = _get_meta(db)
            meta.running = False
            meta.ok = False
            meta.message = str(exc)[:1000]
            db.commit()
        except Exception:
            pass
        if isinstance(exc, ArcAuthError):
            log.error("arc sync (%s): %s", mode, exc)
        elif isinstance(exc, ArcTransientError):
            log.warning("arc sync (%s): %s", mode, exc)
        else:
            log.exception("arc sync (%s) failed", mode)
        return {"status": "error", "detail": str(exc)}
    finally:
        db.close()


def start_sync_thread(mode: str = "full") -> bool:
    """Kick a pass in a daemon thread. False when one is already running
    (either this process's thread or another process's fresh DB claim)."""
    if not _thread_lock.acquire(blocking=False):
        return False

    def _run():
        try:
            run_sync(mode)
        finally:
            _thread_lock.release()

    threading.Thread(target=_run, name="arc-sync", daemon=True).start()
    return True


def register_boot_jobs() -> None:
    """Quick pass every INTERVAL_MIN minutes, full pass nightly, plus a
    one-shot catch-up a minute after boot (full if no full walk ever
    finished, quick otherwise). Mirrored in passenger_wsgi.py like every
    other boot job. Skips entirely without credentials — same as the
    worker-concerns crawl declining without a service-account key."""
    if not configured():
        log.info("arc: no ARC credentials, sync jobs not registered")
        return
    from apscheduler.triggers.cron import CronTrigger
    from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at, schedule_interval

    last_full = None
    db = SessionLocal()
    try:
        meta = db.query(ArcSyncMeta).filter_by(id=1).first()
        if meta and meta.running:
            # Whatever pass the previous process was running died with it —
            # release the claim so the page's Refresh button isn't dead.
            meta.running = False
            db.commit()
        last_full = meta.last_full_at if meta else None
    except Exception:
        log.exception("arc: could not read sync meta at boot")
    finally:
        db.close()

    schedule_interval("arc-quick-sync", lambda: run_sync("quick"), minutes=INTERVAL_MIN)
    try:
        get_scheduler().add_job(
            lambda: run_sync("full"),
            trigger=CronTrigger(hour=3, minute=15, timezone=SCHEDULER_TZ),
            id="arc-full-sync", replace_existing=True,
        )
    except Exception:
        log.exception("arc: could not register nightly full sync")

    catchup = "full" if not last_full else "quick"
    schedule_at("arc-boot-catchup", _now() + timedelta(seconds=60),
                lambda: run_sync(catchup))
    log.info("arc: sync jobs registered (boot catch-up: %s)", catchup)
