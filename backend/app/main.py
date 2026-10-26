import os

# Cap native BLAS/OpenMP thread pools to 1 BEFORE numpy/pandas are imported
# (via the production router → openpyxl → numpy). The default of one thread per
# core overruns RLIMIT_NPROC on the shared host and aborts startup. setdefault
# so an explicit env override (or passenger_wsgi) still wins.
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

# One port, no root (app/supervisor.py — CLAUDE.md «Zero-downtime on ONE
# port»): under systemd the uvicorn CLI that imported this module becomes the
# SUPERVISOR holding the port, and the app runs in a child worker it swaps on
# a deploy and replaces after a crash. First thing, before anything heavy is
# imported — the supervisor stays tiny. A no-op for the worker and off systemd.
from app.supervisor import maybe_exec_supervisor  # noqa: E402

maybe_exec_supervisor()

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
from app.version import APP_VERSION, MIN_CLIENT, STARTED_AT, current_commit
from app.routers import admin, brigadirs, attendance, heatmap, workers, downtime, plan, comments, settings, translations, leaders, kaizen, activity, concerns, tasks, brigadir_tasks, profiles, leaderboard, quality, boot, ui_prefs, broadcast, setup_times, leader_tasks, leader_ai, leader_proof, leader_appeals, leader_checklist, idle_cell, cell_attendance, zagruzka_cell, attendance_batch, factories, worker_concerns, arc, arc_legacy, cell_hours, idle_source, exchange_audit, doc_audit, logs, live_overview, cell_concerns, education, idle_owner, shift_report, exam, exam_sandbox, kelish, android, verifix, verifix_sync, staff_live, push, verifix_explore, turnover, assistant, foreign_objects, category_compliance, leaders_kpi, ontime, reports, ops_door
from app.routers import ai_admin as ai_admin_router
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
    # Two phases (services/boot_steps.py): `run` = before the first request,
    # `later` = on a thread once the worker is ready, in this same order.
    # A column or a table is `run`; a data fix, a seed behind a flag, a
    # report or a DM is `later`. Each step is timed into the journal.
    from app.services.boot_steps import boot
    boot.begin()
    run, later = boot.run, boot.later
    run(Base.metadata.create_all, bind=engine)
    # A switched-off Verifix method keeps no probe row (wages, 2026-10-03).
    from app.services.verifix_explore import purge_blocked_probes
    later(purge_blocked_probes)
    from app.startup import (
        backfill_day_approvals, backfill_day_closures, backfill_deletion_batch_ids,
        seed_admins, seed_languages, seed_managers_and_sources, seed_exchange_tasks,
        add_edit_requests_batch_id, add_last_seen_column, migrate_multi_roles,
        migrate_leader_role_uniqueness, map_arc_brigadas_db,
        add_notification_template_columns, add_admin_language_column, add_tg_name_column,
        seed_production_pilot, resync_production_catalog, backfill_pp_actual_from_deliv,
        relax_pp_upload_manager, rescale_pp_efficiency_base,
        backfill_leader_page_access, open_cells_page_to_supervisors,
        open_production_page_to_managers,
        add_profiles_columns, migrate_cells_table,
        migrate_cells_leaders_columns, migrate_cell_supervisor_column,
        migrate_cell_in_load_column,
        add_cell_shift_times,
        add_cell_archive,
        add_cell_owner_columns,
        add_verifix_sync_columns,
        add_late_window_columns,
        add_dispute_ruling_column,
        seed_verifix_sync,
        add_cell_one_process,
        add_manager_kind_columns,
        turn_on_cells_of_counted_units,
        untick_cells_in_load,
        add_attendance_upload_source,
        add_arc_legacy_warehouse_columns,
        add_leader_kind_columns,
        add_education_thumb_url,
        add_idle_interval_client_key,
        add_idle_interval_cleaners,
        add_turnover_month_people_approx,
        add_leader_task_cell,
        add_late_proof_provenance,
        add_late_proof_timing,
        migrate_dispute_stages, purge_pre_september_appeals, purge_kelish_marks_before_start,
        backfill_appeal_threads, repair_appeal_threads,
        merge_brigadir_tasks_page,
        merge_leader_kpi_pages,
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
        set_gemini_model_pro,
        report_unpriced_ojidaniya,
        send_button_test,
        report_unpriced_ojidaniya_xlsx,
        report_zagruzka_gaps_xlsx,
        report_shared_work_centers,
        report_shared_work_centers_xlsx,
        report_cell_input_gaps_xlsx,
        notify_operator_education_lesson,
        report_shared_sap_cells_raw_xlsx,
        report_checklist_setup,
        export_ai_proofs,
        report_proof_archive,
        report_proof_review_sep19_20,
        report_auto_checks_sep20_21,
        report_auto_check_restore,
        report_missed_day_reports,
        report_missed_reports_resend,
        report_filling_times,
        report_t11_proofs,
        report_dispute_queue,
        report_wc_plan_history,
        report_brigadir_change_state,
        report_verifix_roles,
        report_pin_mismatch,
        apply_brigadir_change_oct24,
        report_dept_attendance,
        report_trudoyomkost_register,
        report_admin_objections,
        report_closed_day_trace,
        report_ontime_sheet,
        repair_live_copy_dupes,
        check_leader_kinds, check_leader_kind_pins,
        set_kenjayeva_photo_from_verifix,
        write_leader_task_examples,
        cleanup_rules_sep19,
        preview_leader_rules_sep19,
        patch_task10_description_sep19,
        register_leader_rules_sep19,
        register_leader_rules_sep26,
        register_leader_rules_oct07,
        register_leader_temp_hours,
        add_leader_auto_checks,
        register_leader_auto_sep20,
        register_leader_auto_t11,
        open_kelish_page,
        report_auto_schema,
        add_pp_product_auto_fill,
        add_pp_line_container_cap,
        add_pp_product_archive_columns,
        add_pp_product_uom,
        add_forecast_answer_columns,
        add_assistant_run_lease,
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
        add_notification_center,
        add_leader_submission_columns, add_broadcast_rich_columns,
        add_broadcast_resume_columns, add_broadcast_schedule_column,
        add_action_log_undo_column,
        add_broadcast_failures_column, add_broadcast_pin_columns, add_pp_product_op,
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
        migrate_permission_modes,
        migrate_user_capabilities,
        repoint_shift_report_sheet,
        wipe_cell_perenaladka_history,
        purge_leader_ai_history,
        drop_paused_shift_reviews,
        queue_shift2_backlog,
        fix_nodirjon_leader_unit,
        move_sanjarbek_checklist_shift,
        fix_cell_9123_oct05,
        repair_live_exchanges_oct08,
        put_cell_0811_back,
        land_waiting_leader_links,
        seed_one_process_cells,
    )
    # ⚠ TEMPORARY one-shot — remove this import with its module in the NEXT
    # version. Its own file, so removal is a delete rather than surgery here.
    from app.onetime_purge_test_units import purge_test_units
    # First: every ORM read of a profile selects these two columns.
    run(add_manager_kind_columns)
    run(add_leader_kind_columns)
    run(add_cell_owner_columns)
    run(add_verifix_sync_columns)
    run(add_late_window_columns)
    run(add_dispute_ruling_column)
    run(add_cell_one_process)
    run(add_last_seen_column)
    run(add_tg_name_column)
    run(add_edit_requests_batch_id)
    run(add_notification_template_columns)
    run(add_notification_recipient_profile)
    run(add_notification_center)
    run(add_admin_language_column)
    run(add_dm_reachability_columns)
    run(add_profiles_columns)
    run(migrate_cells_table)
    run(migrate_cells_leaders_columns)
    # The proof reviewer's single sealed Gemini key becomes a row of the
    # saved-key store (services/ai_review), once.
    # Every feature that calls an AI gets the key + model it ran on before the
    # per-feature «AI kalitlari» tab (once; services/ai_features.seed). Schema
    # phase: the reviewer, the assistant and the decks resolve through it.
    from app.startup import seed_ai_features
    run(seed_ai_features)
    run(migrate_cell_supervisor_column)
    run(migrate_cell_in_load_column)
    # Every cell of a unit whose загрузка is calculated starts ON (once).
    later(turn_on_cells_of_counted_units)
    # The operator's list of cells NOT counted in the загрузка (once).
    later(untick_cells_in_load)
    run(add_attendance_upload_source)
    run(add_arc_legacy_warehouse_columns)
    run(add_cell_shift_times)
    run(add_cell_archive)
    later(seed_verifix_sync)
    run(add_wc_groups)
    run(add_education_thumb_url)
    run(add_idle_interval_client_key)
    run(add_idle_interval_cleaners)
    run(add_turnover_month_people_approx)
    run(add_leader_task_cell)
    run(add_late_proof_provenance)
    run(add_late_proof_timing)
    run(migrate_dispute_stages)
    run(merge_brigadir_tasks_page)
    # 2026-10-19: the four leaders' KPI page keys → `leaders-kpi` (the merged
    # page); the stored matrix's roles are dropped, grants renamed.
    run(merge_leader_kpi_pages)
    run(create_action_log)
    # After the dispute stage columns and the action register it reports
    # into. One-shot: pre-September objections + late proofs, deleted.
    later(purge_pre_september_appeals)
    # One-shot: «Ish grafigi» starts 4 Oct 2026 — earlier marks cleared.
    later(purge_kelish_marks_before_start)
    # After the purge, so appeals it deletes never get a thread written.
    later(backfill_appeal_threads)
    later(repair_appeal_threads)
    later(letter_shared_cells)
    run(migrate_cell_ojidaniya_percat)
    run(migrate_cell_perenaladka)
    run(migrate_idle_interval_status)
    later(approve_pending_idle_requests)
    run(migrate_attendance_batches)
    later(seed_att_included_from_last_day)
    later(seed_idle_source_pilot)
    later(seed_pp_autofill_default)
    later(set_forecast_autocall_capacity)
    later(split_zagruzka_bands)
    later(seed_full90_bands)
    later(set_gemini_model_pro)
    run(add_pp_product_auto_fill)
    run(add_pp_line_container_cap)
    run(add_pp_product_archive_columns)
    run(add_pp_product_uom)
    run(add_forecast_answer_columns)
    run(add_assistant_run_lease)
    run(add_education_duration)
    run(migrate_pp_line_daily_key)
    later(correct_pp_double_counted_days)
    later(purge_production_history)
    later(reorder_positions_plan_before_fact)
    later(latin_twin_codes)
    later(seed_snabjenets_english_label)
    later(fix_orazov_schedule_2026_09_01)
    later(map_arc_brigadas_db)
    run(add_concern_profile_columns)
    run(add_concern_done_at)
    run(add_concern_level_columns)
    run(add_concern_level_since)
    run(add_concern_escalation_names)
    run(add_concern_shift_manager)
    run(add_concern_category)
    run(add_concern_seq)
    run(add_concern_worker_name)
    run(add_concern_deadline_from)
    run(add_concern_owner_columns)
    run(add_task_comment_author_ref)
    run(add_concern_comment_kind_column)
    run(add_task_assignee_kind_column)
    run(migrate_concern_solutions_to_thread)
    run(add_leader_submission_columns)
    run(add_broadcast_rich_columns)
    run(add_broadcast_resume_columns)
    run(add_broadcast_schedule_column)
    run(add_action_log_undo_column)
    run(add_broadcast_failures_column)
    run(add_broadcast_pin_columns)
    run(add_pp_product_op)
    run(add_downtime_ns_columns)
    run(add_attendance_supervisor_column)
    run(add_attendance_split_columns)
    later(purge_cell_exchange_sandbox)
    # After the column exists — it inserts rows carrying the flag.
    later(backfill_supervisor_attendance)
    run(add_leader_task_setting_names)
    run(add_leader_task_criteria)
    run(add_leader_task_windows)
    run(add_leader_task_deadlines)
    run(add_leader_task_description)
    run(add_leader_task_date_check)
    run(add_leader_task_time_check)
    run(add_leader_task_day_check)
    run(add_leader_task_date_plus)
    # Schema for the automatic checklist tasks. Permanent, not a one-shot:
    # `create_all` never ALTERs an existing table, and the ledger's unique key
    # is an EXPRESSION index. It MUST run here, with the other DDL and before
    # `report_leader_deadline_rules` — that report is the only caller of
    # `leader_auto_rollout.self_check`, and with the column still missing every
    # ORM read of LeaderTaskDef raises, so the boot that applies the rollout
    # would be the one boot whose self-check was skipped.
    run(add_leader_auto_checks)
    run(add_leader_task_proof_kind)
    run(add_leader_task_catalog)
    run(add_leader_task_example_scope)
    run(add_leader_entry_closed_at)
    run(add_leader_day_reopened)
    run(add_leader_unit_bot_from)
    # After the column exists — both of these write values into it.
    later(reset_leader_camera_pilot)
    later(set_camera_pilot_bot_from)
    run(add_leader_photo_client_key)
    run(add_leader_ai_resolution)
    run(add_leader_ai_reviewed_index)
    # After add_leader_ai_resolution — the backfill reads reviewed rows.
    run(add_leader_ai_clocks)
    run(add_profile_identity_columns)
    run(add_activity_profile_key)
    run(add_web_credential_password_enc)
    # The /arc integration: seed the internal key into .env (and into this
    # process) BEFORE the mirror reset and before register_arc_jobs below,
    # which declines outright without one.
    run(ensure_internal_api_key)
    run(reset_arc_mirror)
    run(migrate_multi_roles)
    # After migrate_multi_roles — it owns the table's columns; this re-keys it.
    run(migrate_leader_role_uniqueness)
    later(backfill_leader_page_access)
    later(open_cells_page_to_supervisors)
    later(open_production_page_to_managers)
    run(seed_admins)
    run(seed_languages)
    run(seed_managers_and_sources)
    # After the manager seed, so freshly seeded units land in the first factory
    # instead of staying unassigned.
    run(migrate_factories)
    run(add_role_profile_factory)
    later(repoint_shift_report_sheet)
    later(wipe_cell_perenaladka_history)
    later(purge_leader_ai_history)
    # After purge_leader_ai_history (no point re-judging rows about to be
    # dropped) and after the window + clocks columns it reads exist.
    later(sync_leader_ai_dates)
    # After the date sync, which is what settles a row's shift: the pause
    # cleanup reads it to decide what leaves the queue.
    later(drop_paused_shift_reviews)
    # After the pause cleanup and the date sync it reads: the backlog is only
    # queueable once a row's shift is settled, and only while nothing is paused.
    later(queue_shift2_backlog)
    later(backfill_role_profiles)
    later(backfill_concern_profiles)
    later(backfill_concern_owner)
    # After the cell + manager seeds — it reads both to resolve a concern's unit.
    later(backfill_concern_units)
    later(backfill_role_profile_keys)
    later(backfill_task_profiles)
    later(backfill_comment_profiles)
    run(migrate_user_capabilities)
    run(migrate_permission_modes)
    later(seed_exchange_tasks)
    later(seed_production_pilot)
    later(seed_setup_times)
    later(resync_production_catalog)
    later(relax_pp_upload_manager)
    later(backfill_pp_actual_from_deliv)
    later(rescale_pp_efficiency_base)
    later(backfill_day_approvals)
    later(backfill_day_closures)
    later(backfill_deletion_batch_ids)
    from app.telegram_bot import setup_webhook
    later(setup_webhook)
    # Continue any broadcast fan-out orphaned by a process restart mid-send
    # (mirrored in passenger_wsgi.py — prod boots through that entrypoint).
    from app.routers.broadcast import register_scheduled_broadcasts, resume_stuck_broadcasts
    run(resume_stuck_broadcasts)
    # Background jobs. The scheduler holds its timers in memory only, so every
    # boot rebuilds them from the rows that own them; a deploy landing between
    # composing a broadcast and its send time therefore costs nothing.
    run(start_scheduler)
    run(register_scheduled_broadcasts)
    # The AI proof reviewer used to move only when a human hit Refresh; now the
    # queue drains itself (mirrored in passenger_wsgi.py).
    from app.services.leader_ai import register_drain_job
    run(register_drain_job)
    # Per-task submission: close tasks whose deadline has gone by.
    from app.services.leader_close import register_autoclose_job
    run(register_autoclose_job)
    # ⚠ TEMPORARY report (2026-10-25) — every shift-manager, brigadir and
    # leader as Verifix lists them, with their shifts, DMed once to the
    # operator as text + a workbook. Only SCHEDULES a job (one flag read), so
    # it sits in the boot phase where no deferred step can hold it back.
    # Remove this line, `startup.report_verifix_roles` and
    # `services/verifix_roles_report_oct25.py` once it has been sent.
    run(report_verifix_roles)

    # ⚠ TEMPORARY report (2026-10-26) — where «Odam soni» on «Zagruzka fayli»
    # and the загрузка's own headcount count different typed pins, with the
    # load each affected unit-day reads now against the page's own Σ. READ-ONLY,
    # DMed once. Only SCHEDULES a job (one flag read), so it sits in the boot
    # phase. Remove this line, `startup.report_pin_mismatch` and
    # `services/pin_mismatch_report.py` once it has been sent.
    run(report_pin_mismatch)

    # The day-reconciliation watch: DMs admins when the platform stops showing
    # someone the uploaded file says worked (services/attendance_reconcile).
    from app.services.attendance_watch import register_watch as register_reconcile_watch
    run(register_reconcile_watch)
    # ARC ticket mirror: quick pass every 15 min, full walk nightly + boot
    # catch-up (mirrored in passenger_wsgi.py; skips without credentials).
    from app.services.arc_sync import register_boot_jobs as register_arc_jobs
    run(register_arc_jobs)
    # The OLD login API's mirror (/arc-legacy): same cadence, its own tables and
    # job ids, full walk at 03:45 (mirrored in passenger_wsgi.py; skips without
    # the ARC_USERNAME/ARC_PASSWORD credential).
    from app.services.arc_legacy_sync import register_boot_jobs as register_arc_legacy_jobs
    run(register_arc_legacy_jobs)
    # The call forecast, sent by the clock: shift 1 at 19:00, shift 2 at 06:00,
    # each for its own next shift-day (mirrored in passenger_wsgi.py).
    from app.services.forecast_autocall import register_jobs as register_autocall_jobs
    run(register_autocall_jobs)
    # «Imtihon»: expire overdue attempts at 00:05, due-soon notices at 09:00
    # (mirrored in passenger_wsgi.py).
    from app.services.exam import register_jobs as register_exam_jobs
    run(register_exam_jobs)
    # «Kadrlar qo'nimsizligi»: read Verifix's directory nightly at 23:40 (a
    # month's last read takes its list of working people), close ended
    # months at 09:05, catch up after boot (mirrored in passenger_wsgi.py).
    from app.services.turnover_sync import register_jobs as register_turnover_jobs
    run(register_turnover_jobs)
    # «Tarkib» on /workers: read Verifix's working people (gender, age,
    # hiring date, coarse place) every 3 h and after boot (mirrored).
    from app.services.workforce import register_jobs as register_workforce_jobs
    run(register_workforce_jobs)
    # «Toifaga muvofiqlik»: read Verifix's three HR journals nightly at 23:55
    # (after the directory), catch up after boot (mirrored in passenger_wsgi.py).
    from app.services.category_sync import register_jobs as register_category_jobs
    run(register_category_jobs)
    # «O'z vaqtida yetkazish»: read the on-time sheet every two hours from
    # 07:20, and catch up after boot (mirrored in passenger_wsgi.py).
    from app.services.ontime_sync import register_jobs as register_ontime_jobs
    run(register_ontime_jobs)
    # The report door: expire unanswered / untaken questions every minute and
    # redraw their cards; make the SELECT-only reader role (mirrored).
    from app.services.ops_door import register_jobs as register_ops_door_jobs
    from app.services.ops_door import ensure_reader_role
    run(register_ops_door_jobs)
    later(ensure_reader_role)
    # /staff's live days: read Verifix every minute,
    # store it, tell a brigadir once everybody who came has left (mirrored).
    from app.services.verifix_live import register_jobs as register_staff_live_jobs
    run(register_staff_live_jobs)
    # The Verifix live sync (2026-10-12): the org read + pass, and the dated
    # cell links landing at each unit's shift opening.
    from app.services.verifix_sync import register_jobs as register_verifix_sync_jobs
    run(register_verifix_sync_jobs)
    from app.services.cell_links import register_jobs as register_cell_link_jobs
    run(register_cell_link_jobs)

    # Say out loud which mutating routes the action register cannot classify.
    # They are still recorded (under «other»), so nothing is lost silently —
    # this is what keeps ONE list from quietly going stale.
    later(report_unclassified_routes, app)
    # …and whether the task-closing arithmetic still holds. Twice a task
    # has been closed at an hour nobody intended and nothing said so; the
    # only signal was a leader losing points. There is no test suite here
    # and a push to main is a deploy, so boot is the earliest a
    # regression can be caught.
    later(report_leader_deadline_rules)
    # …and whether the task CATALOG still adds up: an archived task units
    # still switch on, a spent floor, or weights that no longer total 100 —
    # the last of which silently re-bases every leader's percentage.
    later(report_leader_task_catalog)
    later(report_wc_groups)
    # ⚠ TEMPORARY one-shot — remove this line and its module in the NEXT
    # version. Inert until a unit is named in `PURGE_TEST_UNITS`. Runs last, so
    # every table it deletes from is guaranteed to exist by now.
    later(purge_test_units)
    # ⚠ TEMPORARY one-shots (2026-09-09) — the operator asked, once, for the
    # register behind «Xarajat»'s «Narxlanmagan, daq» card: first as a table in
    # the message, then as a workbook. Each is flag-guarded, so each delivers on
    # the first boot after its own deploy and never again. Remove both lines,
    # `services/unpriced_report.py` and `build_unpriced_workbook` once the file
    # has landed.
    later(report_unpriced_ojidaniya)
    later(send_button_test)
    later(report_unpriced_ojidaniya_xlsx)
    # ⚠ TEMPORARY one-shot (2026-09-09) — the operator asked, once, for what is
    # still UNFILLED before the загрузка can be trusted: «Odam soni» missing on a
    # work centre that has a plan, ojidaniya filed on a cell with no plan, and
    # everything else that blanks or skews the number. Flag-guarded, so it
    # delivers on the first boot after this deploy and never again. Remove this
    # line and `services/zagruzka_gaps.py` once the file has landed.
    later(report_zagruzka_gaps_xlsx)
    # Which SAP work centres more than one unit claims — the registry, the
    # catalog overlaps and the quantities written twice. One DM, once; delete
    # this line and `services/shared_wc_report.py` once it has landed.
    later(report_shared_work_centers)
    # …and the same register as a four-sheet workbook. Its own flag: the
    # operator asked for the file after the message.
    later(report_shared_work_centers_xlsx)
    # ⚠ TEMPORARY one-shot (2026-09-10) — the cells the verifix upload put
    # PEOPLE in, where nobody wrote a plan or an «Odam soni» on «Zagruzka
    # fayli» for that cell on that date. Not a widening of the report above:
    # that one asks its cell questions of the cells that FILED OJIDANIYA, so
    # a cell where people stood all shift and nothing was filed is invisible
    # to it. Flag-guarded — first boot after this deploy, never again. Remove
    # this line and `services/cell_input_gaps.py` once the file has landed.
    later(report_cell_input_gaps_xlsx)
    # ⚠ TEMPORARY one-shot (2026-09-11) — the operator asked to receive, once,
    # the notification the only «Ta'lim» lesson sends its audience: the same
    # card and button, DMed to their own chat, and nothing else. Flag-guarded —
    # first boot after this deploy, never again. Remove this line and
    # `startup.notify_operator_education_lesson` once it has landed.
    later(notify_operator_education_lesson)
    # ⚠ TEMPORARY one-shot (2026-09-11) — every group of cells that carry one
    # SAP code, as an UNFORMATTED workbook (header row + one row per cell) in
    # the operator's chat. Broader than the shared-work-centre file above: a
    # code several cells of ONE unit carry is in too. Flag-guarded — first boot
    # after this deploy, never again. Remove this line and
    # `shared_wc_report.send_cells_raw_xlsx` once it has landed.
    later(report_shared_sap_cells_raw_xlsx)
    # ⚠ TEMPORARY one-shot (2026-09-17) — the leader checklist as production
    # runs it (every level of the task chain, filing times, a proof sample), as
    # ZIP files in the operator's chat, before the new rules go to every unit.
    # Scheduled, flag-guarded — delivers once. Remove this line,
    # `startup.report_checklist_setup` and `services/checklist_setup_report.py`
    # once it has landed.
    later(report_checklist_setup)
    # ⚠ TEMPORARY one-shot (2026-10-12) — every checklist proof of 9–11 Oct
    # with a manifest, as ZIP files in the operator's chat, for a LOCAL test
    # of another vision model. Scheduled, flag-guarded — delivers once.
    # Remove this line, `startup.export_ai_proofs` and
    # `services/ai_proof_export.py` once it has landed.
    later(export_ai_proofs)
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
    later(report_proof_archive)
    # ⚠ TEMPORARY one-shot (2026-09-21) — EVERY proof photo of the checklist
    # days 19.09 and 20.09 with its AI verdict, the criteria it was judged
    # against, admin approvals and upheld objections, as ZIP parts in the
    # operator's chat (report.json in each). Scheduled, flag-guarded,
    # resumes after a restart — delivers once. Remove this line,
    # `startup.report_proof_review_sep19_20` and
    # `services/proof_review_report.py` once the files have landed.
    later(report_proof_review_sep19_20)
    # ⚠ TEMPORARY one-shot (2026-09-22) — the automatic checks of 20–21.09
    # (#1, #9, #8), every verdict with its cause and whose fault it was, as a
    # summary + .xlsx + .json in the operator's chat. Scheduled, flag-guarded —
    # delivers once. Remove this line, `startup.report_auto_checks_sep20_21`
    # and `services/auto_check_report.py` once the files have landed.
    later(report_auto_checks_sep20_21)
    # ⚠ TEMPORARY one-shot (2026-09-22) — the points «one cell is enough» gives
    # back: every earlier auto-check failure of a multi-cell leader that the new
    # rule passes, proven on time, as a list + ONE button in the operator's
    # chat. Remove this line, `startup.report_auto_check_restore`, the `acr:`
    # callback and `services/auto_check_restore.py` once the button is used.
    later(report_auto_check_restore)
    # ⚠ TEMPORARY one-shot (2026-09-22) — every leader-day since 1 Sep: was its
    # day report sent, and if not, why (a day parked while still open and never
    # retried). Summary + .xlsx + .json in the operator's chat, flag-guarded —
    # delivers once. Remove this line, `startup.report_missed_day_reports` and
    # `services/missed_report_audit.py` once the files have landed.
    later(report_missed_day_reports)
    # ⚠ TEMPORARY one-shot (2026-09-23) — day reports 16 Sep → today: did the
    # leaders get them, who missed which dates; the 16–22 Sep ones never sent
    # go out only when the operator taps one of its two buttons. Flag-guarded
    # — delivers once. Remove this line, `startup.report_missed_reports_resend`,
    # the `mrr:` callback and `services/missed_report_resend.py` once used.
    later(report_missed_reports_resend)
    # ⚠ TEMPORARY one-shot (2026-09-23) — when Normanov finished filling his
    # plan and people on 23 Sep, and what stood at 10:00, DMed once to the
    # operator. Remove this line, `startup.report_filling_times` and
    # `services/filling_times_report.py` once it has been sent.
    later(report_filling_times)
    # ⚠ TEMPORARY one-shot (2026-09-28) — every task-11 proof of 21–27.09
    # with its AI verdict, the reason for a rejection and who approved it
    # (the operator or another admin, by Telegram id), as a zipped folder
    # in the operator's chat (t11-proofs.json in each part). Scheduled,
    # flag-guarded, resumes after a restart — delivers once. Remove this
    # line, `startup.report_t11_proofs` and `services/t11_proof_report.py`
    # once the files have landed.
    later(report_t11_proofs)
    # ⚠ TEMPORARY one-shot (2026-09-28) — September's objections to AI
    # rejections still waiting on a brigadir, in total and per brigadir,
    # DMed once to the operator as text. Remove this line,
    # `startup.report_dispute_queue` and `services/dispute_queue_report.py`
    # once it has been sent.
    later(report_dispute_queue)
    # ⚠ TEMPORARY report (2026-10-24) — the state of units 9, 6, 5 and 10
    # before their brigadirs change, DMed once to the operator as text + a
    # .txt file. Remove this line, `startup.report_brigadir_change_state` and
    # `services/brigadir_change_report_oct24.py` with the change one-shot.
    later(report_brigadir_change_state)
    # ⚠ TEMPORARY one-shot (2026-10-24) — the four units change brigadir as
    # ruled (docs/plan-brigadir-change-oct24.md). Remove this line,
    # `startup.apply_brigadir_change_oct24` and `services/brigadir_change_oct24.py`
    # once its flags read «done».
    later(apply_brigadir_change_oct24)
    # ⚠ TEMPORARY one-shot (2026-10-04) — did work centre A1437 ever carry a
    # plan on Suvonov Elshod OF's «Zagruzka fayli»? DMed once to the operator
    # as text + a workbook. Remove this line, `startup.report_wc_plan_history`
    # and `services/wc_plan_history_report.py` once it has landed.
    later(report_wc_plan_history)
    # ⚠ TEMPORARY one-shot (2026-10-05) — «Департамент по продукту и
    # технологиям»: its clock-in/out for 28.09–04.10 from Verifix, DMed once to
    # the operator as text + a workbook. Remove this line,
    # `startup.report_dept_attendance` and `services/dept_attendance_report.py`
    # once it has landed.
    later(report_dept_attendance)
    # ⚠ TEMPORARY one-shot (2026-10-14) — the whole Трудоемкость register
    # (supervisor · SAP code · work centre · faza · process · seconds per piece) as a
    # workbook, DMed once to the operator. Remove this line,
    # `startup.report_trudoyomkost_register` and
    # `services/trudoyomkost_register_report.py` once it has landed.
    later(report_trudoyomkost_register)
    # ⚠ TEMPORARY one-shot (2026-10-20) — every objection waiting on an ADMIN
    # ruling, with every detail needed to check it (task rules, AI verdict,
    # proof photos, the examples the AI was shown, the whole chat), DMed once
    # to the operator as a workbook + ZIP parts. Scheduled, flag-guarded,
    # resumes after a restart. Remove this line, `startup.report_admin_objections`
    # and `services/admin_objections_report.py` once the files have landed.
    later(report_admin_objections)
    # ⚠ TEMPORARY one-shot (2026-10-20) — Yog'mirov Feruz says his 18.10 was
    # not red when he closed it: every input of that unit-day with its
    # timestamps against the close, the Jurnal and the shift-2 grid, DMed once
    # to the operator. Read-only. Remove this line,
    # `startup.report_closed_day_trace` and
    # `services/closed_day_trace_report.py` once it has landed.
    later(report_closed_day_trace)
    # ⚠ TEMPORARY one-shot (2026-10-21) — opens the ORIGINAL on-time sheet with
    # production's service account, runs the page's reader over it without
    # storing anything and sets the page's arithmetic against the sheet's own
    # «свод», DMed once to the operator. Read-only. Remove this line,
    # `startup.report_ontime_sheet` and `services/ontime_sheet_report.py` once
    # it has landed.
    later(report_ontime_sheet)
    # ⚠ TEMPORARY one-shot (2026-10-20) — the live copies written twice at
    # once (Yog'mirov Feruz's 18.10: 130 rows for 65 people): their exact
    # duplicates deleted, split halves untouched, each fix in the Jurnal, the
    # list DMed once to the operator. WRITES attendance. Remove this line,
    # `startup.repair_live_copy_dupes`, `services/live_copy_dedup_oct20.py` and
    # `tests/test_live_copy_dedup_oct20.py` once the DM has landed.
    later(repair_live_copy_dupes)
    # ⚠ TEMPORARY one-shot (2026-10-04) — fills every leader profile's
    # «Lider / Lider o'rnida» switch from Verifix's API and DMs the operator who
    # is which. Remove this line, `startup.check_leader_kinds` and
    # `services/leader_verifix_check.py` once it has been sent.
    later(check_leader_kinds)
    # …and the operator's name corrections to it (`leader_verifix_check.PINS`),
    # once per pin set. Goes with the line above.
    later(check_leader_kind_pins)
    # ⚠ TEMPORARY one-shot (2026-10-12) — Kenjayeva Dinora Sobir Qizi's
    # Verifix photo (and Verifix tie) on the leader profile renamed to her
    # from Mukimova Marxabo; DMs the result with the photo. Remove this
    # line, `startup.set_kenjayeva_photo_from_verifix` and
    # `services/leader_photo_fix_oct12.py` once the DM has landed.
    later(set_kenjayeva_photo_from_verifix)
    # ⚠ TEMPORARY one-shot (2026-09-19) — the example photos the operator picked
    # against the new criteria, written at the GLOBAL level of nine tasks and
    # REPLACING what was there. Inline, not scheduled: it is config today's
    # reviews are judged against. Flag-guarded — applies once. Remove this line,
    # `startup.write_leader_task_examples`,
    # `services/leader_task_examples_sep19.py` and `app/data/task_examples/`
    # once it has landed.
    later(write_leader_task_examples)
    # ⚠ TEMPORARY one-shot (2026-09-19) — clear what the go-live left behind:
    # the «YANGI TALAB» preview notice, which now contradicts itself, and the
    # example photos of the three tasks that become automatic checks. Inline and
    # flag-guarded. Remove with `leader_rules_sep19`.
    later(cleanup_rules_sep19)
    # ⚠ TEMPORARY one-shot (2026-09-19) — the leader-checklist rules the
    # operator agreed on 18 Sep: unit-level AI criteria and Uzbek leader
    # descriptions, task 11 «+1 day», task 13 time-only, task 3 three photos.
    # Two flag-guarded passes, each armed to fire while its own shift is NOT
    # running. Re-armed on every boot (memory jobstore); the flags stop a second
    # run. Remove this line, `startup.register_leader_rules_sep19` and
    # `services/leader_rules_sep19.py` once BOTH passes have landed.
    later(register_leader_rules_sep19)
    # ⚠ TEMPORARY one-shot (2026-09-25) — the AI criteria revised from the
    # operator's reasons for the 50 flags lifted on 19–20 Sep: tasks 3, 6, 7,
    # 11, 13 + a leader-level «one-process cell» text for task 3. CRITERIA only
    # (leader instructions untouched). Two flag-guarded passes, each in its own
    # shift's gap, then the global baseline. Remove this line,
    # `startup.register_leader_rules_sep26` and `services/leader_rules_sep26.py`
    # once all three flags are set — and BEFORE removing leader_rules_sep19,
    # whose texts the pass compares against.
    later(register_leader_rules_sep26)
    # ⚠ TEMPORARY one-shot (2026-10-07) — task 4 (obxod): every Tasker
    # inspection at 100%, date + time over the whole shift. Two flag-guarded
    # passes, each in its own shift's gap, then the global baseline. Remove this
    # line, `startup.register_leader_rules_oct07` (+ its job and DM) and
    # `services/leader_rules_oct07.py` once all three flags are set — but KEEP
    # `services/leader_rule_eras.py` and its frozen row: they date the change.
    later(register_leader_rules_oct07)
    # Temporary task hours (2026-09-28): cells working later for a few nights
    # move their leaders' checklist hours on those nights only — see
    # `services/leader_temp_hours.py`. NOT a one-shot to delete: the frozen
    # rows are history the verdict re-derive reads on every boot.
    later(register_leader_temp_hours)
    # ⚠ TEMPORARY (20.09.2026): tasks 1, 8 and 9 become automatic checks.
    # Delete this line, `startup.register_leader_auto_sep20`,
    # `startup._leader_auto_job/_leader_auto_dm/_auto_run_at/_auto_first_check`
    # and `services/leader_auto_rollout.py` once BOTH flags are set.
    # `add_leader_auto_checks` and `services/leader_auto.py` STAY — they are
    # the feature, not the rollout.
    # Says once whether that schema really landed. The only way to see
    # production's catalog from outside — see its docstring.
    later(report_auto_schema)
    later(register_leader_auto_sep20)
    # ⚠ TEMPORARY (05.10.2026): task #11 becomes the «Ish grafigi» automatic
    # check, /kelish opens to leaders/brigadirs/shift-managers, and the 4 Oct
    # transition grant runs. Delete these two lines, `startup.open_kelish_page`
    # (keep the access it wrote), `startup.register_leader_auto_t11` + its two
    # jobs and `services/leader_auto_t11.py` once all three flags are set.
    later(open_kelish_page)
    later(register_leader_auto_t11)
    # ⚠ TEMPORARY one-shot (2026-09-18) — publish the new leader INSTRUCTIONS
    # early so leaders can read them and prepare. Descriptions only: nothing
    # they are scored by changes until the two passes above fire on the 19th.
    # Remove with them.
    later(preview_leader_rules_sep19)
    later(patch_task10_description_sep19)
    # ⚠ TEMPORARY one-shot (2026-09-26) — Turdimurodov Nodirjon's checklist
    # days stamped with Aripova Manzura's unit go back to his own unit. Inline
    # and flag-guarded. Remove this line, `startup.fix_nodirjon_leader_unit`
    # and `services/leader_unit_fix_sep26.py` once its flag reads «done».
    later(fix_nodirjon_leader_unit)
    # Jumaniyazov Sanjarbek's checklist runs on shift 1 from 6 Oct (once).
    later(move_sanjarbek_checklist_shift)
    # ⚠ TEMPORARY one-shot (2026-10-06) — cell 9123's 5 Oct attendance counts
    # for Raximova Kamola (it moved a day early); re-checks every 10 min until
    # it lands. Remove this line, `startup.fix_cell_9123_oct05` and
    # `services/cell_day_fix_oct05.py` once its flag reads «done».
    later(fix_cell_9123_oct05)
    # ⚠ TEMPORARY one-shot (2026-10-08) — the exit-minute exchanges of 6–7 Oct
    # become whole-day moves and the closed live days of 6–7 Oct are re-copied
    # under the fixed engine. Remove this line, `startup.repair_live_exchanges_oct08`
    # and `services/live_exchange_repair_oct08.py` once its flag reads «done».
    later(repair_live_exchanges_oct08)
    # ⚠ TEMPORARY one-shot (2026-10-14) — cell 0811 back in «Turdimurodov
    # Nodirjon» from the day the 13 Oct Verifix-sync move landed. Remove this
    # line, `startup.put_cell_0811_back` and `services/cell_unit_fix_oct14.py`
    # once its flag and DM flag read «done».
    later(put_cell_0811_back)
    # ⚠ TEMPORARY one-shot (2026-10-17) — «Boshqaruvchi» / «Egasi» changes
    # still waiting for the next shift opening count from the day they were
    # made. Remove this line, `startup.land_waiting_leader_links` and its flag
    # constant once the flag reads «done».
    later(land_waiting_leader_links)
    # ⚠ TEMPORARY one-shot (2026-10-10) — the five one-process leaders of
    # 25 Sep: their cells get «Bitta jarayon», their leader-level task-3 text
    # goes (the flag hands them the same text). Remove this line,
    # `startup.seed_one_process_cells` and `services/one_process_seed_oct10.py`
    # once its DM flag reads «done».
    later(seed_one_process_cells)

    # Import every app module NOW, while this copy's files are still the ones
    # it was started from. A blue-green deploy (deploy/deploy.sh) checks the
    # NEXT version out over this directory and keeps this copy serving while
    # the next one boots, so a module imported lazily for the first time in
    # that window would be the NEW file inside the OLD process. After this,
    # every later `import` inside a function is a sys.modules lookup.
    run(_warm_import_app)
    # The dated-link and archive-span caches, read once before the first
    # request: cold, every reader of a cell's day waits on ONE loader that
    # needs a second pool connection — at the post-deploy reload burst, with
    # the pool full, that is a platform-wide stall.
    try:
        from app.services import cell_archive, cell_links
        cell_links.events()
        cell_archive.spans()
    except Exception as exc:  # noqa: BLE001 — a cold cache still works, slower
        print(f"[startup] cell link / span cache warm-up skipped: {exc}", flush=True)

    # The server's own account of being slow (services/perf_watch) starts
    # only once the DEFERRED startup work below has finished — on the loop,
    # where it must run — so neither the startup work on the loop nor the
    # walks on the deferred thread are ever read as a stall.
    import asyncio
    from app.services import perf_watch
    _loop = asyncio.get_running_loop()

    # «Mening o'rnim»'s pool, built off the boot path so the first leader or
    # brigadir after a deploy is not the one who waits for it.
    from app.routers import leaders as _leaders_router
    _leaders_router.warm_standing()

    # One port, no root (app/supervisor.py): this worker is READY — the
    # supervisor stops answering for it and retires the worker it replaces.
    # A no-op when nothing supervises. Then why this process booted, told to
    # the support chat when it was not an ordinary deploy swap
    # (services/boot_report.py) — off the loop, a few seconds from now.
    from app.supervisor import signal_ready
    from app.services import boot_report
    boot.ready()
    signal_ready()
    boot_report.schedule()
    boot.start_deferred(finally_=lambda: _loop.call_soon_threadsafe(perf_watch.start))

    yield
    # First: hand every live «Yordamchi» run over to the next process, while
    # the loop still runs — uvicorn re-raises SIGTERM after this shutdown, and
    # a run left to that died without a word (2026-10-19).
    from app.services import assistant as _assistant_engine
    try:
        await _assistant_engine.handoff()
    except Exception:
        logging.getLogger(__name__).exception("assistant hand-off at shutdown failed")
    boot.join(45)
    perf_watch.stop()
    run(shutdown_scheduler)


