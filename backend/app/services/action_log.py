"""THE action register — one row for everything anybody does on this platform.

Six partial trails existed before this module. `capability_uses` records only
what somebody did *through a delegated grant* and returns early for admins;
`capability_audit` covers grants alone; `hr_document_history` one document type;
`leader_task_config_audit` one config path; `concern_escalations` one hand-over;
`user_activity` says a person was in the app and nothing about what they touched.
Between them, an admin uploading attendance, closing a day, deleting a profile,
restoring the database or revealing a browser password left no queryable trace
anywhere on the platform.

## The two writers, and why there are two

``ActionLogMiddleware`` writes an AUTOMATIC row for every mutating HTTP request
(POST/PUT/PATCH/DELETE) under ``/api`` and ``/admin``. It knows the actor, the
route, the outcome, the duration — and nothing about meaning. Its virtue is that
a new endpoint is covered the moment it exists: nobody has to remember anything,
which is exactly the discipline ``capability_uses`` lacked and why it has an
admin-shaped hole in it.

``enrich()`` is called from INSIDE a handler and fills in the same row with what
only the handler knows: the unit's name, the business day, the old→new values,
the operator's stated reason. It never creates a second row, so a request is
always exactly one line in the register. ``enriched`` marks the rows that got
that treatment, so a thin automatic row is never displayed as though it were a
rich one.

``record()`` is the direct door for actions that never ride an HTTP route a
middleware could see: bot taps (``source="bot"`` — a leader closing their day in
Telegram is an action) and scheduled jobs (``source="system"`` — the 09:00
auto-close writes a real change and must say so).

## Rules this module is built on

* **One list.** ``ROUTES`` maps (method, path) → (category, action) in ONE
  place. A mutating route with no entry lands in ``other`` AND is named by
  :func:`unmatched_routes` at boot, so an unclassified endpoint is visible
  rather than silent. Never re-derive a category at a call site.
* **Keys, not sentences.** ``category`` and ``action`` are keys; the tab renders
  them per viewer language through one 4-language table, the way the
  capability-use DMs already do. Names of people, units and targets ARE
  snapshotted — a later rename must not rewrite what the log says happened.
* **Never break the action.** Every path here swallows its own failures. An
  audit row that cannot be written is a warning in the log, never a 500 handed
  to the person whose work it was recording.
* **Off the request path.** Rows go onto a bounded queue and a single daemon
  thread writes them. The middleware is async and a synchronous DB write inside
  it would block the event loop for every other request in flight.
* **Ghost Mode does not apply.** That flag suppresses NOTIFICATIONS. A flag that
  rides the request must never let the audited request silence its own audit —
  the same rule ``capability_alerts`` states. Ghost is RECORDED (a column), not
  obeyed.
"""

import logging
import queue
import re
import threading
import time
from contextvars import ContextVar
from datetime import date as date_t, datetime
from typing import Any, Iterable, Optional

import jwt
from jwt import PyJWTError as JWTError

from app.config import settings

logger = logging.getLogger(__name__)


# ── the taxonomy ──────────────────────────────────────────────────────────────
# Order is the order the category rail shows them in: the daily rhythm first,
# people and access next, the shop floor and collaboration after that, then the
# tooling, and the irreversible things last. `other` is the honest bucket for a
# route nobody classified yet; `telemetry` exists so the excluded set has a name.

CATEGORIES = (
    "attendance",      # 1  uploads, edits, edit-requests, day close/reopen
    "documents",       # 2  exchanges & HR documents
    "identity",        # 3  users, profiles, roles, page access, capabilities
    "sessions",        # 4  logins, browser credentials
    "org",             # 5  factories, cells, cell hours, idle source
    "leader_config",   # 6  the leader-checklist configuration matrix
    "leader_review",   # 7  proofs, AI review, disputes, late-day
    "shopfloor",       # 8  production, setup times, per-cell idle intervals
    "collab",          # 9  concerns, tasks, comments
    "comms",           # 10 broadcasts, notifications
    "sync_export",     # 11 external refreshes and Excel exports
    "config",          # 12 platform settings, translations, AI model/key
    "danger",          # 13 dump/restore, wipes, mass deletion
    "other",           # 14 mutating route with no entry in ROUTES
)

DANGER = "danger"

OUTCOMES = ("done", "refused", "denied", "error")
SOURCES = ("telegram", "web", "bot", "system")


# ── the route table ───────────────────────────────────────────────────────────
# (methods, path template, category, action). `{}` matches one path segment.
# FIRST match wins, so a more specific template must come before its prefix.
# Every one of the platform's 193 mutating routes is here on purpose: a table
# with holes is a register that quietly loses whole features.

