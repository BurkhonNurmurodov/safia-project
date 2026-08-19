import os

# Cap native BLAS/OpenMP thread pools to 1 BEFORE numpy/pandas are imported
# (via the production router → openpyxl → numpy). The default of one thread per
# core overruns RLIMIT_NPROC on the shared host and aborts startup. setdefault
# so an explicit env override (or passenger_wsgi) still wins.
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

# Configure logging before the rest of the app is imported, so anything that
# logs during import lands in backend/logs/app.log. Mirrored in
# passenger_wsgi.py — prod boots through there, not through the lifespan.
from app.logging_setup import setup_logging  # noqa: E402

setup_logging()

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Aliased: `settings` (unqualified) is the app.routers.settings module below.
from app.config import assert_secure_config, settings as cfg
from app.database import engine, Base
from app.scheduler import shutdown_scheduler, start_scheduler
from app.security import enforce_telegram_origin_admin, enforce_telegram_origin_global
from app.version import APP_VERSION, STARTED_AT, current_commit
from app.routers import admin, brigadirs, attendance, heatmap, workers, downtime, plan, comments, settings, translations, leaders, kaizen, activity, concerns, tasks, profiles, leaderboard, quality, boot, ui_prefs, broadcast, setup_times, leader_tasks, leader_ai, leader_proof, idle_cell, cell_attendance, zagruzka_cell, attendance_batch, factories, worker_concerns, arc
from app.routers import production as production_router
from app.routers import auth as auth_router
from app.routers import web_login as web_login_router
from app.routers import webhook as webhook_router
from app.routers import notifications as notifications_router
from app.routers import staff as staff_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail-closed before anything is served: never run production on the public
    # placeholder signing key or with the dev auth bypass enabled.
    assert_secure_config()
    Base.metadata.create_all(bind=engine)
    from app.startup import (
        backfill_day_approvals, backfill_day_closures, backfill_deletion_batch_ids,
        seed_admins, seed_languages, seed_managers_and_sources, seed_exchange_tasks,
        add_edit_requests_batch_id, add_last_seen_column, migrate_multi_roles,
        migrate_leader_role_uniqueness,
        add_notification_template_columns, add_admin_language_column, add_tg_name_column,
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
        relax_pp_upload_manager, rescale_pp_efficiency_base,
        backfill_leader_page_access, add_profiles_columns, migrate_cells_table,
        migrate_cells_leaders_columns, migrate_cell_supervisor_column,
        migrate_cell_in_load_column,
        migrate_factories,
        migrate_cell_ojidaniya_percat,
        migrate_cell_perenaladka,
        migrate_attendance_batches,
        backfill_role_profiles,
        add_concern_profile_columns, add_concern_done_at, add_concern_level_columns,
        add_concern_shift_manager, add_concern_category,
        backfill_concern_profiles, add_concern_owner_columns, backfill_concern_owner,
        backfill_concern_units, add_dm_reachability_columns,
        add_task_comment_author_ref, add_notification_recipient_profile,
        add_leader_submission_columns, add_broadcast_rich_columns,
        add_broadcast_resume_columns, add_broadcast_schedule_column,
        add_broadcast_failures_column, add_pp_product_op,
        add_downtime_ns_columns,
        add_attendance_supervisor_column, backfill_supervisor_attendance,
        add_profile_identity_columns, add_activity_profile_key,
        backfill_role_profile_keys,
        backfill_task_profiles, backfill_comment_profiles,
        seed_setup_times,
        add_leader_task_setting_names, add_leader_task_criteria,
        add_leader_task_windows, add_leader_task_deadlines,
        add_leader_task_date_check, add_leader_task_time_check,
        add_leader_task_date_plus,
        add_leader_task_proof_kind, reset_leader_camera_pilot,
        add_leader_photo_client_key,
        add_leader_ai_clocks, sync_leader_ai_dates,
        add_leader_ai_resolution,
        add_web_credential_password_enc,
        add_arc_probe_columns,
        add_worker_concern_failures_column,
        add_worker_concern_sweep_columns,
        migrate_permission_modes,
        migrate_user_capabilities,
        repoint_shift_report_sheet,
        wipe_cell_perenaladka_history,
        purge_leader_ai_history,
        drop_paused_shift_reviews,
    )
    add_last_seen_column()
    add_tg_name_column()
    add_edit_requests_batch_id()
    add_notification_template_columns()
    add_notification_recipient_profile()
    add_admin_language_column()
    add_dm_reachability_columns()
    add_profiles_columns()
    migrate_cells_table()
    migrate_cells_leaders_columns()
    migrate_cell_supervisor_column()
    migrate_cell_in_load_column()
    migrate_cell_ojidaniya_percat()
    migrate_cell_perenaladka()
    migrate_attendance_batches()
    add_concern_profile_columns()
    add_concern_done_at()
    add_concern_level_columns()
    add_concern_shift_manager()
    add_concern_category()
    add_concern_owner_columns()
    add_task_comment_author_ref()
    add_leader_submission_columns()
    add_broadcast_rich_columns()
    add_broadcast_resume_columns()
    add_broadcast_schedule_column()
    add_broadcast_failures_column()
    add_pp_product_op()
    add_downtime_ns_columns()
    add_attendance_supervisor_column()
    # After the column exists — it inserts rows carrying the flag.
    backfill_supervisor_attendance()
    add_leader_task_setting_names()
    add_leader_task_criteria()
    add_leader_task_windows()
    add_leader_task_deadlines()
    add_leader_task_date_check()
    add_leader_task_time_check()
    add_leader_task_date_plus()
    add_leader_task_proof_kind()
    # After the column exists — it rewrites values in it.
    reset_leader_camera_pilot()
    add_leader_photo_client_key()
    add_leader_ai_resolution()
    # After add_leader_ai_resolution — the backfill reads reviewed rows.
    add_leader_ai_clocks()
    add_profile_identity_columns()
    add_activity_profile_key()
    add_web_credential_password_enc()
    add_arc_probe_columns()
    add_worker_concern_failures_column()
    add_worker_concern_sweep_columns()
    migrate_multi_roles()
    # After migrate_multi_roles — it owns the table's columns; this re-keys it.
    migrate_leader_role_uniqueness()
    backfill_leader_page_access()
    seed_admins()
    seed_languages()
    seed_managers_and_sources()
    # After the manager seed, so freshly seeded units land in the first factory
    # instead of staying unassigned.
    migrate_factories()
    repoint_shift_report_sheet()
    wipe_cell_perenaladka_history()
    purge_leader_ai_history()
    # After purge_leader_ai_history (no point re-judging rows about to be
    # dropped) and after the window + clocks columns it reads exist.
    sync_leader_ai_dates()
    # After the date sync, which is what settles a row's shift: the pause
    # cleanup reads it to decide what leaves the queue.
    drop_paused_shift_reviews()
    backfill_role_profiles()
    backfill_concern_profiles()
    backfill_concern_owner()
    # After the cell + manager seeds — it reads both to resolve a concern's unit.
    backfill_concern_units()
    backfill_role_profile_keys()
    backfill_task_profiles()
    backfill_comment_profiles()
    migrate_user_capabilities()
    migrate_permission_modes()
    seed_exchange_tasks()
    seed_production_pilot()
    seed_setup_times()
    resync_production_catalog()
    relax_pp_upload_manager()
    backfill_pp_actual_from_deliv()
    rescale_pp_efficiency_base()
    backfill_day_approvals()
    backfill_day_closures()
    backfill_deletion_batch_ids()
    from app.telegram_bot import setup_webhook
    setup_webhook()
    # Continue any broadcast fan-out orphaned by a process restart mid-send
    # (mirrored in passenger_wsgi.py — prod boots through that entrypoint).
    from app.routers.broadcast import register_scheduled_broadcasts, resume_stuck_broadcasts
    resume_stuck_broadcasts()
    # Background jobs. The scheduler holds its timers in memory only, so every
    # boot rebuilds them from the rows that own them; a deploy landing between
    # composing a broadcast and its send time therefore costs nothing.
    start_scheduler()
    register_scheduled_broadcasts()
    # The AI proof reviewer used to move only when a human hit Refresh; now the
    # queue drains itself (mirrored in passenger_wsgi.py).
    from app.services.leader_ai import register_drain_job
    register_drain_job()
    # Worker-concerns nightly sheet crawl + first-boot fill (mirrored in
    # passenger_wsgi.py).
    from app.services.worker_concerns import register_boot_jobs as register_wc_jobs
    register_wc_jobs()
    # ARC ticket mirror: quick pass every 15 min, full walk nightly + boot
    # catch-up (mirrored in passenger_wsgi.py; skips without credentials).
    from app.services.arc_sync import register_boot_jobs as register_arc_jobs
    register_arc_jobs()
    yield
    shutdown_scheduler()