def _warm_import_app() -> None:
    import importlib
    import pkgutil
    import app as _app_pkg
    failed = []
    for mod in pkgutil.walk_packages(_app_pkg.__path__, "app."):
        if mod.name.startswith("app.onetime_"):
            continue
        try:
            importlib.import_module(mod.name)
        except Exception as exc:  # an optional dependency, never fatal
            failed.append(f"{mod.name}: {exc.__class__.__name__}")
    if failed:
        logging.getLogger(__name__).warning("Warm import skipped %d module(s): %s",
                                            len(failed), "; ".join(failed[:10]))


# Every /api/* request must carry a valid Telegram initData header (verified
# hash + freshness), enforced app-wide. /admin/* API routes are guarded per
# router below (so SPA navigations to /admin/* aren't mistaken for API calls).
app = FastAPI(title="Zagruzka KPI API", version=APP_VERSION, lifespan=lifespan,
              docs_url=None if cfg.is_production else "/docs", redoc_url=None,
              openapi_url=None if cfg.is_production else "/openapi.json",
              dependencies=[Depends(enforce_telegram_origin_global)])

# A handler's answer is turned into JSON in the threadpool, never on the one
# event loop (services/json_offload.py — a 30 MB answer walked for 4.7 s there).
from app.services import json_offload  # noqa: E402
json_offload.install()


