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
import logging

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

# Get logging up before anything else runs: prod boots through THIS file, so a
# failure below is the only record of why the app is down. Mirrored in
# app/main.py (which never reaches its lifespan under the a2wsgi bridge).
from app.logging_setup import setup_logging  # noqa: E402

setup_logging()
logger = logging.getLogger("passenger_wsgi")

# Fail-closed before serving: never run production on the public placeholder
# signing key or with the dev auth bypass on (mirrors the app/main.py lifespan).
from app.config import assert_secure_config  # noqa: E402
assert_secure_config()

# Run database creation, seeding, and Telegram webhook setup on startup.
# NOTE: the FastAPI lifespan in app/main.py does NOT run under the a2wsgi
# bridge, so every startup task wired there must also be mirrored here.
try:
    from app.database import engine, Base
    from app.startup import (
        seed_admins, seed_languages, backfill_day_approvals, backfill_day_closures,
        backfill_deletion_batch_ids, seed_managers_and_sources, seed_exchange_tasks,
        add_edit_requests_batch_id, add_last_seen_column, migrate_multi_roles,
        migrate_leader_role_uniqueness,
        add_notification_template_columns, add_admin_language_column, add_tg_name_column,
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
        relax_pp_upload_manager, rescale_pp_efficiency_base,
        backfill_leader_page_access, add_profiles_columns, migrate_cells_table,
        migrate_cells_leaders_columns, migrate_cell_supervisor_column,
        migrate_cell_in_load_column,
        add_cell_shift_times,
        add_late_proof_provenance,
        migrate_dispute_stages,
        create_action_log, report_unclassified_routes,
        report_leader_deadline_rules,
        migrate_factories,
        migrate_cell_ojidaniya_percat,
        migrate_cell_perenaladka,
        migrate_idle_interval_status, approve_pending_idle_requests,
        migrate_attendance_batches, seed_att_included_from_last_day,
        seed_idle_source_pilot,
        seed_pp_autofill_default,
        reorder_positions_plan_before_fact,
        backfill_role_profiles,
        add_concern_profile_columns, add_concern_done_at, add_concern_level_columns,
        add_concern_level_since, add_concern_escalation_names,
        add_concern_shift_manager, add_concern_category,
        add_concern_seq,
        backfill_concern_profiles, add_concern_owner_columns, backfill_concern_owner,
        backfill_concern_units, add_dm_reachability_columns,
        add_task_comment_author_ref, add_concern_comment_kind_column,
        migrate_concern_solutions_to_thread,
        add_notification_recipient_profile,
        add_leader_submission_columns, add_broadcast_rich_columns,
        add_broadcast_resume_columns, add_broadcast_schedule_column,
        add_action_log_undo_column,
        add_broadcast_failures_column, add_pp_product_op,
        add_downtime_ns_columns,
        add_attendance_supervisor_column, backfill_supervisor_attendance,
        add_attendance_split_columns, purge_cell_exchange_sandbox,
        add_profile_identity_columns, add_activity_profile_key,
        backfill_role_profile_keys,
        backfill_task_profiles, backfill_comment_profiles,
        seed_setup_times,
        add_leader_task_setting_names, add_leader_task_criteria,
        add_leader_task_windows, add_leader_task_deadlines,
        add_leader_task_date_check, add_leader_task_time_check,
        add_leader_task_date_plus,
        add_leader_task_proof_kind, reset_leader_camera_pilot,
        add_leader_day_reopened, add_leader_entry_closed_at,
        add_leader_unit_bot_from,
        set_camera_pilot_bot_from,
        add_leader_photo_client_key,
        add_leader_ai_clocks, sync_leader_ai_dates,
        add_leader_ai_resolution,
        add_leader_ai_reviewed_index,
        add_web_credential_password_enc,
        ensure_internal_api_key, reset_arc_mirror,
        add_worker_concern_failures_column,
        add_worker_concern_sweep_columns,
        migrate_permission_modes,
        migrate_user_capabilities,
        repoint_shift_report_sheet,
        wipe_cell_perenaladka_history,
        purge_leader_ai_history,
        drop_paused_shift_reviews,
        queue_shift2_backlog,
    )
    from app.telegram_bot import setup_webhook

    print("Running startup migrations and seeds...", flush=True)
    Base.metadata.create_all(bind=engine)
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
    add_cell_shift_times()
    add_late_proof_provenance()
    migrate_dispute_stages()
    create_action_log()
    migrate_cell_ojidaniya_percat()
    migrate_cell_perenaladka()
    migrate_idle_interval_status()
    approve_pending_idle_requests()
    migrate_attendance_batches()
    seed_att_included_from_last_day()
    seed_idle_source_pilot()
    seed_pp_autofill_default()
    reorder_positions_plan_before_fact()
    add_concern_profile_columns()
    add_concern_done_at()
    add_concern_level_columns()
    add_concern_level_since()
    add_concern_escalation_names()
    add_concern_shift_manager()
    add_concern_category()
    add_concern_seq()
    add_concern_owner_columns()
    add_task_comment_author_ref()
    add_concern_comment_kind_column()
    migrate_concern_solutions_to_thread()
    add_leader_submission_columns()
    add_broadcast_rich_columns()
    add_broadcast_resume_columns()
    add_broadcast_schedule_column()
    add_action_log_undo_column()
    add_broadcast_failures_column()
    add_pp_product_op()
    add_downtime_ns_columns()
    add_attendance_supervisor_column()
    add_attendance_split_columns()
    purge_cell_exchange_sandbox()
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
    add_leader_entry_closed_at()
    add_leader_day_reopened()
    add_leader_unit_bot_from()
    # After the column exists — both of these write values into it.
    reset_leader_camera_pilot()
    set_camera_pilot_bot_from()
    add_leader_photo_client_key()
    add_leader_ai_resolution()
    add_leader_ai_reviewed_index()
    # After add_leader_ai_resolution — the backfill reads reviewed rows.
    add_leader_ai_clocks()
    add_profile_identity_columns()
    add_activity_profile_key()
    add_web_credential_password_enc()
    # The /arc integration: seed the internal key into .env (and into this
    # process) BEFORE the mirror reset and before register_arc_jobs below,
    # which declines outright without one.
    ensure_internal_api_key()
    reset_arc_mirror()
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
    # After the pause cleanup and the date sync it reads: the backlog is only
    # queueable once a row's shift is settled, and only while nothing is paused.
    queue_shift2_backlog()
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

    # The task-closing arithmetic, asserted out loud — see the lifespan twin in
    # main.py. Mirrored here per the startup-migration rule.
    report_leader_deadline_rules()

    print("Setting up Telegram webhook...", flush=True)
    setup_webhook()

    # Continue any broadcast fan-out orphaned by Passenger recycling its
    # process mid-send (mirrored in the FastAPI lifespan).
    from app.routers.broadcast import register_scheduled_broadcasts, resume_stuck_broadcasts
    resume_stuck_broadcasts()

    # Background jobs. Timers live in memory only, so every boot rebuilds them
    # from the rows that own them.
    from app.scheduler import start_scheduler
    start_scheduler()
    register_scheduled_broadcasts()
    # The AI proof reviewer's queue drains itself (mirrored in app/main.py).
    from app.services.leader_ai import register_drain_job
    register_drain_job()
    # Per-task submission: close tasks whose deadline has gone by.
    from app.services.leader_close import register_autoclose_job
    register_autoclose_job()

    # The day-reconciliation watch: DMs admins when the platform stops showing
    # someone the uploaded file says worked (services/attendance_reconcile).
    from app.services.attendance_watch import register_watch as register_reconcile_watch
    register_reconcile_watch()
    # Worker-concerns nightly sheet crawl + first-boot fill (mirrored in
    # app/main.py).
    from app.services.worker_concerns import register_boot_jobs as register_wc_jobs
    register_wc_jobs()
    # ARC ticket mirror: quick pass every 15 min, full walk nightly + boot
    # catch-up (mirrored in app/main.py; skips without credentials).
    from app.services.arc_sync import register_boot_jobs as register_arc_jobs
    register_arc_jobs()
except Exception as e:
    # .exception() keeps the traceback — the old bare print dropped it, which
    # is what left the stale-connection startup failure undiagnosable.
    logger.exception("Startup task failed: %s", e)

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

def cache_control_for(filepath):
    """index.html must never be cached: it references content-hashed asset names
    that change every deploy, so a stale copy 404s when a lazy page chunk loads.
    Assets under /assets are content-hashed and immutable — cache them for a year."""
    name = os.path.basename(filepath)
    if name == 'index.html':
        return 'no-store, must-revalidate'
    if '/assets/' in filepath.replace(os.sep, '/'):
        return 'public, max-age=31536000, immutable'
    return None

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
        cc = cache_control_for(filepath)
        if cc:
            headers.append(('Cache-Control', cc))
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
                    cc = cache_control_for(file_path)
                    if cc:
                        headers.append(('Cache-Control', cc))
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