_R: list[tuple[Optional[tuple[str, ...]], str, str, str]] = [
    # ── attendance & the day ──────────────────────────────────────────────────
    (("POST",),   "/api/attendance-batch/upload",              "attendance", "attendance.batch_uploaded"),
    (("DELETE",), "/api/attendance-batch/uploads/{}",          "attendance", "attendance.batch_file_removed"),
    (("DELETE",), "/api/attendance-batch/cell-day",            "attendance", "attendance.cell_day_wiped"),
    (("DELETE",), "/api/attendance-batch/supervisor-day",      "attendance", "attendance.unit_day_wiped"),
    (("POST",),   "/api/attendance-batch/rows/{}/revert",      "attendance", "attendance.row_reverted"),
    (("POST",),   "/api/attendance-batch/rows",                "attendance", "attendance.row_added"),
    (("PATCH",),  "/api/attendance-batch/rows/{}",             "attendance", "attendance.row_edited"),
    (("DELETE",), "/api/attendance-batch/rows/{}",             "attendance", "attendance.row_deleted"),
    (("PUT",),    "/api/attendance-batch/cells",               "attendance", "attendance.cells_decided"),
    (("POST",),   "/api/attendance-batch/save",                "attendance", "attendance.draft_saved"),
    (("DELETE",), "/api/attendance-batch",                     "attendance", "attendance.draft_discarded"),
    (("POST",),   "/admin/upload",                             "attendance", "attendance.verifix_uploaded"),
    (("POST",),   "/admin/delete-attendance",                  "attendance", "attendance.day_cleanup"),
    (("POST",),   "/api/staff/attendance/update",              "attendance", "attendance.row_edited"),
    (("POST",),   "/api/staff/attendance/bulk-delete",         "attendance", "attendance.rows_bulk_deleted"),
    (("POST",),   "/api/staff/attendance/delete",              "attendance", "attendance.row_deleted"),
    (("POST",),   "/api/staff/requests/batch/{}/approve",      "attendance", "attendance.request_batch_approved"),
    (("POST",),   "/api/staff/requests/batch/{}/reject",       "attendance", "attendance.request_batch_rejected"),
    (("POST",),   "/api/staff/requests/batch/{}/withdraw",     "attendance", "attendance.request_batch_withdrawn"),
    (("POST",),   "/api/staff/requests/{}/withdraw",           "attendance", "attendance.request_withdrawn"),
    (("POST",),   "/api/staff/requests/{}/approve",            "attendance", "attendance.request_approved"),
    (("POST",),   "/api/staff/requests/{}/reject",             "attendance", "attendance.request_rejected"),
    (("POST",),   "/api/staff/requests/{}/undo",               "attendance", "attendance.request_undone"),
    (("POST",),   "/api/staff/requests",                       "attendance", "attendance.request_filed"),
    (("POST",),   "/api/staff/daily/close",                    "attendance", "attendance.day_closed"),
    (("POST",),   "/api/staff/approvals/reopen",               "attendance", "attendance.day_reopened"),
    (("PUT",),    "/api/cell-attendance/registry",             "attendance", "attendance.cell_registry_saved"),

    # ── exchanges & HR documents ──────────────────────────────────────────────
    (("POST",),   "/api/staff/documents/{}/approve",           "documents", "document.approved"),
    (("POST",),   "/api/staff/documents/{}/reject",            "documents", "document.rejected"),
    (("POST",),   "/api/staff/documents/{}/cancel",            "documents", "document.cancelled"),
    (("POST",),   "/api/staff/documents/{}/delete",            "documents", "document.deleted"),
    (("POST",),   "/api/staff/documents/bulk",                 "documents", "document.bulk_decided"),
    (("PUT",),    "/api/staff/documents/{}",                   "documents", "document.edited"),
    (("POST",),   "/api/staff/documents",                      "documents", "document.created"),
    (("POST",),   "/api/staff/tasks/delete",                   "documents", "document.exchange_task_deleted"),
    (("POST",),   "/api/admin/exchange-audit/repair",          "documents", "document.lost_workers_repaired"),

    # ── identity, roles & access ──────────────────────────────────────────────
    (("PATCH",),  "/admin/users/{}/roles/{}",                  "identity", "identity.role_approved"),
    (("POST",),   "/admin/users/{}/roles",                     "identity", "identity.role_added"),
    (("DELETE",), "/admin/users/{}/roles/{}",                  "identity", "identity.role_removed"),
    (("DELETE",), "/admin/users/{}",                           "identity", "identity.user_deleted"),
    (("PUT",),    "/admin/page-access",                        "identity", "identity.page_access_saved"),
    (("PUT",),    "/admin/capabilities",                       "identity", "identity.capabilities_saved"),
    (("POST",),   "/admin/capabilities/copy",                  "identity", "identity.capabilities_copied"),
    (("POST",),   "/api/profiles/admin/switch-role",           "identity", "identity.profile_role_switched"),
    (("POST",),   "/api/profiles/admin/unassign",              "identity", "identity.profile_unassigned"),
    (("POST",),   "/api/profiles/admin/photo",                 "identity", "identity.profile_photo_set"),
    (("DELETE",), "/api/profiles/admin/photo",                 "identity", "identity.profile_photo_removed"),
    (("POST",),   "/api/profiles/registration-options",        "identity", "identity.registration_options_read"),
    (("PUT",),    "/api/profiles/mine",                        "identity", "identity.own_profile_edited"),
    # Cells are an ORG register, not an identity one — but they sit here because
    # `/api/profiles/admin/cells/{id}` matches the generic profile template
    # below, and FIRST match wins. Specific before generic, always.
    (("POST",),   "/api/profiles/admin/cells",                 "org", "org.cell_created"),
    (("PUT",),    "/api/profiles/admin/cells/{}",              "org", "org.cell_edited"),
    (("DELETE",), "/api/profiles/admin/cells/{}",              "org", "org.cell_deleted"),
    (("PUT",),    "/api/profiles/admin/{}/{}",                 "identity", "identity.profile_edited"),
    (("DELETE",), "/api/profiles/admin/{}/{}",                 "identity", "identity.profile_deleted"),
    (("POST",),   "/api/profiles/admin",                       "identity", "identity.profile_created"),
    (("POST",),   "/api/auth/switch-role",                     "identity", "identity.session_role_switched"),
    (("POST",),   "/api/auth/language",                        "identity", "identity.language_changed"),
    (("DELETE",), "/api/auth/roles/{}",                        "identity", "identity.own_role_left"),
    (("DELETE",), "/api/auth/me",                              "identity", "identity.own_account_deleted"),

    # ── sessions & browser credentials ────────────────────────────────────────
    (("POST",),   "/api/auth/webapp",                          "sessions", "session.telegram_login"),
    (("POST",),   "/api/auth/send-start-hint",                 "sessions", "session.start_hint_sent"),
    (("POST",),   "/api/auth/web/login",                       "sessions", "session.web_login"),
    (("POST",),   "/api/auth/web/forgot",                      "sessions", "session.web_password_forgotten"),
    (("POST",),   "/api/auth/web/password",                    "sessions", "session.web_password_changed"),
    (("POST",),   "/api/profiles/admin/web-login/reveal",      "sessions", "weblogin.revealed"),
    (("POST",),   "/api/profiles/admin/web-login/bulk",        "sessions", "weblogin.bulk_created"),
    (("POST",),   "/api/profiles/admin/web-login/toggle",      "sessions", "weblogin.toggled"),
    (("POST",),   "/api/profiles/admin/web-login/revoke",      "sessions", "weblogin.sessions_revoked"),
    (("POST",),   "/api/profiles/admin/web-login",             "sessions", "weblogin.created"),
    (("PUT",),    "/api/profiles/admin/web-login",             "sessions", "weblogin.renamed"),
    (("DELETE",), "/api/profiles/admin/web-login",             "sessions", "weblogin.deleted"),

    # ── org registers ─────────────────────────────────────────────────────────
    (("PUT",),    "/api/factories/reorder/all",                "org", "org.factories_reordered"),
    (("PUT",),    "/api/factories/assign/managers",            "org", "org.factory_units_assigned"),
    (("PUT",),    "/api/factories/settings/defaults",          "org", "org.factory_default_set"),
    (("POST",),   "/api/factories",                            "org", "org.factory_created"),
    (("PUT",),    "/api/factories/{}",                         "org", "org.factory_edited"),
    (("DELETE",), "/api/factories/{}",                         "org", "org.factory_deleted"),
    # (the three cell routes live in the identity block above — they have to be
    #  matched BEFORE the generic /api/profiles/admin/{}/{} profile pattern)
    (("PUT",),    "/api/cell-hours/defaults",                  "org", "org.cell_hours_default_set"),
    (("PUT",),    "/api/cell-hours/bulk",                      "org", "org.cell_hours_set"),
    (("PUT",),    "/api/admin/idle-source/{}",                 "org", "org.idle_source_set"),

    # ── leader-checklist configuration ────────────────────────────────────────
    (("PUT",),    "/admin/leader-tasks/cell",                  "leader_config", "ltask.cell_set"),
    (("PUT",),    "/admin/leader-tasks/leader-cell",           "leader_config", "ltask.leader_cell_set"),
    (("PUT",),    "/admin/leader-tasks/supervisor-batch",      "leader_config", "ltask.unit_batch_set"),
    (("PUT",),    "/admin/leader-tasks/apply-all",             "leader_config", "ltask.applied_to_all"),
    (("PUT",),    "/admin/leader-tasks/column",                "leader_config", "ltask.column_set"),
    (("PUT",),    "/admin/leader-tasks/criteria",              "leader_config", "ltask.criteria_set"),
    (("PUT",),    "/admin/leader-tasks/window",                "leader_config", "ltask.window_set"),
    (("PUT",),    "/admin/leader-tasks/deadline",              "leader_config", "ltask.deadline_set"),
    (("PUT",),    "/admin/leader-tasks/date-check",            "leader_config", "ltask.date_check_set"),
    (("PUT",),    "/admin/leader-tasks/time-check",            "leader_config", "ltask.time_check_set"),
    (("PUT",),    "/admin/leader-tasks/proof-kind",            "leader_config", "ltask.proof_kind_set"),
    (("PUT",),    "/admin/leader-tasks/unit",                  "leader_config", "ltask.unit_settings_set"),
    (("PUT",),    "/admin/leader-tasks/channel",               "leader_config", "ltask.channel_set"),
    (("PUT",),    "/admin/leader-tasks/task",                  "leader_config", "ltask.task_set"),
    (("POST",),   "/admin/leader-tasks/examples",              "leader_config", "ltask.example_added"),
    (("DELETE",), "/admin/leader-tasks/examples/{}",           "leader_config", "ltask.example_removed"),
    (("POST",),   "/admin/leader-tasks/pending/cancel",        "leader_config", "ltask.pending_cancelled"),
    (("POST",),   "/admin/leader-tasks/revert",                "leader_config", "ltask.reverted"),
    (("PUT",),    "/api/leader-tiers",                         "leader_config", "ltask.tiers_set"),
    (("POST",),   "/api/leaders/task-override",                "leader_config", "ltask.task_overridden"),

    # ── leader submissions, AI review & disputes ──────────────────────────────
    # Taking one submitted task back, and choosing which of the two collection
    # layers counts for a leader-day. Both move a SCORE, so they sit with the
    # review actions rather than with the config matrix that shapes them.
    (("POST",),   "/admin/leader-tasks/task/reopen",           "leader_review", "checklist.task_reopened"),
    (("POST",),   "/admin/leader-tasks/day-source",            "leader_review", "checklist.day_source_set"),
    (("POST",),   "/api/leader-proof/photo",                   "leader_review", "proof.photo_taken"),
    (("DELETE",), "/api/leader-proof/photo/{}",                "leader_review", "proof.photo_dropped"),
    (("POST",),   "/api/leader-ai/resolve",                    "leader_review", "ai.verdict_resolved"),
    (("POST",),   "/api/leader-ai/review-now",                 "leader_review", "ai.reviewed_now"),
    (("POST",),   "/api/leader-ai/run",                        "leader_review", "ai.run_started"),
    (("POST",),   "/api/leader-ai/recheck",                    "leader_review", "ai.recheck_queued"),
    (("POST",),   "/api/leader-ai/retry",                      "leader_review", "ai.retried"),
    (("POST",),   "/api/leader-ai/progress/kick",              "leader_review", "ai.drain_kicked"),
    (("POST",),   "/api/leader-ai/progress/cancel",            "leader_review", "ai.run_cancelled"),
    (("POST",),   "/api/leaders/report/{}/dispute",            "leader_review", "dispute.filed"),
    (("POST",),   "/api/leaders/disputes/{}/decide",           "leader_review", "dispute.decided"),
    (("POST",),   "/api/leaders/disputes/{}/undo",             "leader_review", "dispute.undone"),
    (("POST",),   "/api/leaders/late/{}/decide",               "leader_review", "lateday.decided"),
    (("DELETE",), "/api/leaders/late/{}",                      "leader_review", "lateday.cancelled"),
    (("POST",),   "/api/leaders/late",                         "leader_review", "lateday.requested"),

    # ── shop-floor records ────────────────────────────────────────────────────
    (("POST",),   "/api/production/override",                  "shopfloor", "production.override_set"),
    (("POST",),   "/api/production/wc-override",               "shopfloor", "production.wc_override_set"),
    (("POST",),   "/api/production/staffing",                  "shopfloor", "production.staffing_set"),
    (("POST",),   "/api/production/reconciliation",            "shopfloor", "production.reconciliation_set"),
    (("POST",),   "/admin/production/upload",                  "shopfloor", "production.phase_uploaded"),
    (("POST",),   "/admin/production/catalog/import",          "shopfloor", "production.catalog_imported"),
    (("POST",),   "/admin/production/catalog",                 "shopfloor", "production.catalog_created"),
    (("PUT",),    "/admin/production/catalog/{}",              "shopfloor", "production.catalog_edited"),
    (("DELETE",), "/admin/production/catalog/{}",              "shopfloor", "production.catalog_deleted"),
    (("PUT",),    "/admin/production/work-centers/{}",         "shopfloor", "production.work_center_edited"),
    (("POST",),   "/api/setup-times/fact/refresh",             "shopfloor", "setup.fact_refreshed"),
    (("POST",),   "/api/setup-times/fact",                     "shopfloor", "setup.fact_saved"),
    (("DELETE",), "/api/setup-times/fact/{}",                  "shopfloor", "setup.fact_deleted"),
    (("POST",),   "/api/setup-times",                          "shopfloor", "setup.standard_created"),
    (("PATCH",),  "/api/setup-times/{}",                       "shopfloor", "setup.standard_edited"),
    (("DELETE",), "/api/setup-times/{}",                       "shopfloor", "setup.standard_deleted"),
    (("POST",),   "/api/idle-cell/intervals",                  "shopfloor", "idle.interval_added"),
    (("PUT",),    "/api/idle-cell/intervals/{}",               "shopfloor", "idle.interval_edited"),
    (("DELETE",), "/api/idle-cell/intervals/{}",               "shopfloor", "idle.interval_deleted"),
    (("DELETE",), "/api/idle-cell/{}",                         "shopfloor", "idle.entry_deleted"),

    # ── concerns, tasks & comments ────────────────────────────────────────────
    (("POST",),   "/api/concerns/{}/escalate",                 "collab", "concern.escalated"),
    (("POST",),   "/api/concerns/{}/comments",                 "collab", "concern.comment_added"),
    (("PUT",),    "/api/concerns/{}/comments/{}",              "collab", "concern.comment_edited"),
    (("DELETE",), "/api/concerns/{}/comments/{}",              "collab", "concern.comment_deleted"),
    (("POST",),   "/api/concerns",                             "collab", "concern.created"),
    (("PUT",),    "/api/concerns/{}",                          "collab", "concern.edited"),
    (("DELETE",), "/api/concerns/{}",                          "collab", "concern.deleted"),
    (("PATCH",),  "/api/tasks/{}/status",                      "collab", "task.status_changed"),
    (("PATCH",),  "/api/tasks/{}/priority",                    "collab", "task.priority_changed"),
    (("POST",),   "/api/tasks/{}/comments",                    "collab", "task.comment_added"),
    (("PUT",),    "/api/tasks/{}/comments/{}",                 "collab", "task.comment_edited"),
    (("DELETE",), "/api/tasks/{}/comments/{}",                 "collab", "task.comment_deleted"),
    (("POST",),   "/api/tasks",                                "collab", "task.created"),
    (("PUT",),    "/api/tasks/{}",                             "collab", "task.edited"),
    (("DELETE",), "/api/tasks/{}",                             "collab", "task.deleted"),
    (("POST",),   "/api/comments",                             "collab", "comment.added"),
    (("PUT",),    "/api/comments/{}",                          "collab", "comment.edited"),
    (("DELETE",), "/api/comments/{}",                          "collab", "comment.deleted"),
    (("PUT",),    "/api/worker-concerns/thresholds",           "collab", "concern.thresholds_set"),

    # ── communication ─────────────────────────────────────────────────────────
    (("POST",),   "/api/broadcast/send-draft",                 "comms", "broadcast.draft_sent"),
    (("POST",),   "/api/broadcast/send",                       "comms", "broadcast.sent"),
    (("POST",),   "/api/broadcast/test",                       "comms", "broadcast.tested"),
    (("POST",),   "/api/broadcast/{}/retry",                   "comms", "broadcast.retried"),
    (("POST",),   "/api/broadcast/{}/cancel",                  "comms", "broadcast.cancelled"),
    (("POST",),   "/api/broadcast/emojis",                     "comms", "broadcast.emoji_added"),
    (("DELETE",), "/api/broadcast/emojis/{}",                  "comms", "broadcast.emoji_removed"),
    (("POST",),   "/api/notifications",                        "comms", "notification.created"),
    (("DELETE",), "/api/notifications/{}",                     "comms", "notification.deleted"),
    (("POST",),   "/api/production/trudoyomkost/call-notify",  "comms", "notification.workers_called"),

    # ── external sync & exports ───────────────────────────────────────────────
    (("PUT",),    "/admin/sheet-sources/{}",                   "sync_export", "sync.sheet_source_set"),
    (("POST",),   "/admin/refresh-sheet/{}",                   "sync_export", "sync.sheet_refreshed"),
    (("POST",),   "/api/quality/refresh",                      "sync_export", "sync.quality_refreshed"),
    (("POST",),   "/api/worker-concerns/refresh",              "sync_export", "sync.worker_concerns_refreshed"),
    (("POST",),   "/api/kaizen/refresh",                       "sync_export", "sync.kaizen_refreshed"),
    (("POST",),   "/api/arc/refresh",                          "sync_export", "sync.arc_refreshed"),
    (("POST",),   "/api/arc/export.xlsx",                      "sync_export", "export.arc"),
    (("POST",),   "/api/quality/export.xlsx",                  "sync_export", "export.quality"),
    (("POST",),   "/api/worker-concerns/export.xlsx",          "sync_export", "export.worker_concerns"),
    (("POST",),   "/api/production/export.xlsx",               "sync_export", "export.production"),
    (("POST",),   "/api/profiles/admin/cells/export.xlsx",     "sync_export", "export.cells"),
    (("POST",),   "/api/admin/exchange-audit/export.xlsx",     "sync_export", "export.exchange_audit"),
    (("POST",),   "/api/staff/attendance/export",              "sync_export", "export.attendance"),
    (("POST",),   "/api/admin/logs/export.xlsx",               "sync_export", "export.action_log"),
    # The undo door. Its row is re-badged by `action_undo` to the INVERSE action
    # (undoing a day-close IS a re-open, and belongs under Attendance), so this
    # entry is only what a refusal that never reached a plan falls back to.
    (("POST",),   "/api/admin/logs/{}/undo",                   "other", "log.undo_refused"),

    # ── platform configuration ────────────────────────────────────────────────
    (("PUT",),    "/admin/settings",                           "config", "config.settings_saved"),
    (("PUT",),    "/api/admin/translations",                   "config", "config.translation_saved"),
    (("POST",),   "/api/admin/translations/keys",              "config", "config.translation_key_added"),
    (("POST",),   "/api/admin/translations/languages",         "config", "config.language_added"),
    (("POST",),   "/api/leader-ai/model",                      "config", "config.ai_model_set"),
    (("POST",),   "/api/leader-ai/key",                        "config", "config.ai_key_set"),

    # ── the danger zone ───────────────────────────────────────────────────────
    (("POST",),   "/admin/db-dump",                            "danger", "danger.db_dumped"),
    (("POST",),   "/admin/db-restore",                         "danger", "danger.db_restored"),
    (("POST",),   "/api/leader-ai/history/clear",              "danger", "danger.ai_history_cleared"),
    (("POST",),   "/admin/leader-tasks/submissions/delete",    "danger", "danger.bot_days_deleted"),
]

