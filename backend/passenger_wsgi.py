"""
Phusion Passenger entry point.

Passenger expects a module-level `application` callable that speaks WSGI.
Our FastAPI app is ASGI, so we wrap it with `asgiref.wsgi.WsgiToAsgi`
(or the reverse: `a2wsgi.ASGIMiddleware`) to bridge the two protocols.

Install dependency:
    pip install a2wsgi

Then in your Passenger / cPanel config, point the WSGI app file to this file.
"""

import sys
import os

# Cap native BLAS/OpenMP thread pools to 1 BEFORE numpy/pandas get imported
# (app.main → production router → openpyxl → numpy). On this shared host the
# default of one thread per core (64) exhausts RLIMIT_NPROC and aborts startup
# with "OpenBLAS blas_thread_init: pthread_create failed ... Resource
# temporarily unavailable". setdefault so an explicit env override still wins.
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

# Make sure `app/` is importable regardless of the working directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Run database creation, seeding, and Telegram webhook setup on startup.
# NOTE: the FastAPI lifespan in app/main.py does NOT run under the a2wsgi
# bridge, so every startup task wired there must also be mirrored here.
try:
    from app.database import engine, Base
    from app.startup import (
        seed_admins, seed_languages, backfill_day_approvals, backfill_day_closures,
        backfill_deletion_batch_ids, seed_managers_and_sources, seed_exchange_tasks,
        add_edit_requests_batch_id, add_last_seen_column, migrate_multi_roles,
        add_notification_template_columns, add_admin_language_column,
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
    )
    from app.telegram_bot import setup_webhook

    print("Running startup migrations and seeds...", flush=True)
    Base.metadata.create_all(bind=engine)
    add_last_seen_column()
    add_edit_requests_batch_id()
    add_notification_template_columns()
    add_admin_language_column()
    migrate_multi_roles()
    seed_admins()
    seed_languages()
    seed_managers_and_sources()
    seed_exchange_tasks()
    seed_production_pilot()
    resync_production_catalog()
    backfill_pp_actual_from_deliv()
    backfill_day_approvals()
    backfill_day_closures()
    backfill_deletion_batch_ids()

    print("Setting up Telegram webhook...", flush=True)
    setup_webhook()
except Exception as e:
    print(f"Startup task failed: {e}", file=sys.stderr, flush=True)

# Import the FastAPI ASGI app
from app.main import app as asgi_app  # noqa: E402

# Wrap ASGI → WSGI using a2wsgi (pip install a2wsgi)
from a2wsgi import ASGIMiddleware  # noqa: E402

import mimetypes

# Locate frontend's dist folder
possible_dirs = [
    os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist")),
    os.path.abspath(os.path.join(BASE_DIR, "frontend", "dist")),
    os.path.abspath(os.path.join(BASE_DIR, "dist")),
    os.path.abspath(os.path.join(BASE_DIR, "..", "dist")),
]
STATIC_DIR = None
for d in possible_dirs:
    if os.path.isdir(d):
        STATIC_DIR = d
        break

print(f"WSGI Static Directory resolved to: {STATIC_DIR}", flush=True)

def serve_file(filepath, start_response):
    try:
        content_type, _ = mimetypes.guess_type(filepath)
        if not content_type:
            content_type = 'application/octet-stream'
        
        with open(filepath, 'rb') as f:
            content = f.read()
            
        headers = [
            ('Content-Type', content_type),
            ('Content-Length', str(len(content))),
        ]
        start_response('200 OK', headers)
        return [content]
    except Exception as e:
        status = '500 Internal Server Error'
        headers = [('Content-Type', 'text/plain')]
        start_response(status, headers)
        return [f"Error serving file: {str(e)}".encode('utf-8')]

def static_middleware(wsgi_app):
    def wrapper(environ, start_response):
        if not STATIC_DIR:
            return wsgi_app(environ, start_response)
            
        path = environ.get('PATH_INFO', '')
        method = environ.get('REQUEST_METHOD', 'GET')
        
        # Only handle GET and HEAD requests for static assets / frontend pages
        if method not in ('GET', 'HEAD'):
            return wsgi_app(environ, start_response)
            
        # API, Admin, Bot, and Health endpoints go directly to FastAPI backend
        api_prefixes = ('/api/', '/admin/', '/bot/', '/health')
        if any(path.startswith(prefix) for prefix in api_prefixes):
            return wsgi_app(environ, start_response)
            
        clean_path = path.lstrip('/')
        
        # 1. Root route / -> serve index.html
        if not clean_path:
            index_path = os.path.join(STATIC_DIR, 'index.html')
            if os.path.isfile(index_path):
                return serve_file(index_path, start_response)
        
        # 2. Specific file requested -> serve it if it exists inside STATIC_DIR
        file_path = os.path.abspath(os.path.join(STATIC_DIR, clean_path))
        if file_path.startswith(STATIC_DIR) and os.path.isfile(file_path):
            if method == 'HEAD':
                try:
                    content_type, _ = mimetypes.guess_type(file_path)
                    if not content_type:
                        content_type = 'application/octet-stream'
                    size = os.path.getsize(file_path)
                    headers = [
                        ('Content-Type', content_type),
                        ('Content-Length', str(size)),
                    ]
                    start_response('200 OK', headers)
                    return [b'']
                except Exception:
                    pass
            return serve_file(file_path, start_response)
            
        # 3. Non-API routes without file extensions -> SPA fallback to index.html
        if '.' not in clean_path.split('/')[-1]:
            index_path = os.path.join(STATIC_DIR, 'index.html')
            if os.path.isfile(index_path):
                return serve_file(index_path, start_response)
                
        return wsgi_app(environ, start_response)
    return wrapper

# `application` is the name Passenger looks for by convention
application = static_middleware(ASGIMiddleware(asgi_app))
