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
        backfill_leader_page_access, open_cells_page_to_supervisors,
        add_profiles_columns, migrate_cells_table,
        migrate_cells_leaders_columns, migrate_cell_supervisor_column,
        migrate_cell_in_load_column,
        add_cell_shift_times,
        add_education_thumb_url,
        add_idle_interval_client_key,
        add_leader_task_cell,
        add_late_proof_provenance,
        add_late_proof_timing,
        migrate_dispute_stages, purge_pre_september_appeals,
        merge_brigadir_tasks_page,
        create_action_log, report_unclassified_routes,
        report_leader_deadline_rules,
        report_leader_task_catalog,
        migrate_factories, add_role_profile_factory,
        migrate_cell_ojidaniya_percat,
        migrate_cell_perenaladka,
        migrate_idle_interval_status, approve_pending_idle_requests,
        migrate_attendance_batches, seed_att_included_from_last_day,
        seed_idle_source_pilot,
        seed_pp_autofill_default,
        set_forecast_autocall_capacity,
        split_zagruzka_bands,
        seed_full90_bands,
        report_unpriced_ojidaniya,
        report_unpriced_ojidaniya_xlsx,
        report_zagruzka_gaps_xlsx,
        report_shared_work_centers,
        report_shared_work_centers_xlsx,
        report_cell_input_gaps_xlsx,
        notify_operator_education_lesson,
        report_shared_sap_cells_raw_xlsx,
        report_sheet_concerns_xlsx,
        report_checklist_setup,
        report_proof_archive,
        report_proof_review_sep19_20,
        report_auto_checks_sep20_21,
        report_auto_check_restore,
        report_missed_day_reports,
        report_missed_reports_resend,
        report_filling_times,
        write_leader_task_examples,
        cleanup_rules_sep19,
        preview_leader_rules_sep19,
        register_leader_rules_sep19,
        register_leader_rules_sep26,
        add_leader_auto_checks,
        register_leader_auto_sep20,
        report_auto_schema,
        add_pp_product_auto_fill,
        add_wc_groups, letter_shared_cells, report_wc_groups,
        add_education_duration,
        migrate_pp_line_daily_key,
        correct_pp_double_counted_days,
        purge_production_history,
        reorder_positions_plan_before_fact,
        latin_twin_codes,
        seed_snabjenets_english_label,
        fix_orazov_schedule_2026_09_01,
        backfill_role_profiles,
        add_concern_profile_columns, add_concern_done_at, add_concern_level_columns,
        add_concern_level_since, add_concern_escalation_names,
        add_concern_shift_manager, add_concern_category,
        add_concern_seq, add_concern_worker_name, add_concern_deadline_from,
        backfill_concern_profiles, add_concern_owner_columns, backfill_concern_owner,
        backfill_concern_units, add_dm_reachability_columns,
        add_task_comment_author_ref, add_concern_comment_kind_column,
        add_task_assignee_kind_column,
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
        add_leader_task_description,
        add_leader_task_date_check, add_leader_task_time_check,
        add_leader_task_day_check,
        add_leader_task_date_plus,
        add_leader_task_proof_kind, reset_leader_camera_pilot,
        add_leader_task_catalog,
        add_leader_task_example_scope,
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
    add_wc_groups()
    add_education_thumb_url()
    add_idle_interval_client_key()
    add_leader_task_cell()
    add_late_proof_provenance()
    add_late_proof_timing()
    migrate_dispute_stages()
    merge_brigadir_tasks_page()
    create_action_log()
    # After the dispute stage columns and the action register it reports
    # into. One-shot: pre-September objections + late proofs, deleted.
    purge_pre_september_appeals()
    letter_shared_cells()
    migrate_cell_ojidaniya_percat()
    migrate_cell_perenaladka()
    migrate_idle_interval_status()
    approve_pending_idle_requests()
    migrate_attendance_batches()
    seed_att_included_from_last_day()
    seed_idle_source_pilot()
    seed_pp_autofill_default()
    set_forecast_autocall_capacity()
    split_zagruzka_bands()
    seed_full90_bands()
    add_pp_product_auto_fill()
    add_education_duration()
    migrate_pp_line_daily_key()
    correct_pp_double_counted_days()
    purge_production_history()
    reorder_positions_plan_before_fact()
    latin_twin_codes()
    seed_snabjenets_english_label()
    fix_orazov_schedule_2026_09_01()
    add_concern_profile_columns()
    add_concern_done_at()
    add_concern_level_columns()
    add_concern_level_since()
    add_concern_escalation_names()
    add_concern_shift_manager()
    add_concern_category()
    add_concern_seq()
    add_concern_worker_name()
    add_concern_deadline_from()
    add_concern_owner_columns()
    add_task_comment_author_ref()
    add_concern_comment_kind_column()
    add_task_assignee_kind_column()
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
    add_leader_task_description()
    add_leader_task_date_check()
    add_leader_task_time_check()
    add_leader_task_day_check()
    add_leader_task_date_plus()
    # Schema for the automatic checklist tasks. Permanent, not a one-shot:
    # `create_all` never ALTERs an existing table, and the ledger's unique key
    # is an EXPRESSION index. It MUST run here, with the other DDL and before
    # `report_leader_deadline_rules` — that report is the only caller of
    # `leader_auto_rollout.self_check`, and with the column still missing every
    # ORM read of LeaderTaskDef raises, so the boot that applies the rollout
    # would be the one boot whose self-check was skipped.
    add_leader_auto_checks()
    add_leader_task_proof_kind()
    add_leader_task_catalog()
    add_leader_task_example_scope()
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
    open_cells_page_to_supervisors()
    seed_admins()
    seed_languages()
    seed_managers_and_sources()
    # After the manager seed, so freshly seeded units land in the first factory
    # instead of staying unassigned.
    migrate_factories()
    add_role_profile_factory()
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
    # …and whether the task CATALOG still adds up: an archived task units
    # still switch on, a spent floor, or weights that no longer total 100 —
    # the last of which silently re-bases every leader's percentage.
    report_leader_task_catalog()
    report_wc_groups()

    # ⚠ TEMPORARY one-shot — remove this line and its module in the NEXT
    # version. Inert until a unit is named in `PURGE_TEST_UNITS`. Runs last, so
    # every table it deletes from is guaranteed to exist by now.
    from app.onetime_purge_test_units import purge_test_units
    purge_test_units()
    # ⚠ TEMPORARY one-shots (2026-09-09) — the operator asked, once, for the
    # register behind «Xarajat»'s «Narxlanmagan, daq» card: first as a table in
    # the message, then as a workbook. Each is flag-guarded, so each delivers on
    # the first boot after its own deploy and never again. Remove both lines,
    # `services/unpriced_report.py` and `build_unpriced_workbook` once the file
    # has landed.
    report_unpriced_ojidaniya()
    report_unpriced_ojidaniya_xlsx()
    # ⚠ TEMPORARY one-shot (2026-09-09) — the operator asked, once, for what is
    # still UNFILLED before the загрузка can be trusted: «Odam soni» missing on a
    # work centre that has a plan, ojidaniya filed on a cell with no plan, and
    # everything else that blanks or skews the number. Flag-guarded, so it
    # delivers on the first boot after this deploy and never again. Remove this
    # line and `services/zagruzka_gaps.py` once the file has landed.
    report_zagruzka_gaps_xlsx()
    # Which SAP work centres more than one unit claims — the registry, the
    # catalog overlaps and the quantities written twice. One DM, once; delete
    # this line and `services/shared_wc_report.py` once it has landed.
    report_shared_work_centers()
    # …and the same register as a four-sheet workbook. Its own flag: the
    # operator asked for the file after the message.
    report_shared_work_centers_xlsx()
    # ⚠ TEMPORARY one-shot (2026-09-10) — the cells the verifix upload put
    # PEOPLE in, where nobody wrote a plan or an «Odam soni» on «Zagruzka
    # fayli» for that cell on that date. Not a widening of the report above:
    # that one asks its cell questions of the cells that FILED OJIDANIYA, so
    # a cell where people stood all shift and nothing was filed is invisible
    # to it. Flag-guarded — first boot after this deploy, never again. Remove
    # this line and `services/cell_input_gaps.py` once the file has landed.
    report_cell_input_gaps_xlsx()
    # ⚠ TEMPORARY one-shot (2026-09-11) — the operator asked to receive, once,
    # the notification the only «Ta'lim» lesson sends its audience: the same
    # card and button, DMed to their own chat, and nothing else. Flag-guarded —
    # first boot after this deploy, never again. Remove this line and
    # `startup.notify_operator_education_lesson` once it has landed.
    notify_operator_education_lesson()
    # ⚠ TEMPORARY one-shot (2026-09-11) — every group of cells that carry one
    # SAP code, as an UNFORMATTED workbook (header row + one row per cell) in
    # the operator's chat. Broader than the shared-work-centre file above: a
    # code several cells of ONE unit carry is in too. Flag-guarded — first boot
    # after this deploy, never again. Remove this line and
    # `shared_wc_report.send_cells_raw_xlsx` once it has landed.
    report_shared_sap_cells_raw_xlsx()
    # ⚠ TEMPORARY one-shot (2026-09-15) — who still writes concerns in the
    # «Liderlar Havotirlar» Google sheets in September, as a workbook in the
    # operator's chat. Scheduled (it re-crawls the sheets first), flag-guarded.
    # Remove this line, `startup.report_sheet_concerns_xlsx` and
    # `services/sheet_concerns_report.py` once it has landed.
    report_sheet_concerns_xlsx()
    # ⚠ TEMPORARY one-shot (2026-09-17) — the leader checklist as production
    # runs it, as ZIP files in the operator's chat. Scheduled, flag-guarded.
    # Remove this line, `startup.report_checklist_setup` and
    # `services/checklist_setup_report.py` once it has landed.
    report_checklist_setup()
    # ⚠ TEMPORARY one-shot (2026-09-18) — a SAMPLE of the last 7 days' leader
    # proofs: PER_GROUP filings per (shift, task) over the ten tasks that have
    # new requirements (1, 8 and 9 are out — they become automatic checks and
    # have no criteria), as ~3 ZIP parts in the operator's chat, each carrying
    # the same proofs.json with each task's NEW criteria beside its photos.
    # Sending the whole week was the first version and was withdrawn mid-run for
    # flooding the chat; MAX_PARTS in the module is what stops that recurring.
    # Scheduled, flag-guarded — delivers once. Remove this line,
    # `startup.report_proof_archive` and `services/proof_archive.py` once the
    # files have landed.
    report_proof_archive()
    # ⚠ TEMPORARY one-shot (2026-09-21) — EVERY proof photo of the checklist
    # days 19.09 and 20.09 with its AI verdict, the criteria it was judged
    # against, admin approvals and upheld objections, as ZIP parts in the
    # operator's chat (report.json in each). Scheduled, flag-guarded,
    # resumes after a restart — delivers once. Remove this line,
    # `startup.report_proof_review_sep19_20` and
    # `services/proof_review_report.py` once the files have landed.
    report_proof_review_sep19_20()
    # ⚠ TEMPORARY one-shot (2026-09-22) — the automatic checks of 20–21.09
    # (#1, #9, #8), every verdict with its cause and whose fault it was, as a
    # summary + .xlsx + .json in the operator's chat. Scheduled, flag-guarded —
    # delivers once. Remove this line, `startup.report_auto_checks_sep20_21`
    # and `services/auto_check_report.py` once the files have landed.
    report_auto_checks_sep20_21()
    # ⚠ TEMPORARY one-shot (2026-09-22) — the points «one cell is enough» gives
    # back: every earlier auto-check failure of a multi-cell leader that the new
    # rule passes, proven on time, as a list + ONE button in the operator's
    # chat. Remove this line, `startup.report_auto_check_restore`, the `acr:`
    # callback and `services/auto_check_restore.py` once the button is used.
    report_auto_check_restore()
    # ⚠ TEMPORARY one-shot (2026-09-22) — every leader-day since 1 Sep: was its
    # day report sent, and if not, why (a day parked while still open and never
    # retried). Summary + .xlsx + .json in the operator's chat, flag-guarded —
    # delivers once. Remove this line, `startup.report_missed_day_reports` and
    # `services/missed_report_audit.py` once the files have landed.
    report_missed_day_reports()
    # ⚠ TEMPORARY one-shot (2026-09-23) — day reports 16 Sep → today: did the
    # leaders get them, who missed which dates; the 16–22 Sep ones never sent
    # go out only when the operator taps one of its two buttons. Flag-guarded
    # — delivers once. Remove this line, `startup.report_missed_reports_resend`,
    # the `mrr:` callback and `services/missed_report_resend.py` once used.
    report_missed_reports_resend()
    # ⚠ TEMPORARY one-shot (2026-09-23) — when Normanov finished filling his
    # plan and people on 23 Sep, and what stood at 10:00, DMed once to the
    # operator. Remove this line, `startup.report_filling_times` and
    # `services/filling_times_report.py` once it has been sent.
    report_filling_times()
    # ⚠ TEMPORARY one-shot (2026-09-19) — the example photos the operator picked
    # against the new criteria, written at the GLOBAL level of nine tasks and
    # REPLACING what was there. Inline, not scheduled: it is config today's
    # reviews are judged against. Flag-guarded — applies once. Remove this line,
    # `startup.write_leader_task_examples`,
    # `services/leader_task_examples_sep19.py` and `app/data/task_examples/`
    # once it has landed.
    write_leader_task_examples()
    # ⚠ TEMPORARY one-shot (2026-09-19) — clear what the go-live left behind:
    # the «YANGI TALAB» preview notice, which now contradicts itself, and the
    # example photos of the three tasks that become automatic checks. Inline and
    # flag-guarded. Remove with `leader_rules_sep19`.
    cleanup_rules_sep19()
    # ⚠ TEMPORARY one-shot (2026-09-19) — the leader-checklist rules the
    # operator agreed on 18 Sep: unit-level AI criteria and Uzbek leader
    # descriptions, task 11 «+1 day», task 13 time-only, task 3 three photos.
    # Two flag-guarded passes, each armed to fire while its own shift is NOT
    # running. Re-armed on every boot (memory jobstore); the flags stop a second
    # run. Remove this line, `startup.register_leader_rules_sep19` and
    # `services/leader_rules_sep19.py` once BOTH passes have landed.
    register_leader_rules_sep19()
    # ⚠ TEMPORARY one-shot (2026-09-25) — the AI criteria revised from the
    # operator's reasons for the 50 flags lifted on 19–20 Sep: tasks 3, 6, 7,
    # 11, 13 + a leader-level «one-process cell» text for task 3. CRITERIA only
    # (leader instructions untouched). Two flag-guarded passes, each in its own
    # shift's gap, then the global baseline. Remove this line,
    # `startup.register_leader_rules_sep26` and `services/leader_rules_sep26.py`
    # once all three flags are set — and BEFORE removing leader_rules_sep19,
    # whose texts the pass compares against.
    register_leader_rules_sep26()
    # ⚠ TEMPORARY (20.09.2026): tasks 1, 8 and 9 become automatic checks.
    # Delete this line, `startup.register_leader_auto_sep20`,
    # `startup._leader_auto_job/_leader_auto_dm/_auto_run_at/_auto_first_check`
    # and `services/leader_auto_rollout.py` once BOTH flags are set.
    # `add_leader_auto_checks` and `services/leader_auto.py` STAY — they are
    # the feature, not the rollout.
    # Says once whether that schema really landed. The only way to see
    # production's catalog from outside — see its docstring.
    report_auto_schema()
    register_leader_auto_sep20()
    # ⚠ TEMPORARY one-shot (2026-09-18) — publish the new leader INSTRUCTIONS
    # early so leaders can read them and prepare. Descriptions only: nothing
    # they are scored by changes until the two passes above fire on the 19th.
    # Remove with them.
    preview_leader_rules_sep19()

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
    # The OLD login API's mirror (/arc-legacy) — mirrored in app/main.py.
    from app.services.arc_legacy_sync import register_boot_jobs as register_arc_legacy_jobs
    register_arc_legacy_jobs()
    # The call forecast, sent by the clock: shift 1 at 19:00, shift 2 at 06:00,
    # each for its own next shift-day (mirrored in passenger_wsgi.py).
    from app.services.forecast_autocall import register_jobs as register_autocall_jobs
    register_autocall_jobs()
    # «Imtihon»: the exam's two daily jobs (mirrors main.py).
    from app.services.exam import register_jobs as register_exam_jobs
    register_exam_jobs()
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
