import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base
from app.routers import admin, brigadirs, attendance, heatmap, workers, downtime, plan, comments, settings, translations
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
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
    )
    add_last_seen_column()
    add_edit_requests_batch_id()
    migrate_multi_roles()
    seed_admins()
    seed_languages()
    seed_managers_and_sources()
    seed_exchange_tasks()
    seed_production_pilot()
    resync_production_catalog()
    backfill_day_approvals()
    backfill_day_closures()
    backfill_deletion_batch_ids()
    from app.telegram_bot import setup_webhook
    setup_webhook()
    yield


app = FastAPI(title="Zagruzka KPI API", version="1.0.0", lifespan=lifespan)


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

app.include_router(auth_router.router)
app.include_router(webhook_router.router)
app.include_router(admin.router)
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
app.include_router(production_router.router)


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
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Serve any static files in the root of the dist directory (like favicon.ico, etc.)
        clean_path = full_path.lstrip("/")
        file_path = os.path.abspath(os.path.join(STATIC_DIR, clean_path))
        if clean_path and file_path.startswith(STATIC_DIR) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise serve index.html for SPA frontend routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