from sqlalchemy.exc import OperationalError  # noqa: E402


@app.exception_handler(OperationalError)
async def statement_timeout_handler(request: Request, exc: OperationalError):
    """A request statement past database.REQUEST_STATEMENT_TIMEOUT_MS was
    cancelled by Postgres (57014): a JSON 503 with a sentence the page can show,
    WITHOUT X-Safia-Restarting — the client must not retry a query that just ran
    out of time. Any other OperationalError keeps the generic 500 below."""
    if getattr(getattr(exc, "orig", None), "pgcode", None) == "57014":
        logging.getLogger("app.db").warning(
            "[STATEMENT-TIMEOUT] %s %s answered 503", request.method, request.url.path)
        return JSONResponse(status_code=503, content={
            "detail": "This took too long and was stopped — try again in a minute.",
            "code": "query_timeout",
        })
    return await unhandled_exception_handler(request, exc)


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
_CORS_ORIGINS = cfg.cors_origin_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-App-Version", "X-App-Min-Client", "X-Server-Ms", "X-Server-Stall-Ms"],
)

# Ghost Mode: admins can suppress change-notifications via the X-Ghost-Mode
# header. Must wrap the route handlers so its ContextVar is visible inside them.
from app.notify_ctx import GhostModeMiddleware  # noqa: E402
app.add_middleware(GhostModeMiddleware)