# Paths deliberately NOT recorded. Every one is machine chatter that would bury
# the register: the presence heartbeat fires every couple of minutes per open
# client, ui-prefs on every column drag, boot/crash reports are their own
# channel already (POST /api/crash-report DMs admins), and /bot/webhook is the
# ENVELOPE for bot actions — the handlers behind it record themselves with a
# real actor, which the envelope cannot know.
_SKIP = (
    "/api/activity/ping",
    "/api/ui-prefs/",
    "/api/boot-report",
    "/api/crash-report",
    "/bot/webhook",
)

_PREFIXES = ("/api/", "/admin/")
# Reached from a browser before any token exists (see the middleware).
_WEB_PATHS = ("/api/auth/web/",)
_METHODS = ("POST", "PUT", "PATCH", "DELETE")


def _compile(template: str) -> re.Pattern:
    """`/api/tasks/{}/comments/{}` → a regex matching one segment per `{}`."""
    parts = [re.escape(p) for p in template.split("{}")]
    return re.compile("^" + "[^/]+".join(parts) + "/?$")


_COMPILED = [(methods, _compile(tpl), tpl, cat, act) for methods, tpl, cat, act in _R]

# The public, inspectable form of the table — the boot check and the tests read
# this rather than re-deriving anything.
ROUTES = tuple((m, t, c, a) for m, t, c, a in _R)


