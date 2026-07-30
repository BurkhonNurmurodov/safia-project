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

import traceback
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.security import enforce_telegram_origin_admin, enforce_telegram_origin_global
from app.routers import admin, brigadirs, attendance, heatmap, workers, downtime, plan, comments, settings, translations, leaders, kaizen, activity, concerns, tasks, profiles, leaderboard, quality, boot, ui_prefs, broadcast, setup_times, leader_tasks, idle_cell, cell_attendance
from app.routers import production as production_router
from app.routers import auth as auth_router
from app.routers import webhook as webhook_router
from app.routers import notifications as notifications_router
from app.routers import staff as staff_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from app.startup import (
        backfill_day_approvals, backfill_day_closures, backfill_deletion_batch_ids,
        seed_admins, seed_languages, seed_managers_and_sources, seed_exchange_tasks,
        add_edit_requests_batch_id, add_last_seen_column, migrate_multi_roles,
        add_notification_template_columns, add_admin_language_column, add_tg_name_column,
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
        relax_pp_upload_manager, rescale_pp_efficiency_base,
        backfill_leader_page_access, add_profiles_columns, migrate_cells_table,
        migrate_cells_leaders_columns, migrate_cell_supervisor_column,
        migrate_cell_ojidaniya_percat,
        backfill_role_profiles,
        add_concern_profile_columns, add_concern_done_at, add_concern_level_columns,
        add_concern_shift_manager, add_concern_category,
        backfill_concern_profiles, add_concern_owner_columns, backfill_concern_owner,
        add_task_comment_author_ref, add_notification_recipient_profile,
        add_leader_submission_columns, add_broadcast_rich_columns, add_pp_product_op,
        add_downtime_ns_columns,
        add_profile_identity_columns, add_activity_profile_key,
        backfill_role_profile_keys,
        backfill_task_profiles, backfill_comment_profiles,
        seed_setup_times,
        add_leader_task_setting_names,
        migrate_user_capabilities,
        repoint_shift_report_sheet,
    )
    add_last_seen_column()
    add_tg_name_column()
    add_edit_requests_batch_id()
    add_notification_template_columns()
    add_notification_recipient_profile()
    add_admin_language_column()
    add_profiles_columns()
    migrate_cells_table()
    migrate_cells_leaders_columns()
    migrate_cell_supervisor_column()
    migrate_cell_ojidaniya_percat()
    add_concern_profile_columns()
    add_concern_done_at()
    add_concern_level_columns()
    add_concern_shift_manager()
    add_concern_category()
    add_concern_owner_columns()
    add_task_comment_author_ref()
    add_leader_submission_columns()
    add_broadcast_rich_columns()
    add_pp_product_op()
    add_downtime_ns_columns()
    add_leader_task_setting_names()
    add_profile_identity_columns()
    add_activity_profile_key()
    migrate_multi_roles()
    backfill_leader_page_access()
    seed_admins()
    seed_languages()
    seed_managers_and_sources()
    repoint_shift_report_sheet()
    backfill_role_profiles()
    backfill_concern_profiles()
    backfill_concern_owner()
    backfill_role_profile_keys()
    backfill_task_profiles()
    backfill_comment_profiles()
    migrate_user_capabilities()
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
    yield


# Every /api/* request must carry a valid Telegram initData header (verified
# hash + freshness), enforced app-wide. /admin/* API routes are guarded per
# router below (so SPA navigations to /admin/* aren't mistaken for API calls).
app = FastAPI(title="Zagruzka KPI API", version="1.0.0", lifespan=lifespan,
              dependencies=[Depends(enforce_telegram_origin_global)])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log every unhandled 500 with a full traceback so it appears in server logs."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Routers exposing /admin/* API routes need the initData guard applied at the
# router level too — the global dep only covers /api/*. (These same three also
# have /api/* routes, already covered globally; the admin guard skips those.)
_admin_guard = [Depends(enforce_telegram_origin_admin)]

app.include_router(auth_router.router)
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
app.include_router(boot.router)
app.include_router(ui_prefs.router)
app.include_router(broadcast.router)
app.include_router(setup_times.router)
app.include_router(leader_tasks.router, dependencies=_admin_guard)
# Manual per-cell idle-time (ojidaniya) TEST entry — self-gates via
# require_page("idle-cell"), so no admin guard here (grantable to
# leaders/supervisors later).
app.include_router(idle_cell.router)
# Per-cell attendance viewer (read-only sibling of the Staff verifix page) —
# self-gates via require_page("cell-attendance").
app.include_router(cell_attendance.router)


@app.get("/health")
def health():
    return {"status": "ok"}


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
        if clean_path and file_path.startswith(STATIC_DIR) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise serve index.html for SPA frontend routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers=NO_STORE)