# The action register: one row for every mutating request, automatically.
# Added AFTER GhostModeMiddleware, so it wraps it — deliberate. Ghost Mode is a
# request-scoped flag, and a flag that rides the request must never be able to
# silence the audit OF that request, so this middleware reads the ghost header
# itself (recording it as a column) instead of consulting a ContextVar that is
# already reset by the time it finishes. See app/services/action_log.py.
from app.services.action_log import ActionLogMiddleware  # noqa: E402
app.add_middleware(ActionLogMiddleware)

# The dashboard exam's write-guard backstop: added AFTER ActionLogMiddleware,
# so it wraps it and refuses a real-table write before that write is even
# logged. The client already refuses to send these (utils/api.js); this is
# what makes "nothing during an exam changes real data" true even when a page
# the sandbox has not covered tries anyway. See app/services/exam_sandbox.py.
from app.services.exam_sandbox import ExamWriteGuardMiddleware  # noqa: E402
app.add_middleware(ExamWriteGuardMiddleware)


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
    # Lesson posters are hot-linked from the providers' own CDNs. The set is
    # closed by services/education_video, which accepts three providers and
    # verifies the URL before it is ever stored.
    "img-src 'self' data: blob: https://i.ytimg.com https://cdn.loom.com "
    "https://i.vimeocdn.com; "
    # «Ta'lim» plays a LOOM lesson in the app's own <video>, for every viewer,
    # because Loom's embed exposes no playback events and a lesson that cannot
    # be measured cannot be reported on. The bytes are streamed by the viewer's
    # browser straight from Loom's CDN — nothing is downloaded and nothing is
    # stored here. ONE fixed host, which is what keeps this expressible: a
    # "paste any link" field would need media-src *.
    "media-src 'self' data: blob: https://cdn.loom.com; "
    # «Ta'lim» (/education) frames the other two providers. A lesson's link is
    # parsed by services/education_video, which accepts three providers and
    # refuses everything else — so this list is the whole of what can ever be
    # framed, and a pasted link cannot widen it. A cross-origin iframe cannot
    # read this origin's token, so it does not reopen what connect-src is
    # guarding. www.loom.com is deliberately ABSENT: Loom's own player is shown
    # to nobody (the operator's call, 2026-09-11), and leaving its host out
    # makes that a rule the browser enforces rather than one the code must
    # remember.
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com; "
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
        # camera if Telegram's own `allow` attribute delegates it. The MICROPHONE
        # joined on the same terms on 2026-10-05, for «Yordamchi»'s voice
        # messages. Geolocation stays fully denied.
        (b"permissions-policy", b"camera=(self), microphone=(self), geolocation=()"),
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