def classify(method: str, path: str) -> tuple[str, str]:
    """(category, action) for a request. Unmatched → ("other", "other.<method>").

    An unmatched MUTATING route is a real gap, not an error: it still gets a row
    (coverage is the whole point) and :func:`unmatched_routes` names it at boot
    so it cannot stay unclassified quietly.
    """
    method = (method or "").upper()
    for methods, rx, _tpl, cat, act in _COMPILED:
        if methods and method not in methods:
            continue
        if rx.match(path):
            return cat, act
    return "other", f"other.{method.lower()}"


def should_record(method: str, path: str) -> bool:
    if (method or "").upper() not in _METHODS:
        return False
    if not path.startswith(_PREFIXES):
        return False
    return not any(path.startswith(s) for s in _SKIP)


def unmatched_routes(app) -> list[str]:
    """Every mutating route the app serves that ROUTES does not classify.

    Called at boot and logged. The lesson from ADMIN_NAV and
    OJIDANIYA_ONLY_CATS: a second list drifts, so there is one list — and the
    only way one list stays complete is if the app says out loud when a route
    has fallen out of it.
    """
    missing = []
    for route in getattr(app, "routes", []):
        path = getattr(route, "path", "")
        for method in sorted(getattr(route, "methods", set()) or set()):
            if not should_record(method, path):
                continue
            # FastAPI paths carry {name}; the table's templates carry {}.
            probe = re.sub(r"\{[^}]+\}", "1", path)
            cat, _ = classify(method, probe)
            if cat == "other":
                missing.append(f"{method} {path}")
    return sorted(set(missing))


