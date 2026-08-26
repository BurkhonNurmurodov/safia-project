"""
ARC service-ticket mirror (page /arc), fed by IT's internal read-only API.

The list endpoint (services/arc_client.py) is walked page by page and every
ticket is UPSERTED on its id — there is no updated_at anywhere, so there is
nothing to diff against and every walk re-writes every row it sees. Two passes:

  * **quick** — the first QUICK_MAX_PAGES pages (newest tickets first, which
    is where anything that changes lives), every INTERVAL_MIN minutes;
  * **full** — every page, nightly at 03:15 and on the page's Refresh. Only a
    full walk that actually FINISHED may declare rows «missing» (the API
    stopped returning them): a quick pass cannot tell "gone" from "further
    down than I looked", so it never touches ``missing_since``.

**Then it hydrates cards.** The list carries no description, no deny reason,
no files and no status timeline — those are one call per ticket. Fetching them
inline during the walk would multiply a 40-page pass by a hundred, so it is a
SECOND, bounded phase: at most DETAIL_BATCH_* cards per pass, never-fetched
newest-first, then the ones whose ticket moved since their card was read. A
mirror therefore fills in over several passes instead of hammering their host
once, and `arc_sync_meta.detail_pending` is what says so out loud. The page's
detail modal fetches a missing card on demand, so a ticket a reader actually
opens is never left waiting for the queue.

Same shape as the worker-concerns crawl (thread + DB claim + heartbeat +
scheduler): each page commits on its own, so a process death mid-walk loses
nothing already written and the next pass simply walks again; the claim's
heartbeat is what makes a dead pass takeover-able instead of a permanent
«running» that leaves the Refresh button dead.

Nothing here logs or stores the internal key — see the client module.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import and_, func, not_, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ArcRequest, ArcSyncMeta
from app.services import action_log, arc_client, arc_hidden
from app.services.arc_client import (OPEN_STATUSES, ArcAuthError,
                                     ArcTransientError, configured)

log = logging.getLogger(__name__)

# A pass whose heartbeat is older than this is a dead process's claim and may
# be taken over.
STALE_AFTER = timedelta(minutes=3)
# The quick pass reads this many pages from the top and stops.
QUICK_MAX_PAGES = 30
# Quick-pass cadence.
INTERVAL_MIN = 15
# How many ticket cards one pass may fetch. A card is one HTTP call, so this is
# the whole «do not hammer their host» budget. The register holds ~32k tickets
# and only the card carries the description, so the FIRST backfill is tens of
# thousands of calls however it is paced: at these numbers the quick pass is
# ~10 requests a minute and the whole history has its descriptions inside a
# couple of days, after which only the day's new tickets need one. Raising
# them buys hours and costs their host; lowering them is always safe.
DETAIL_BATCH_FULL = 600
DETAIL_BATCH_QUICK = 150
# An OPEN ticket's card is re-read when it is older than this (its description
# can be edited and its comments grow). A closed one is only re-read when the
# ticket closed AFTER the card was fetched — that is when deny_reason appears.
DETAIL_REFRESH = timedelta(hours=12)
# Commit + heartbeat every N cards, so a death mid-hydration keeps the rest.
DETAIL_COMMIT_EVERY = 25

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
    meta.detail_done = 0
    db.commit()
    return True


# Every column the LIST upsert rewrites. The card-only columns (description,
# deny_reason, files, update_time, detail_at, detail_raw) are deliberately
# absent: the list does not carry them, so writing them would blank a card the
# hydration phase already fetched. comments/comment_count are coalesced
# instead of overwritten, for the same reason — the list ships `[]` for a
# ticket whose card holds a thread.
_UPSERT_COLS = (
    "request_num", "status", "user_id", "user_name", "user_phone",
    "user_manager", "division_id", "division_name", "manager_name",
    "brigada_id", "brigada_name", "category_id", "category_name",
    "category_urgent", "category_ftime", "department", "sphere_status",
    "is_bot", "created_at", "started_at", "finished_at", "raw",
    "synced_at", "missing_since",
)
_UPSERT_COALESCE = ("comments", "comment_count")


def _upsert_page(db: Session, items: list[dict], now: datetime) -> list[str]:
    """Insert-or-update one page of tickets in a single statement; returns the
    remote ids it wrote (the full walk's «seen» set)."""
    # Keyed by remote_id: the same ticket twice in one page (a page boundary
    # shifting under a walk) would make ON CONFLICT touch a row twice, which
    # Postgres refuses outright. Last occurrence wins.
    by_id: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        rec = arc_client.normalize_item(item)
        if not rec["remote_id"]:
            continue
        # IT's own test categories are not work this plant did, so the mirror
        # never carries them: the row is not written, its card is never
        # fetched, and nothing downstream has to know it came past. Rows an
        # earlier pass wrote are hidden by the register's own clause (the same
        # rule, in SQL — services/arc_hidden.py), so the two answers agree
        # with no migration and a rule that is later withdrawn refills itself
        # on the next full walk.
        if arc_hidden.is_hidden(rec.get("category_name")):
            continue
        rec["synced_at"] = now
        rec["missing_since"] = None    # seen again → no longer missing
        by_id[rec["remote_id"]] = rec
    ids = list(by_id)
    if not ids:
        return ids
    stmt = pg_insert(ArcRequest).values(list(by_id.values()))
    updates = {c: getattr(stmt.excluded, c) for c in _UPSERT_COLS}
    for c in _UPSERT_COALESCE:
        updates[c] = func.coalesce(getattr(stmt.excluded, c), getattr(ArcRequest, c))
    stmt = stmt.on_conflict_do_update(index_elements=["remote_id"], set_=updates)
    db.execute(stmt)
    return ids


# ── card hydration ──────────────────────────────────────────────────────────

def _detail_needed(stale_before: datetime):
    """The WHERE clause for «this row's card is missing or out of date», used
    both to pick the batch and to count what is still pending — one expression,
    so the queue and the number describing it cannot disagree."""
    R = ArcRequest
    return and_(
        R.missing_since.is_(None),
        # A card is one HTTP call out of a bounded per-pass budget; a ticket
        # no surface can show must never spend one.
        not_(arc_hidden.hidden_clause()),
        or_(
            R.detail_at.is_(None),
            # The ticket closed after we last read its card — that is when the
            # deny reason and the final timeline appear.
            and_(R.finished_at.isnot(None), R.detail_at < R.finished_at),
            # Still open: its text and its comments can still move.
            and_(R.status.in_(OPEN_STATUSES), R.detail_at < stale_before),
        ),
    )


def detail_pending(db: Session) -> int:
    """How many mirrored tickets have NEVER had their card fetched — the «the
    mirror is still filling in» number the page shows. Deliberately NOT the
    whole `_detail_needed` queue: that also holds open tickets due a routine
    re-read, so it never reaches zero, and a counter that never reaches zero
    reads as «still loading» forever."""
    return int(db.query(func.count(ArcRequest.id))
               .filter(ArcRequest.missing_since.is_(None))
               .filter(not_(arc_hidden.hidden_clause()))
               .filter(ArcRequest.detail_at.is_(None)).scalar() or 0)


def _detail_batch(db: Session, limit: int) -> list[str]:
    """The next cards to fetch: never-fetched first (newest ticket first),
    then the stale ones. Newest-first is deliberate — the top of the register
    is what a reader is looking at while the backlog fills in."""
    R = ArcRequest
    rows = (db.query(R.remote_id)
            .filter(_detail_needed(_now() - DETAIL_REFRESH))
            .order_by(R.detail_at.is_(None).desc(), R.created_at.desc().nullslast())
            .limit(limit).all())
    return [rid for (rid,) in rows]


def fetch_detail(db: Session, client: httpx.Client, remote_id: str) -> bool:
    """Fetch ONE ticket's card and write it onto its row. Returns False when
    the API has no such ticket — the row is stamped anyway so the queue does
    not offer it again on every pass. Commits nothing; the caller decides."""
    row = db.query(ArcRequest).filter(ArcRequest.remote_id == remote_id).first()
    if row is None:
        return False
    card = arc_client.get_request(client, remote_id)
    now = _now()
    if card is None:
        row.detail_at = now
        return False
    for key, value in arc_client.normalize_detail(card).items():
        setattr(row, key, value)
    row.detail_at = now
    return True


def hydrate_details(db: Session, client: httpx.Client, limit: int,
                    heartbeat=None) -> int:
    """Fill in up to ``limit`` ticket cards. A transient failure ENDS the phase
    rather than retrying — the list half of the pass already succeeded, and
    hammering a host that just timed out is how a mirror becomes a problem for
    the system it mirrors."""
    ids = _detail_batch(db, limit)
    done = 0
    for i, rid in enumerate(ids, 1):
        try:
            fetch_detail(db, client, rid)
        except (ArcTransientError, ArcAuthError) as exc:
            # A timeout or a revoked key is the same answer for every remaining
            # card in the batch; per-row retries would just be 400 identical
            # failures against a host that has already said no.
            db.commit()
            log.warning("arc detail: stopping after %s cards — %s", done, str(exc)[:200])
            break
        except Exception as exc:                       # noqa: BLE001 - reported
            db.rollback()
            log.warning("arc detail %s failed: %s", rid, str(exc)[:200])
            continue
        done += 1
        if i % DETAIL_COMMIT_EVERY == 0:
            db.commit()
            if heartbeat:
                heartbeat(done)
    db.commit()
    if heartbeat and done:
        heartbeat(done)
    return done


def _status_catalog(db: Session) -> list[dict]:
    """Distinct statuses with counts, over rows the API still returns — the
    filter's option list. The API ships a bare integer, so the words come from
    the four locales, never from here."""
    q = (db.query(ArcRequest.status, func.count(ArcRequest.id))
         .filter(ArcRequest.missing_since.is_(None))
         .filter(not_(arc_hidden.hidden_clause()))
         .group_by(ArcRequest.status)
         .order_by(ArcRequest.status))
    return [{"status": s, "count": n} for s, n in q.all()]


def run_sync(mode: str = "full") -> dict:
    """Walk the API and upsert every ticket seen (all pages when ``mode`` is
    «full», the first QUICK_MAX_PAGES otherwise), then hydrate a bounded batch
    of ticket cards. Blocking — call through :func:`start_sync_thread` or the
    scheduler, never from a request handler."""
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
        cards = 0
        started = _now()
        with httpx.Client(timeout=arc_client._TIMEOUT) as client:
            for items, page, pages, total in arc_client.iter_requests(client):
                now = _now()
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
                # Only a COMPLETED full walk that actually SAW tickets may say
                # a row is gone: everything the API still returns was stamped
                # synced_at >= started this pass, so a row last stamped before
                # the pass began is newly missing. A 200 with an empty page 1
                # (an upstream hiccup, a key scoped out from under us) must
                # never void the whole register — hence the ``seen`` guard.
                missing_marked = (
                    db.query(ArcRequest)
                    .filter(ArcRequest.missing_since.is_(None))
                    # A test-category row is skipped ON PURPOSE by every walk,
                    # so it is not «gone from the API» and must not be stamped
                    # as such — `missing_since` has to keep meaning one thing.
                    .filter(not_(arc_hidden.hidden_clause()))
                    .filter((ArcRequest.synced_at.is_(None)) | (ArcRequest.synced_at < started))
                    .update({ArcRequest.missing_since: now}, synchronize_session=False)
                )
                db.commit()

            def _beat(n: int) -> None:
                m = _get_meta(db)
                m.heartbeat = _now()
                m.detail_done = n
                db.commit()

            cards = hydrate_details(
                db, client,
                DETAIL_BATCH_FULL if mode == "full" else DETAIL_BATCH_QUICK,
                heartbeat=_beat,
            )

        now = _now()
        meta = _get_meta(db)
        meta.running = False
        meta.ok = True
        meta.last_synced = now
        meta.heartbeat = now
        meta.row_count = (db.query(ArcRequest)
                          .filter(ArcRequest.missing_since.is_(None))
                          .filter(not_(arc_hidden.hidden_clause())).count())
        meta.remote_total = remote_total
        meta.status_catalog = _status_catalog(db)
        meta.detail_done = cards
        meta.detail_pending = detail_pending(db)
        if mode == "full" and walked_all:
            meta.last_full_at = now
        meta.message = None
        db.commit()
        log.info("arc sync (%s): %s pages, %s tickets seen, %s cards, remote total %s, "
                 "%s newly missing, %s cards pending",
                 mode, pages_seen, len(seen), cards, remote_total, missing_marked,
                 meta.detail_pending)
        # One register row per pass that actually MIRRORED something. A quick
        # pass that read no ticket (a transient 200 with an empty page, a key
        # scoped out from under us) writes nothing: the point of the row is
        # "the mirror moved", and a line every fifteen minutes saying it did
        # not is exactly the noise that makes a register unreadable. The two
        # early returns above (`not_configured`, `already_running`) never reach
        # here, and a failed pass leaves its reason on `meta.message`.
        if seen or cards:
            action_log.record_system(
                "sync_export", "sync.arc_pass", db=db,
                details=[("mode", mode), ("rows", len(seen)),
                         ("total", remote_total), ("pages", pages_seen),
                         ("cards", cards), ("missing", missing_marked)],
            )
        return {"status": "ok", "mode": mode, "pages": pages_seen,
                "seen": len(seen), "cards": cards, "remote_total": remote_total,
                "missing": missing_marked}
    except Exception as exc:
        # Never leave the claim stuck. str(exc) is key-free by the client's
        # construction, and the page shows it verbatim.
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
    other boot job. Skips entirely without a key — same as the worker-concerns
    crawl declining without a service-account key."""
    if not configured():
        log.info("arc: no internal API key, sync jobs not registered")
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