# Every /api/* request must carry a valid Telegram initData header (verified
# hash + freshness), enforced app-wide. /admin/* API routes are guarded per
# router below (so SPA navigations to /admin/* aren't mistaken for API calls).
app = FastAPI(title="Zagruzka KPI API", version=APP_VERSION, lifespan=lifespan,
              dependencies=[Depends(enforce_telegram_origin_global)])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log every unhandled 500 with a full traceback server-side, but return a
    generic body. The exception text can carry SQL fragments, file paths and
    other internals an attacker can farm by deliberately triggering errors."""
    logging.getLogger("app.unhandled").exception(
        "Unhandled error on %s %s", request.method, request.url.path,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# CORS is locked to the app's own origins. In production the SPA and API share
# one origin, so CORS isn't even exercised there; this allowlist exists for local
# dev (Vite on :5173 → backend) and to make "*" impossible. A wildcard combined
# with credentials would let any website drive the API in a victim's browser.
_CORS_ORIGINS = sorted({
    o for o in (
        cfg.webapp_url, cfg.backend_url,
        "https://production.safiacorporate.uz",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8000", "http://localhost:8001",
    ) if o
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ghost Mode: admins can suppress change-notifications via the X-Ghost-Mode
# header. Must wrap the route handlers so its ContextVar is visible inside them.
from app.notify_ctx import GhostModeMiddleware  # noqa: E402
app.add_middleware(GhostModeMiddleware)


class NoStoreAPIMiddleware:
    """Mark every API/auth response as non-cacheable.

    Production runs behind LiteSpeed (cPanel). LSCache keys cached responses by
    URL and will, by default, store and replay a response for a shared URL —
    ignoring the per-user ``Authorization`` header. That means one supervisor's
    authenticated response to ``/api/auth/webapp`` (their token + profile) or to
    a ``/api/staff/*`` data URL can be served back to a *different* supervisor,
    which shows up as profiles/data randomly swapping between users.

    Setting ``Cache-Control: no-store`` (plus the LiteSpeed-specific opt-out)
    tells every cache in the chain — LSCache, any CDN, the Telegram in-app
    proxy, the browser — never to store these responses. Hashed static assets
    are left untouched so the SPA stays cacheable.

    Pure ASGI (not BaseHTTPMiddleware) so it composes cleanly with the a2wsgi
    bridge and the Ghost Mode ContextVar, same as GhostModeMiddleware.
    """

    _API_PREFIXES = ("/api", "/admin", "/bot", "/health")
    _DROP = (b"cache-control", b"pragma", b"expires", b"x-litespeed-cache-control")

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not scope.get("path", "").startswith(self._API_PREFIXES):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for (k, v) in message.get("headers", [])
                           if k.lower() not in self._DROP]
                headers += [
                    (b"cache-control", b"no-store, no-cache, must-revalidate, private"),
                    (b"pragma", b"no-cache"),
                    (b"expires", b"0"),
                    (b"x-litespeed-cache-control", b"no-cache"),  # LSWS/cPanel opt-out
                    (b"vary", b"Authorization"),
                ]
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


# Outermost middleware: it must have the final say on cache headers, after CORS
# and the route handlers have run.
app.add_middleware(NoStoreAPIMiddleware)


# ── Security headers ──────────────────────────────────────────────────────────
# A Content-Security-Policy scoped to exactly what this app loads, plus the
# standard hardening trio. Deliberately permissive where the app needs it
# ('unsafe-inline'/'unsafe-eval' for the inline boot script and charting libs;
# the Google-Fonts hosts; data:/blob: for the base64 logo and blob media
# previews) so it hardens without breaking the SPA, while still blocking the
# high-value attacks: loading external scripts, embedding the app off Telegram
# (clickjacking), <base>/object injection, and exfiltrating a stolen token to a
# foreign host (connect-src is same-origin only).
_CONNECT_SRC = " ".join(sorted(
    {"'self'"} | {o for o in (cfg.webapp_url, cfg.backend_url)
                  if o and o.startswith("http")}
))
_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'self' https://telegram.org https://*.telegram.org; "
    "form-action 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob:; "
    "media-src 'self' data: blob:; "
    "worker-src 'self' blob:; "
    f"connect-src {_CONNECT_SRC}"
)


class SecurityHeadersMiddleware:
    """Attach defense-in-depth response headers to every response. Pure ASGI so
    it composes with the cache and Ghost-Mode middlewares."""

    _HEADERS = [
        (b"content-security-policy", _CSP.encode()),
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        # Camera is allowed for THIS ORIGIN ONLY (`self`), and nothing else is.
        # It has to be: /proof/camera takes checklist proof photos in the app
        # precisely so the timestamp on them is the server's rather than one the
        # leader's camera app wrote — and `camera=()` denies getUserMedia
        # outright, no prompt, no error a user could act on. `self` keeps every
        # embedder out: a mini-app iframe (web.telegram.org) still only gets the
        # camera if Telegram's own `allow` attribute delegates it. Microphone and
        # geolocation stay fully denied.
        (b"permissions-policy", b"camera=(self), microphone=(), geolocation=()"),
    ]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for (k, _) in headers}
                headers += [h for h in self._HEADERS if h[0] not in present]
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(SecurityHeadersMiddleware)

# Routers exposing /admin/* API routes need the initData guard applied at the
# router level too — the global dep only covers /api/*. (These same three also
# have /api/* routes, already covered globally; the admin guard skips those.)
_admin_guard = [Depends(enforce_telegram_origin_admin)]

app.include_router(auth_router.router)
app.include_router(web_login_router.router)
app.include_router(webhook_router.router)
app.include_router(admin.router, dependencies=_admin_guard)
app.include_router(brigadirs.router)
app.include_router(attendance.router)
app.include_router(heatmap.router)
app.include_router(workers.router)
app.include_router(downtime.router)
app.include_router(plan.router)
app.include_router(comments.router)
app.include_router(settings.router)
app.include_router(translations.router)
app.include_router(notifications_router.router)
app.include_router(staff_router.router)
app.include_router(production_router.router, dependencies=_admin_guard)
app.include_router(leaders.router)
app.include_router(kaizen.router)
app.include_router(activity.router)
app.include_router(concerns.router)
app.include_router(tasks.router)
app.include_router(profiles.router)
app.include_router(leaderboard.router)
app.include_router(quality.router)
app.include_router(worker_concerns.router)
app.include_router(boot.router)
app.include_router(ui_prefs.router)
# Factories: reading the tab strip is open to any approved session (every
# factory-aware page needs it); the write endpoints carry their own
# admin/admin.factories.manage guard.
app.include_router(factories.router)
app.include_router(broadcast.router)
app.include_router(setup_times.router)
app.include_router(leader_tasks.router, dependencies=_admin_guard)
# The camera page's own endpoints: leader-scoped, never admin — a leader
# shooting their own proof holds no admin capability, so this router must NOT
# join the _admin_guard one above.
app.include_router(leader_proof.router)
# AI proof review for the leader checklist. Every route self-gates with
# verify_admin (pilot), and lives under /api so the global dep covers it.
app.include_router(leader_ai.router)
# Manual per-cell idle-time (ojidaniya) TEST entry — self-gates via
# require_page("idle-cell"), so no admin guard here (grantable to
# leaders/supervisors later).
app.include_router(idle_cell.router)
# Per-cell attendance rows, read by the Staff (verifix) page's Yacheyka column
# and cell view — its own page is gone, so this self-gates via
# require_page("staff") (and require_page("cells") for the in-load writer).
app.include_router(cell_attendance.router)
# Single-file attendance ingest («Davomat» admin tab) — one «Отчёт по посещениям
# сотрудников» export for the whole factory, staged for review before it reaches
# `attendance`. Under /api/*, so the global initData guard already covers it;
# every route is additionally admin-gated by verify_admin.
app.include_router(attendance_batch.router)
# Per-cell загрузка TEST twin of /zagruzka, hard-locked to one supervisor —
# self-gates via require_page("zagruzka-cell") (admin-only by default).
app.include_router(zagruzka_cell.router)
# ARC service-ticket register — self-gates via require_page("arc")
# (admin-only by default), so no admin guard here.
app.include_router(arc.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/version")
def api_version():
    """What is actually deployed, readable from inside the app.

    A push to main deploys with no staging step and no review window, and
    nobody has a shell on the box — so this is the only way to check that the
    build in front of you is the one you just pushed. Authenticated like every
    other /api route (it is not in ``_EXEMPT_PATHS``).

    ``commit`` is the checkout's HEAD *now*; ``started_at`` is when this
    process booted. A commit newer than the boot time means a backend change
    is still waiting on a restart — a frontend-only deploy never restarts.
    """
    return {
        "version": APP_VERSION,
        "commit": current_commit(),
        "started_at": STARTED_AT,
    }


# Serve React build — must come AFTER all API routes
possible_dirs = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist")),
]
STATIC_DIR = None
for d in possible_dirs:
    if os.path.isdir(d):
        STATIC_DIR = d
        break

if STATIC_DIR:
    class ImmutableStaticFiles(StaticFiles):
        """Build assets carry a content hash in their filename, so a given URL
        never changes contents — cache them for a year so clients don't refetch
        and can't end up with a stale/mismatched copy."""

        async def get_response(self, path, scope):
            resp = await super().get_response(path, scope)
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return resp

    app.mount("/assets", ImmutableStaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    # index.html must never be cached: it references content-hashed asset names
    # that change on every deploy. A stale copy points at chunk filenames that no
    # longer exist → "App failed to start" when a lazy page 404s.
    NO_STORE = {"Cache-Control": "no-store, must-revalidate"}

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Serve any static files in the root of the dist directory (like favicon.ico, etc.)
        clean_path = full_path.lstrip("/")
        file_path = os.path.abspath(os.path.join(STATIC_DIR, clean_path))
        # Boundary must include the separator: a bare startswith(STATIC_DIR)
        # would also match a sibling like ".../dist-backup", letting a crafted
        # "../dist-backup/secret" escape the intended directory.
        within = file_path == STATIC_DIR or file_path.startswith(STATIC_DIR + os.sep)
        if clean_path and within and os.path.isfile(file_path):
            # build.json is the deploy marker the running app polls to notice a
            # newer build. Cached, it keeps reporting the build the user already
            # has and the update prompt never fires — so it gets index.html's
            # no-store treatment for exactly the same reason.
            if clean_path == "build.json":
                return FileResponse(file_path, headers=NO_STORE)
            return FileResponse(file_path)
        # Otherwise serve index.html for SPA frontend routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers=NO_STORE)