# ── the actor ─────────────────────────────────────────────────────────────────

def _client_ip(headers: dict, scope) -> Optional[str]:
    """The caller's address, from a source the caller cannot author.

    NEVER the first element of ``X-Forwarded-For``. The origin nginx sets that
    header with ``$proxy_add_x_forwarded_for``, which APPENDS the real peer to
    whatever arrived — so element [0] is always the client's own text. Reading
    it would mean the one field in this register meant to place a person is
    written by that person, and an 8 KB header would land verbatim in a table
    that is never purged and rides in every database dump.

    In trust order: Cloudflare's own header (the edge overwrites it), nginx's
    ``X-Real-IP`` (set from ``$remote_addr``, overwriting any client value),
    then the ASGI peer — which uvicorn has already resolved for us, since the
    unit runs ``--proxy-headers --forwarded-allow-ips=127.0.0.1``. Truncated,
    because a header is attacker-sized and a column is not.
    """
    for name in (b"cf-connecting-ip", b"x-real-ip"):
        v = headers.get(name, b"").decode("latin-1").strip()
        if v:
            return v[:64]
    peer = (scope.get("client") or (None, None))[0]
    return str(peer)[:64] if peer else None


def _decode(scope) -> tuple[Optional[dict], bool, Optional[str]]:
    """(jwt payload, ghost-requested, client ip) off a raw ASGI scope.

    Advisory only — this never replaces a route's own auth. A token that fails
    to decode simply yields no actor, and the row is still written: "somebody
    unauthenticated tried this" is exactly the kind of thing a log exists for.
    """
    headers = {k.lower(): v for k, v in scope.get("headers", [])}
    ghost = headers.get(b"x-ghost-mode") == b"1"
    ip = _client_ip(headers, scope)
    auth = headers.get(b"authorization", b"")
    if not auth.startswith(b"Bearer "):
        return None, ghost, ip
    try:
        payload = jwt.decode(auth[7:].decode("latin-1"), settings.secret_key,
                             algorithms=[settings.algorithm])
    except JWTError:
        return None, ghost, ip
    return payload, ghost, ip