class AppVersionMiddleware:
    """Put the running build on every API response.

    Two constant headers, read by the browser bundle's axios interceptor
    (``frontend/src/utils/compat.js``):

      ``X-App-Version``     which build answered this request
      ``X-App-Min-Client``  the oldest bundle this build still serves

    A push to main deploys immediately and this app is left OPEN for whole
    shifts — a phone in a pocket, a tab on a desk — so a bundle routinely talks
    to a backend newer than itself. The 5-minute ``build.json`` poll already
    notices that a NEWER build exists; only this says whether the tab's own
    build is still SERVED, and it says it on the very first request the stale
    tab makes rather than letting the user discover it as an unexplained 422.

    The floor is derived from MAJOR (see app/version.py), so this refuses
    nothing and blocks nothing: it states a fact, and the client decides what
    to show. Enforcing it here would mean cutting off a tab holding a
    half-typed attendance draft, which is a worse outcome than the staleness.

    Pure ASGI, like the middleware around it. Scoped to the API prefixes — the
    SPA's own assets are content-hashed and have no client to inform.
    """

    _PREFIXES = ("/api", "/admin")

    def __init__(self, app):
        self.app = app
        # Built once: these never change for the life of the process.
        self._headers = [(b"x-app-version", APP_VERSION.encode("ascii", "ignore"))]
        if MIN_CLIENT:
            self._headers.append((b"x-app-min-client", MIN_CLIENT.encode("ascii", "ignore")))

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not scope.get("path", "").startswith(self._PREFIXES):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                message["headers"] = list(message.get("headers", [])) + self._headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(AppVersionMiddleware)