def actor_fields(db, payload: Optional[dict]) -> dict:
    """The actor half of a row, resolved from a JWT payload.

    BOTH keys are stored. The profile is the person — one person may hold two
    Telegram accounts and "everything Aripova did" must return both — while the
    account is what actually authenticated. ``capability_uses`` keys by account
    alone, which the profile-keyed migration already identified as the wrong key.
    """
    if not payload:
        return {}
    out: dict[str, Any] = {
        "actor_role": payload.get("role"),
        "actor_name": payload.get("full_name"),
    }
    try:
        out["actor_telegram_id"] = int(payload.get("sub"))
    except (TypeError, ValueError):
        pass
    if db is not None:
        try:
            from app.identity import viewer_profile_key
            out["actor_profile_key"] = viewer_profile_key(db, payload)
        except Exception:
            pass
    return out


# ── request-scoped enrichment ─────────────────────────────────────────────────
# Set by the middleware before the handler runs. Pure-ASGI middleware is
# required for this to be visible inside the sync route handlers Starlette runs
# in a threadpool — the same reason GhostModeMiddleware is pure ASGI.

_pending: ContextVar[Optional[dict]] = ContextVar("action_log_pending", default=None)

_ENRICHABLE = (
    "category", "action", "outcome", "target_kind", "target_id", "target_name",
    "unit_id", "unit_name", "day", "reason", "via_capability", "undo_of",
)


def enrich(**kw) -> None:
    """Add meaning to THIS request's log row, from inside the handler.

    The middleware already has the request line and the outcome; this is where
    the things only the handler knows go — the unit's NAME, the business day,
    the field-level old→new, the operator's stated reason.

    It never writes a row of its own and never raises: outside a recorded
    request (a bot handler, a job, a test) it is simply a no-op, so a shared
    service function can call it unconditionally.

        action_log.enrich(
            target_kind="day", target_id=f"{mid}:{day}", unit_id=mid,
            unit_name=unit, day=day,
            changes=[("status", "open", "closed")],
        )

    ``details`` — [(label_key, value)] identification lines.
    ``changes`` — [(field_key, old, new)] rendered as the old→new table.
    Both accumulate across calls, so a handler may enrich in stages.
    """
    row = _pending.get()
    if row is None:
        return
    try:
        for k in _ENRICHABLE:
            if k in kw and kw[k] is not None:
                row[k] = kw[k]
        if kw.get("details"):
            row.setdefault("details", []).extend(list(kw["details"]))
        if kw.get("changes"):
            row.setdefault("changes", []).extend(list(kw["changes"]))
        row["enriched"] = True
    except Exception:
        logger.debug("action_log.enrich failed", exc_info=True)


def recording() -> bool:
    """True while inside a request whose row will be written."""
    return _pending.get() is not None


# ── writing ───────────────────────────────────────────────────────────────────
# A bounded queue drained by ONE daemon thread. The middleware is async: a
# synchronous DB write there would block the event loop for every request in
# flight, and an audit trail must never be the reason the app is slow.

_QUEUE: "queue.Queue[dict]" = queue.Queue(maxsize=20_000)
_worker: Optional[threading.Thread] = None
_worker_lock = threading.Lock()
_dropped = 0


def _plain(v: Any) -> Any:
    """JSONB-safe value. Same shape as capability_alerts._plain, deliberately:
    the two payloads render through one table."""
    if isinstance(v, tuple):
        return list(v)
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def _pairs(rows) -> Optional[list]:
    if not rows:
        return None
    return [[_plain(x) for x in row] for row in rows]


def _coerce_day(v) -> Optional[date_t]:
    if v is None or isinstance(v, date_t) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _write(rows: list[dict]) -> None:
    from app.database import SessionLocal
    from app.models import ActionLog

    db = SessionLocal()
    try:
        # The actor's PROFILE is resolved HERE and nowhere else.
        # `viewer_profile_key` needs a DB session, and the middleware runs on
        # the event loop where taking one would block every request in flight —
        # so the payload rides along as a deferred field and the writer thread,
        # which already holds a session, finishes the job.
        for r in rows:
            payload = r.pop("_resolve_profile", None)
            if payload and not r.get("actor_profile_key"):
                try:
                    from app.identity import viewer_profile_key
                    r["actor_profile_key"] = viewer_profile_key(db, payload)
                except Exception:
                    pass
        for r in rows:
            db.add(ActionLog(
                category=r.get("category") or "other",
                action=r.get("action") or "other.unknown",
                outcome=r.get("outcome") or "done",
                source=r.get("source") or "telegram",
                actor_profile_key=r.get("actor_profile_key"),
                actor_telegram_id=r.get("actor_telegram_id"),
                actor_name=r.get("actor_name"),
                actor_role=r.get("actor_role"),
                via_capability=r.get("via_capability"),
                ghost=bool(r.get("ghost")),
                target_kind=r.get("target_kind"),
                target_id=None if r.get("target_id") is None else str(r["target_id"])[:200],
                target_name=r.get("target_name"),
                unit_id=r.get("unit_id"),
                unit_name=r.get("unit_name"),
                day=_coerce_day(r.get("day")),
                details=_pairs(r.get("details")),
                changes=_pairs(r.get("changes")),
                reason=r.get("reason"),
                enriched=bool(r.get("enriched")),
                undo_of=r.get("undo_of"),
                method=r.get("method"),
                path=r.get("path"),
                status=r.get("status"),
                duration_ms=r.get("duration_ms"),
                ip=r.get("ip"),
                app_version=r.get("app_version"),
                created_at=r.get("created_at"),
            ))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("action log write failed (%d rows)", len(rows), exc_info=True)
    finally:
        db.close()


def _drain() -> None:
    while True:
        try:
            first = _QUEUE.get()
            batch = [first]
            # Opportunistic batching: a burst (a bulk approval, a fan-out) turns
            # into one INSERT instead of fifty.
            while len(batch) < 100:
                try:
                    batch.append(_QUEUE.get_nowait())
                except queue.Empty:
                    break
            _write(batch)
        except Exception:
            logger.warning("action log drain error", exc_info=True)
            time.sleep(1)


def _ensure_worker() -> None:
    global _worker
    if _worker is not None and _worker.is_alive():
        return
    with _worker_lock:
        if _worker is not None and _worker.is_alive():
            return
        _worker = threading.Thread(target=_drain, daemon=True, name="action-log")
        _worker.start()


def _submit(row: dict) -> None:
    global _dropped
    try:
        _ensure_worker()
        row.setdefault("app_version", _version())
        _QUEUE.put_nowait(row)
    except queue.Full:
        _dropped += 1
        if _dropped % 100 == 1:
            logger.warning("action log queue full — %d rows dropped", _dropped)
    except Exception:
        logger.warning("action log submit failed", exc_info=True)


def _version() -> Optional[str]:
    try:
        from app.version import APP_VERSION
        return APP_VERSION
    except Exception:
        return None


def flush(timeout: float = 5.0) -> None:
    """Block until the queue is empty. For shutdown and for tests only —
    nothing on the request path should ever wait for the audit trail."""
    deadline = time.time() + timeout
    while not _QUEUE.empty() and time.time() < deadline:
        time.sleep(0.02)


# ── the direct door: bot taps and scheduled jobs ─────────────────────────────