# Outermost of all: every API request is timed from the moment the app receives
# it, stamped with `X-Server-Ms` / `X-Server-Stall-Ms`, and recorded when slow
# (services/perf_watch.py — THE account of the server being slow).
from app.services.perf_watch import RequestTimingMiddleware  # noqa: E402
app.add_middleware(RequestTimingMiddleware)

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
app.include_router(cell_concerns.router)
app.include_router(tasks.router)
app.include_router(brigadir_tasks.router)
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
# The appeal chat (objections + late proofs, 2026-09-26). Every route is
# row-scoped by require_auth + its own party/scope checks, under /api so the
# global initData guard covers it; the paths sit under the two queues' own
# prefixes so the exam sandbox rewrites them like the queues themselves.
app.include_router(leader_appeals.router)
# The «Chek-list» tab on /leaders (2026-09-28): one leader's checklist, one day
# at a time — reads gated on the `leaders` page and row-scoped like the day
# report, writes only for the person who holds the leader profile. Never under
# the admin guard: filing is the leader's own act.
app.include_router(leader_checklist.router)
# Manual per-cell idle-time (ojidaniya) TEST entry — self-gates via
# require_page("idle-cell"), so no admin guard here (grantable to
# leaders/supervisors later).
app.include_router(idle_cell.router)
# The «Kutish mas'uli» admin register: who owns which ojidaniya category.
# The READING surfaces are /downtime and /idle-cell, narrowed there.
app.include_router(idle_owner.router)
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
app.include_router(arc_legacy.router)
# Cells' working start/end clock («Smena vaqtlari» admin tab) — every route,
# reads included, self-gates via require_cap(CAP_CELL_HOURS_MANAGE), so this is
# grantable and needs no _admin_guard.
app.include_router(cell_hours.router)
# Which source a unit's ojidaniya minutes come from («Kutish manbasi» admin
# tab) — same shape as cell_hours: every route self-gates via
# require_cap(CAP_IDLE_SOURCE_MANAGE), so grantable and no _admin_guard.
app.include_router(idle_source.router)
# Live shift monitor (`/live`, Laboratory) — one read-only GET, self-gated via
# require_page("live") (admin-only by default), so no admin guard here.
app.include_router(live_overview.router)
app.include_router(shift_report.router)
# «Kelish ro'yxati» (`/kelish`) — the T11 staff list; every route self-gates via
# require_page("kelish") (admin-only by default), so no admin guard here.
app.include_router(kelish.router)
# «Liderlar KPI» (`/leaders-kpi`, 2026-10-19) — the leaders' five KPIs on one
# page: the board and the workbook self-gate via require_page("leaders-kpi")
# (admin-only by default), so no admin guard here. The two routers under it
# keep the turnover month's actions (refresh / close / reopen / compute,
# verify_admin) and the Quality refresh (admin-only in the endpoint), re-gated
# on the same page key; `/api/worker-concerns/list` serves the concerns tab.
app.include_router(leaders_kpi.router)
app.include_router(turnover.router)
app.include_router(foreign_objects.router)
# «Toifaga muvofiqlik» — the leaders' category-compliance KPI from Verifix's HR
# journals and HR's grade ladder; reads self-gate via
# require_page("category-compliance") (admin-only by default), the Verifix
# read and the rule's edit are admin-only in the endpoint.
app.include_router(category_compliance.router)
# «O'z vaqtida yetkazish» (/ontime): the on-time delivery report read out of
# the logistics team's Google sheet — page-gated, the read is admin-only.
app.include_router(ontime.router)
# «Hisobotlar» (/reports): the platform's period report — every figure folded
# out of the page that owns it, and the same thing as a document.
app.include_router(reports.router)
app.include_router(android.router)
# The report door (CLAUDE.md «The report door»): a question to production,
# answered only after Burkhon or Abbos taps «Ruxsat berish» in Telegram.
app.include_router(ops_door.router)
app.include_router(push.router)
app.include_router(education.router)
# «Imtihon» — the dashboard exam: the leader/supervisor API, the sandbox the
# exam pages are rewritten onto, and the admin destination.
app.include_router(exam.router)
app.include_router(exam_sandbox.router)
app.include_router(exam.admin_router, dependencies=_admin_guard)
# Lost-worker audit («Yo'qolgan xodimlar») — the READ-ONLY report of workers an
# approved → supervisor exchange left on no roster after an upload wiped the
# receiving unit's day. Under /api/*, so the global initData guard covers it;
# the single route is admin-gated by verify_admin.
app.include_router(exchange_audit.router)
# Cross-document HR history audit («Hujjatlar tarixi») — READ-ONLY: which
# documents were revived after rejection, posted long after their own date, or
# repeatedly approved/cancelled. Admin-gated per route by verify_admin.
app.include_router(doc_audit.router)
# The action register — every change on the platform, by category. Admin-only
# and read-only: there is no delete or purge route anywhere in it.
app.include_router(logs.router)
# Verifix connection card — admin-only: the stored login (password sealed)
# and the read-only connection test (services/verifix.py).
app.include_router(verifix.router)
app.include_router(verifix_sync.router)
# The LIVE «Verifix to'g'irlash» lab page — admin-only, writes only its own tables.
app.include_router(staff_live.router)
# «Verifix (test)» — admin-only pages showing what Verifix's API returns; reads
# only (services/verifix_explore.py, the read-method catalog in verifix_catalog).
app.include_router(verifix_explore.router)
# «Yordamchi» — the AI assistant. Answers about the platform and does the
# user's work THROUGH their own session (services/assistant_api.py), so it can
# never reach further than the person typing. Page key `assistant`.
app.include_router(assistant.router)
# «AI kalitlari» — every AI API key, and which key + model each feature runs
# on (services/ai_keys, services/ai_features). Admin-only, not grantable.
app.include_router(ai_admin_router.router)


@app.get("/health")
def health():
    # `jobs`: whether THIS copy fires the background jobs. During a swap (two
    # workers under the supervisor, or two blue-green copies) the new one
    # answers false until the old one has exited. `started_at` / `pid` /
    # `worker_gen` say WHICH process answered — deploy.sh and the «Versiya»
    # dialog tell a swapped-in worker from the old one by them.
    from app.scheduler import runs_jobs
    from app.supervisor import supervised, worker_gen
    return {"status": "ok", "version": APP_VERSION, "jobs": runs_jobs(),
            "started_at": STARTED_AT, "pid": os.getpid(),
            "supervised": supervised(), "worker_gen": worker_gen() or None}


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

    ``min_client`` is the compatibility floor (app/version.py) — the oldest
    frontend bundle this build still serves. It rides every API response as a
    header as well; it is repeated here so the «Versiya» dialog can state the
    contract rather than only the symptom of breaching it.
    """
    return {
        "version": APP_VERSION,
        "min_client": MIN_CLIENT,
        "commit": current_commit(),
        "started_at": STARTED_AT,
    }


# The Android app (android/, CLAUDE.md «The Android app») carries the site's
# pages in its own web view. Android reads this statement — the app's package
# and the SHA-256 of the key it is signed with — before it opens production
# links tapped in other apps inside the app (the manifest's autoVerify filter).
# A mismatch is silent: such links simply open in the browser. The fingerprint
# is PUBLIC (every copy of the APK carries it); the key itself lives only on
# the Mac that builds the app. Publishing through Google Play with Play App
# Signing re-signs the app with Google's key, whose fingerprint must then be
# ADDED here.
ANDROID_ASSET_LINKS = [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
        "namespace": "android_app",
        "package_name": "uz.safiacorporate.ims",
        "sha256_cert_fingerprints": [
            "4D:09:E1:1C:59:D8:21:BD:F4:BE:19:50:B7:56:D1:C3:DE:D0:10:57:A6:A1:71:BA:8C:01:7E:28:A5:2F:FE:9E",
        ],
    },
}]


@app.get("/.well-known/assetlinks.json", include_in_schema=False)
def android_asset_links():
    return JSONResponse(ANDROID_ASSET_LINKS, headers={"Cache-Control": "public, max-age=3600"})


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

# JavaScript goes out as application/javascript, NOT Python ≥3.12's default
# text/javascript (2026-10-23). The origin nginx compresses only the types its
# gzip_types names (deploy/production.safiacorporate.uz: «application/javascript»,
# no «text/javascript»), so every JS file — the 2.1 MB shared chunk included —
# left the origin uncompressed: Cloudflare re-fetched each renamed chunk raw over
# the slow Tashkent↔Warsaw leg, and a client reaching the origin directly got
# 2.8 MB of boot JS instead of ~0.7 MB. Both types are valid for classic and
# module scripts and for a service worker. FileResponse (StaticFiles and
# serve_spa) guesses the type through this table at response time.
import mimetypes  # noqa: E402

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

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
            # build-files.json lists every file of the build with its SHA-256;
            # the Android app downloads a new build by it. A cached copy
            # describes the previous build, so the same treatment again.
            if clean_path == "build-files.json":
                return FileResponse(file_path, headers=NO_STORE)
            # sw.js is the service worker (browser installs only — see
            # frontend/src/sw.js). A deploy is a new worker carrying the new
            # build's precache list, and Cloudflare caches .js by extension: a
            # pinned worker script pins the PREVIOUS build's list for as long
            # as the edge keeps it, so it gets build.json's treatment.
            if clean_path == "sw.js":
                return FileResponse(file_path, headers=NO_STORE)
            # The web app manifest. Browsers re-read it on every visit to see
            # whether the installed app changed, so revalidate rather than pin,
            # and name the type explicitly — the box's mimetypes table decides
            # it otherwise, and an unknown type fails the install criteria
            # without a word on screen.
            if clean_path == "manifest.webmanifest":
                return FileResponse(file_path, media_type="application/manifest+json",
                                    headers={"Cache-Control": "no-cache"})
            return FileResponse(file_path)
        # Otherwise serve index.html for SPA frontend routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers=NO_STORE)