def record(db=None, *, category: str, action: str, source: str = "system",
           outcome: str = "done", actor: Optional[dict] = None,
           telegram_id: Optional[int] = None,
           actor_name: Optional[str] = None, actor_role: Optional[str] = None,
           actor_profile_key: Optional[str] = None,
           target_kind: Optional[str] = None, target_id: Any = None,
           target_name: Optional[str] = None,
           unit_id: Optional[int] = None, unit_name: Optional[str] = None,
           day: Any = None, details: Optional[Iterable] = None,
           changes: Optional[Iterable] = None, reason: Optional[str] = None,
           via_capability: Optional[str] = None, undo_of: Optional[int] = None,
           enriched: bool = True) -> None:
    """Write one row directly. Never raises.

    For anything that does not arrive as an HTTP request the middleware can
    see: a leader closing their checklist day in the bot, an admin tapping an
    approval card in a DM, the 09:00 sweep closing an abandoned shift-2 day, the
    AI drain writing verdicts. ``source`` is ``"bot"`` when a PERSON did it in
    Telegram and ``"system"`` when a job did — the distinction is the whole
    reason the Source filter exists.

    ``actor`` accepts a JWT payload dict as a shortcut; explicit
    ``telegram_id`` / ``actor_name`` / ``actor_role`` override it.
    """
    try:
        row: dict[str, Any] = {
            "category": category, "action": action, "source": source,
            "outcome": outcome, "target_kind": target_kind, "target_id": target_id,
            "target_name": target_name, "unit_id": unit_id, "unit_name": unit_name,
            "day": day, "details": list(details or []), "changes": list(changes or []),
            "reason": reason, "via_capability": via_capability,
            "undo_of": undo_of, "enriched": enriched,
        }
        if actor:
            row.update(actor_fields(db, actor))
        if telegram_id is not None:
            row["actor_telegram_id"] = telegram_id
        if actor_name is not None:
            row["actor_name"] = actor_name
        if actor_role is not None:
            row["actor_role"] = actor_role
        if actor_profile_key is not None:
            row["actor_profile_key"] = actor_profile_key
        # A bot actor named only by account: resolve the display name so the
        # register never shows a bare Telegram id where every other row shows a
        # person.
        if source == "bot" and not row.get("actor_name") and row.get("actor_telegram_id") and db is not None:
            try:
                from app.models import TelegramUser
                u = db.query(TelegramUser).filter_by(
                    telegram_id=row["actor_telegram_id"]).first()
                if u:
                    row["actor_name"] = u.tg_name or u.username
            except Exception:
                pass
        _submit(row)
    except Exception:
        logger.warning("action log record failed (%s/%s)", category, action, exc_info=True)


def record_bot(db, telegram_id: Optional[int], category: str, action: str, **kw) -> None:
    """A person acting through the Telegram bot."""
    record(db, category=category, action=action, source="bot",
           telegram_id=telegram_id, **kw)


def record_system(category: str, action: str, db=None, **kw) -> None:
    """A scheduled job. The actor is the platform itself."""
    record(db, category=category, action=action, source="system",
           actor_name="system", actor_role="system", **kw)


# ── the middleware ────────────────────────────────────────────────────────────

def _outcome(status: Optional[int]) -> str:
    if status is None:
        return "error"
    if status < 400:
        return "done"
    if status in (401, 403):
        return "denied"
    if status < 500:
        return "refused"
    return "error"


class ActionLogMiddleware:
    """One row for every mutating request — automatically, forever.

    Pure ASGI, for two reasons. The ContextVar it sets must be visible inside
    the sync route handlers Starlette runs in a threadpool (a BaseHTTPMiddleware
    runs the endpoint in a separate task and the value would be invisible), and
    it needs ``http.response.start`` to learn the status — which is the whole
    difference between "somebody changed the roster" and "somebody was refused
    permission to".

    Placed OUTSIDE GhostModeMiddleware, so it reads the ghost header itself
    rather than that middleware's ContextVar, which is already reset by the time
    this one finishes. Ghost Mode is recorded, never obeyed: a flag that rides
    the request must not be able to silence the audit of that request.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")
        if not should_record(method, path):
            await self.app(scope, receive, send)
            return

        payload, ghost, ip = _decode(scope)
        category, action = classify(method, path)
        row: dict[str, Any] = {
            "category": category, "action": action,
            # The token says "web" for an authenticated browser session — but a
            # sign-in and a forgotten password arrive BEFORE there is a token,
            # and those are precisely the browser rows an admin goes looking
            # for. The path answers for them.
            "source": "web" if ((payload or {}).get("web")
                                or path.startswith(_WEB_PATHS)) else "telegram",
            "ghost": ghost, "ip": ip, "method": method, "path": path,
            "actor_role": (payload or {}).get("role"),
            "actor_name": (payload or {}).get("full_name"),
            "details": [], "changes": [], "enriched": False,
            "_payload": payload,
        }
        try:
            row["actor_telegram_id"] = int((payload or {}).get("sub"))
        except (TypeError, ValueError):
            pass

        status: Optional[int] = None

        async def send_wrapper(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message.get("status")
            await send(message)

        token = _pending.set(row)
        started = time.perf_counter()
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status = 500
            raise
        finally:
            _pending.reset(token)
            row["status"] = status
            row["outcome"] = row.get("outcome") or _outcome(status)
            row["duration_ms"] = int((time.perf_counter() - started) * 1000)
            _finalize(row)


def _finalize(row: dict) -> None:
    """Resolve the actor's PROFILE off the request path, then queue the row.

    ``viewer_profile_key`` needs a DB session, which the middleware must not
    take on the event loop — so it happens in the writer thread instead, as a
    deferred field the drain resolves before the INSERT.
    """
    payload = row.pop("_payload", None)
    if payload and not row.get("actor_profile_key"):
        row["_resolve_profile"] = payload
    _submit(row)
