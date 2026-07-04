from sqlalchemy import Column, Integer, BigInteger, Boolean, String, Numeric, Date, DateTime, Text, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Manager(Base):
    """A supervisor unit. Doubles as the supervisor *profile* in the admin
    Profiles tab: id IS the Verifix file id attendance uploads are keyed by.
    Archived units keep their history but disappear from registration pickers
    and dashboards (units with data are archived instead of deleted)."""
    __tablename__ = "managers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    shift = Column(Integer)  # 1 or 2
    archived = Column(Boolean, default=False, nullable=False)

    attendance = relationship("Attendance", back_populates="manager")
    comments = relationship("Comment", back_populates="manager")


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False)
    date = Column(Date, nullable=False)
    worker_name = Column(String)
    job_title = Column(String)
    schedule = Column(String)
    clock_in_out = Column(String)
    hours_worked = Column(Numeric(10, 4))
    early_arrival_min = Column(Numeric(10, 2))
    effective_hours = Column(Numeric(10, 4))

    manager = relationship("Manager", back_populates="attendance")


class SheetSource(Base):
    __tablename__ = "sheet_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)  # 'source' | 'shift_report'
    sheet_id = Column(String, nullable=False)


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False)
    date = Column(Date, nullable=False)
    text = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    author_telegram_id = Column(BigInteger, nullable=True)
    author_name = Column(String, nullable=True)

    manager = relationship("Manager", back_populates="comments")


class ProductionData(Base):
    __tablename__ = "production_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_name = Column(String, nullable=False, index=True)
    date = Column(String(10), nullable=False)   # "DD.MM.YYYY"
    prod_plan = Column(Numeric(14, 4), default=0.0)
    prod_actual = Column(Numeric(14, 4), default=0.0)

    __table_args__ = (UniqueConstraint("manager_name", "date", name="uq_production_manager_date"),)


class HeadcountData(Base):
    __tablename__ = "headcount_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_name = Column(String, nullable=False, index=True)
    date = Column(String(10), nullable=False)
    official_hc = Column(Numeric(10, 2), default=0.0)

    __table_args__ = (UniqueConstraint("manager_name", "date", name="uq_headcount_manager_date"),)


class DowntimeData(Base):
    __tablename__ = "downtime_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_name = Column(String, nullable=False, index=True)
    date = Column(String(10), nullable=False)
    total_minutes = Column(Numeric(10, 4), default=0.0)
    by_category = Column(JSONB, default=dict)

    __table_args__ = (UniqueConstraint("manager_name", "date", name="uq_downtime_manager_date"),)


class LeaderChecklist(Base):
    """One leader's daily checklist submission, parsed from the leaders Google
    Sheet ("Data" tab) using the fixed layout from apps-script/Code.gs. The whole
    table is wiped and reloaded on each admin refresh, so no unique constraint."""
    __tablename__ = "leader_checklists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)   # ISO "YYYY-MM-DD"
    supervisor = Column(String, nullable=False, index=True)  # brigadir (col D)
    leader = Column(String, nullable=False, index=True)      # first non-empty of cols E–P
    completion = Column(Numeric(6, 2), default=0.0)          # 0–100 (col BA)
    tasks = Column(JSONB, default=list)                      # [{id, done, photo, reason}] ×12


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class Admin(Base):
    """Telegram IDs with admin rights. Seeded once from ADMIN_TELEGRAM_ID in
    .env (comma-separated); after that the table is the source of truth and
    .env changes are ignored. An empty table re-seeds on next startup, so a
    lockout is always recoverable from .env."""
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    # Seeded admins have no telegram_users row, so their bot-DM language lives here
    # (kept in sync with the dashboard via POST /api/auth/language). See _get_user_lang.
    language = Column(String, default="uz")  # uz | uz_cyrl | ru | en
    # The admin RoleProfile this account claimed (via /adminreg or backfill).
    # One admin profile — one account; NULL only transiently for legacy rows
    # until backfill_role_profiles links them.
    profile_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RegistrationNotice(Base):
    """One row per admin notification message sent for a pending registration.
    The stored text + message_id let the panel edit every admin's message with
    the outcome once a decision is made; rows are deleted after that."""
    __tablename__ = "registration_notices"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    target_telegram_id = Column(BigInteger, nullable=False, index=True)  # the registrant
    role_ref           = Column(Integer, nullable=True, index=True)      # telegram_user_roles.id the notice is about
    admin_telegram_id  = Column(BigInteger, nullable=False)
    message_id         = Column(BigInteger, nullable=False)
    text               = Column(Text, nullable=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())


class ApprovalNotice(Base):
    """One row per admin notification message sent for a pending staff/HR request
    (edit/delete request, bulk-delete batch, or HR document). Mirrors
    RegistrationNotice but generalised across request kinds: the stored text +
    message_id let any decision path edit every admin's message with the outcome
    and drop its buttons; rows are deleted once the decision is recorded.

    Registrations keep their own RegistrationNotice table — this one covers the
    kinds that previously had no Telegram message tracking at all."""
    __tablename__ = "approval_notices"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    kind              = Column(String, nullable=False)      # edit_request | edit_batch | hr_document
    ref               = Column(String, nullable=False, index=True)  # request id / batch token / doc id
    admin_telegram_id = Column(BigInteger, nullable=False)
    message_id        = Column(BigInteger, nullable=False)
    text              = Column(Text, nullable=False)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())


class TelegramUser(Base):
    """One row per Telegram account (the person). The roles the person holds
    live in telegram_user_roles — a user may hold several (e.g. supervisor of
    two units). The legacy role/role_id/status columns mirror the most recent
    registration only; all reads go through telegram_user_roles."""
    __tablename__ = "telegram_users"

    id = Column(Integer, primary_key=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String, nullable=True)
    full_name = Column(String, nullable=False)
    tg_name = Column(String, nullable=True)  # Telegram account name (first+last), refreshed on login
    role    = Column(String, nullable=False)   # LEGACY mirror — see class docstring
    role_id = Column(Integer, nullable=True)   # LEGACY mirror — see class docstring
    phone   = Column(String, nullable=True)
    language = Column(String, default="uz")  # uz | ru | en
    status = Column(String, default="pending")  # LEGACY mirror — see class docstring
    active_role_ref = Column(Integer, nullable=True)  # telegram_user_roles.id last used in the web app
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)


class TelegramUserRole(Base):
    """One role instance held (or requested) by a Telegram user. A user may
    hold any mix, including several instances of the same role pointing at
    different units/slots. full_name is the role-scoped display name: the
    unit (manager) name for supervisors, the slot name for shift-managers,
    the person's own name for top-managers."""
    __tablename__ = "telegram_user_roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    role    = Column(String, nullable=False)   # top-manager | shift-manager | supervisor
    role_id = Column(Integer, nullable=True)   # supervisor→managers.id | shift-manager→slot 1-4 | top-manager→null
    full_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | approved | rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("telegram_id", "role", "role_id", name="uq_user_role_instance"),
    )


class RoleProfile(Base):
    """An admin-pre-created profile a Telegram user claims at registration.
    Registration never creates identities anymore — users only bind one of
    these to their account. Supervisor profiles are NOT here: they are the
    `managers` rows themselves (managers.id = Verifix file id). role_id
    semantics per role: top-manager/shift-manager role rows point at this
    table's id; leader role rows keep pointing at the supervisor's manager id
    (JWT/Concerns compatibility) and bind to a profile via (manager_id, name).
    Admin profiles are bound via admins.profile_id."""
    __tablename__ = "role_profiles"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    role       = Column(String, nullable=False, index=True)  # top-manager | shift-manager | leader | admin
    name       = Column(String, nullable=False)              # canonical (Uzbek Latin) display name
    shift      = Column(Integer, nullable=True)              # shift-managers only: 1 | 2
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=True)  # leaders only: their supervisor's unit
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    recipient_telegram_id = Column(BigInteger, nullable=True)   # null = broadcast; set = user-specific
    # Canonical key of the addressee PROFILE ("role:id" — role_profiles.id for
    # admin/top-manager/shift-manager/leader/guest, managers.id for supervisor).
    # One account can hold several profiles via role switching, so delivery is
    # per-profile: a keyed row shows only under that profile and follows the
    # profile if it is re-claimed. NULL = legacy account-keyed row (delivered by
    # recipient_telegram_id) or broadcast — no backfill, both models coexist.
    recipient_profile     = Column(String, nullable=True, index=True)
    # Template-based, view-time-localizable text: nkey + params let the bell render
    # each row in the *viewer's* current language (and re-render on switch). title/
    # body still hold the text rendered in the recipient's language at creation —
    # used for the Telegram DM and as a fallback for legacy/free-form rows (nkey null).
    nkey                  = Column(String, nullable=True)        # template key (see _NOTIF_STRINGS); null = free-form
    params                = Column(JSONB, nullable=True)         # JSON params for the template
    title                 = Column(String, nullable=False)
    body                  = Column(Text, nullable=False)
    type                  = Column(String, default="info")      # info | success | warning | error
    created_at            = Column(DateTime(timezone=True), server_default=func.now())


class EditRequest(Base):
    __tablename__ = "edit_requests"

    id                       = Column(Integer, primary_key=True, autoincrement=True)
    manager_id               = Column(Integer, ForeignKey("managers.id"), nullable=False)
    supervisor_telegram_id   = Column(BigInteger, nullable=False)
    supervisor_name          = Column(String, nullable=False)
    date                     = Column(Date, nullable=False)
    worker_name              = Column(String, nullable=False)
    changes                  = Column(JSONB, nullable=False)   # {field: new_value}
    original                 = Column(JSONB, nullable=False)   # {field: old_value}
    status                   = Column(String, default="pending")  # pending | approved | rejected
    processed_by_telegram_id = Column(BigInteger, nullable=True)
    processed_by_name        = Column(String, nullable=True)
    created_at               = Column(DateTime(timezone=True), server_default=func.now())
    processed_at             = Column(DateTime(timezone=True), nullable=True)
    batch_id                 = Column(String, nullable=True, index=True)


class HrDocument(Base):
    """
    Document-driven HR change (1C/Datalab style).

    doc_type:
      role_change     → batch reassignment of job_title for N employees
      people_exchange → (placeholder)
      graphic_change  → (placeholder)

    status:
      draft     → "Нет" (not posted, no effect on attendance)
      approved  → "Да"  (posted, effects applied to attendance)

    payload (role_change):
      { "new_role": str,
        "employees": [ { "worker_name": str, "old_role": str }, ... ] }
    """
    __tablename__ = "hr_documents"

    id                      = Column(Integer, primary_key=True, autoincrement=True)
    doc_type                = Column(String, nullable=False, default="role_change")
    manager_id              = Column(Integer, ForeignKey("managers.id"), nullable=False)
    supervisor_name         = Column(String, nullable=True)   # display name of the unit / supervisor
    date                    = Column(Date, nullable=False)     # effective / selected date
    payload                 = Column(JSONB, nullable=False, default=dict)
    status                  = Column(String, nullable=False, default="draft")  # draft | approved
    created_by_telegram_id  = Column(BigInteger, nullable=True)
    created_by_name         = Column(String, nullable=True)
    created_by_role         = Column(String, nullable=True)
    approved_by_telegram_id = Column(BigInteger, nullable=True)
    approved_by_name        = Column(String, nullable=True)
    approved_at             = Column(DateTime(timezone=True), nullable=True)
    created_at              = Column(DateTime(timezone=True), server_default=func.now())
    updated_at              = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    history = relationship(
        "HrDocumentHistory",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="HrDocumentHistory.created_at",
    )


class HrDocumentHistory(Base):
    """Audit trail for an HrDocument — drives the 'История изменений' view."""
    __tablename__ = "hr_document_history"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    document_id       = Column(Integer, ForeignKey("hr_documents.id", ondelete="CASCADE"), nullable=False)
    action            = Column(String, nullable=False)   # created | edited | approved | cancelled
    actor_telegram_id = Column(BigInteger, nullable=True)
    actor_name        = Column(String, nullable=True)
    detail            = Column(JSONB, nullable=True)      # snapshot / note
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("HrDocument", back_populates="history")


class Language(Base):
    """Available UI languages. uz/ru/en are seeded as built-ins; admins may
    add more from the translation editor."""
    __tablename__ = "languages"

    code       = Column(String, primary_key=True)   # "uz" | "ru" | "en" | ...
    name       = Column(String, nullable=False)      # display name e.g. "O'zbekcha"
    is_builtin = Column(Boolean, default=False)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Translation(Base):
    """A single translated string override (lang, key) → value.

    The built-in defaults live in the frontend's translations.js. The DB only
    stores admin overrides and brand-new keys/languages; the runtime merges
    these on top of the static defaults.
    """
    __tablename__ = "translations"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    lang       = Column(String, nullable=False)
    key        = Column(String, nullable=False)
    value      = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("lang", "key", name="uq_translation_lang_key"),)


class DayApproval(Base):
    """
    Per-(manager, date) day-close marker.

    The mere existence of a row means the supervisor CLOSED the day — final,
    no admin/shift-manager approval required (they are only notified). After
    closing, the supervisor can no longer submit edit/delete requests or
    role-change documents for that date. Only an admin can re-open a closed
    day (deletes the row, returning the day to 'open').

    Gating: a manager's data for a date is calculated/shown anywhere only when
    the day is CONFIRMED — closed AND every EditRequest / HrDocument for that
    (manager, date) is processed (approved or rejected). See
    app/services/day_state.py. Historical data is backfilled as closed on
    rollout (see backfill_day_closures).
    """
    __tablename__ = "day_approvals"

    id                      = Column(Integer, primary_key=True, autoincrement=True)
    manager_id              = Column(Integer, ForeignKey("managers.id"), nullable=False)
    date                    = Column(Date, nullable=False)
    approved_by_telegram_id = Column(BigInteger, nullable=True)
    approved_by_name        = Column(String, nullable=True)
    approved_at             = Column(DateTime(timezone=True), server_default=func.now())
    created_at              = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("manager_id", "date", name="uq_day_approval_manager_date"),)


class DailySubmission(Base):
    """
    LEGACY — the old 'submit for admin review' step, replaced by the
    supervisor day-close flow (DayApproval row = closed, no admin approval).
    Kept only so historical rows remain readable; nothing writes to it.
    """
    __tablename__ = "daily_submissions"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    manager_id   = Column(Integer, ForeignKey("managers.id"), nullable=False)
    date         = Column(Date, nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("manager_id", "date", name="uq_daily_submission_manager_date"),)


class ExchangeTask(Base):
    """
    Permanent, shared list of worker-exchange task names (the "🗂 vazifa"
    options). Unlike the old per-date derivation from documents, a task created
    here is offered on every date until an admin removes it. Removal is a soft
    delete (active=False): the name stays so existing exchange documents that
    reference it keep resolving, it just disappears from the picker.
    """
    __tablename__ = "exchange_tasks"

    id                     = Column(Integer, primary_key=True, autoincrement=True)
    name                   = Column(String, nullable=False, unique=True)
    active                 = Column(Boolean, nullable=False, server_default="true")
    created_at             = Column(DateTime(timezone=True), server_default=func.now())
    created_by_telegram_id = Column(BigInteger, nullable=True)


# ---------------------------------------------------------------------------
# Production planning (ABC form) — replicates the SAP-driven Excel dashboard
# ("Sheet1 ..." per brigadir). All pp_* tables key on managers.id, since a
# brigadir is the supervisor of a Manager (unit). New tables only — created by
# Base.metadata.create_all, no ALTERs needed.
# ---------------------------------------------------------------------------

class PPProduct(Base):
    """Catalog line. One row per (brigadir, SAP code, work center, operation):
    the same SAP code at one work center may appear several times, each a
    distinct operation with its own labor_time (seconds per unit)."""
    __tablename__ = "pp_products"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    manager_id  = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    sap_code    = Column(String, nullable=False, index=True)
    name        = Column(String, nullable=False, default="")
    work_center = Column(String, nullable=False, index=True)
    labor_time  = Column(Numeric(12, 4), nullable=True)   # seconds/unit; NULL → warn
    sort_order  = Column(Integer, default=0)
    active      = Column(Boolean, nullable=False, server_default="true")
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class PPWorkCenter(Base):
    """Per-brigadir work-center config.

    shtatka (W)  — establishment headcount for the work center.
    capacity (S) — planned productive minutes the roster can deliver ("Для 85%
                   труд", ≈ W × 0.85 × 480). Hand-tuned per work center; when
                   NULL the engine falls back to W × productive_min (default 425).
    People needed (N) = ROUND(W × Σlabor / S); see services/pp_calc.py."""
    __tablename__ = "pp_work_centers"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    code       = Column(String, nullable=False)
    shtatka    = Column(Integer, nullable=False, default=0)
    capacity   = Column(Numeric(12, 2), nullable=True)
    sort_order = Column(Integer, default=0)
    active     = Column(Boolean, nullable=False, server_default="true")

    __table_args__ = (UniqueConstraint("manager_id", "code", name="uq_pp_wc_manager_code"),)


class PPDaily(Base):
    """Daily snapshot of plan/actual quantities per (brigadir, date, SAP code,
    work center). Grain matches the фаза SUMIFS (SKU + work center + date), so
    all operations of one SKU+WC share the same quantity. *_override holds a
    brigadir's manual value and is cleared on the next SAP upload of that field."""
    __tablename__ = "pp_daily"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    manager_id      = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date            = Column(Date, nullable=False, index=True)
    sap_code        = Column(String, nullable=False)
    work_center     = Column(String, nullable=False)
    plan_qty        = Column(Numeric(14, 4), default=0)   # фаза «Кол-во операции» (Excel col F)
    actual_qty      = Column(Numeric(14, 4), default=0)   # заголовок «Поставлено» (Excel «План пост», col M)
    plan_override   = Column(Numeric(14, 4), nullable=True)
    actual_override = Column(Numeric(14, 4), nullable=True)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("manager_id", "date", "sap_code", "work_center", name="uq_pp_daily_key"),
    )


class PPReconciliation(Base):
    """Manual reconciliation block per (brigadir, date): По штатке / Бригадир /
    Лидер / Мицу / Отдихает and people-present figures. Stored as a JSONB blob
    while the block stabilises (attendance auto-wiring is a later phase)."""
    __tablename__ = "pp_reconciliation"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date       = Column(Date, nullable=False, index=True)
    data       = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("manager_id", "date", name="uq_pp_recon_manager_date"),)


class PPUpload(Base):
    """Raw slice of an uploaded SAP file, kept so the dashboard's view switcher
    can show the source rows behind the numbers.

    file_type: 'faza' (План … фаза — operations detail, drives the dashboard)
               'zaga' (План заголовок — order headers, reference only).
    columns/rows store a render-ready table scoped to this brigadir+date
    (faza → the brigadir's work centers on that date; zaga → catalog SKUs)."""
    __tablename__ = "pp_uploads"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    manager_id  = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date        = Column(Date, nullable=False, index=True)
    file_type   = Column(String, nullable=False)   # 'faza' | 'zaga'
    filename    = Column(String, nullable=True)
    columns     = Column(JSONB, nullable=False, default=list)  # [header, ...]
    rows        = Column(JSONB, nullable=False, default=list)  # [[cell, ...], ...]
    row_count   = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("manager_id", "date", "file_type", name="uq_pp_upload_key"),
    )


class KaizenTask(Base):
    """One row (task) from any of the eight Kaizen-session Notion databases.

    Stored as a flat, source-agnostic snapshot (see services/notion_kaizen.py).
    The whole table is replaced on each refresh, so there is no incremental
    diffing — ``notion_id`` is kept only for stable per-row React keys / links."""
    __tablename__ = "kaizen_tasks"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    project      = Column(String, index=True)   # Notion heading, e.g. "Хансей"
    project_key  = Column(String, index=True)   # stable slug, e.g. "hansei"
    notion_id    = Column(String, unique=True)
    url          = Column(String, nullable=True)
    title        = Column(Text)
    status       = Column(String, index=True)   # Done | In progress | Not started
    task_type    = Column(String, nullable=True)
    responsible  = Column(JSONB, default=list)   # [name, ...]
    customer     = Column(JSONB, default=list)   # [name, ...]
    deadline     = Column(String, nullable=True)  # ISO date 'YYYY-MM-DD'
    created_time = Column(String, nullable=True)  # ISO datetime from Notion
    synced_at    = Column(DateTime(timezone=True), server_default=func.now())


class KaizenSyncMeta(Base):
    """Singleton row (id=1) tracking the last Kaizen → Notion sync."""
    __tablename__ = "kaizen_sync_meta"

    id          = Column(Integer, primary_key=True)
    last_synced = Column(DateTime(timezone=True), nullable=True)
    ok          = Column(Boolean, default=True)
    message     = Column(Text, nullable=True)
    task_count  = Column(Integer, default=0)


class UserActivity(Base):
    """One row per (Telegram account, calendar day) — a rolling daily usage
    aggregate that powers the Users-Activity dashboard (active users, average
    time-in-app, GitHub-style contribution grid).

    Filled by the heartbeat endpoint (POST /api/activity/ping): while the web app
    is open and visible it pings every ~60 s. Each ping folds into that person's
    row for the current UTC day:

      • ``active_seconds`` accumulates the gap since the previous ping *only* when
        that gap is short enough to count as continuous engagement (≤ PING_MAX_GAP
        in services-less router logic) — long gaps start a fresh segment and add
        nothing, so idle/backgrounded time is never counted.
      • ``event_count`` counts pings (a rough interaction volume).
      • ``full_name`` / ``role`` snapshot the active JWT identity so the dashboard
        can name the account even for seeded admins (who have no telegram_users
        row).

    A per-day grain keeps the table tiny (≈ users × days) while giving exact
    daily/monthly rollups and a natural contribution calendar. Data only exists
    from the day tracking ships forward — there is no historical backfill."""
    __tablename__ = "user_activity"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id    = Column(BigInteger, nullable=False, index=True)
    day            = Column(Date, nullable=False, index=True)   # UTC calendar day
    full_name      = Column(String, nullable=True)              # snapshot from JWT
    role           = Column(String, nullable=True)              # snapshot from JWT
    first_seen     = Column(DateTime(timezone=True), nullable=True)
    last_seen      = Column(DateTime(timezone=True), nullable=True)
    active_seconds = Column(Integer, nullable=False, default=0)
    event_count    = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("telegram_id", "day", name="uq_user_activity_tid_day"),
    )


# ---------------------------------------------------------------------------
# Leader concerns ("Xavotirlar") — replicates the per-brigadir concern log
# (Sanjar.xlsx). A leader logs concerns raised on the floor; each row is owned
# by the leader's pre-created profile (role_profiles), so admins, shift
# managers, and supervisors can log a concern for a leader who hasn't claimed
# their profile yet — the leader inherits it on registration. Each row carries
# a snapshot of the leader + their brigadir (the supervisor of the leader's
# unit). Visibility is role-scoped in routers/concerns.py: admin/top-manager
# everything, shift-manager their shift's units, supervisor their unit,
# leader their own rows.
# ---------------------------------------------------------------------------

class LeaderConcern(Base):
    __tablename__ = "leader_concerns"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    # Ownership key: the owning leader's role_profiles.id. Profiles exist for
    # every leader (claimed or not), so this is the stable canonical owner.
    leader_profile_id   = Column(Integer, nullable=True, index=True)
    # The owning leader's telegram_user_roles.id when the profile was already
    # claimed at creation — NULL for concerns logged for unregistered leaders,
    # kept as a scope fallback for legacy rows without a profile match.
    leader_role_ref     = Column(Integer, nullable=True, index=True)
    leader_name         = Column(String, nullable=False)          # snapshot of the leader's name
    brigadir_manager_id = Column(Integer, nullable=True)          # managers.id (leader's unit/brigadir)
    brigadir_name       = Column(String, nullable=True)           # snapshot of the brigadir's name
    cell_code           = Column(String, nullable=True)           # Код ячейки
    concern_owner       = Column(String, nullable=False)          # Хавотир эгаси (worker who raised it)
    concern_text        = Column(Text, nullable=False)            # Хавотир
    status              = Column(String, nullable=False, server_default="todo")  # todo | doing | done
    deadline_days       = Column(Integer, nullable=True)          # Срок (days)
    entry_date          = Column(Date, nullable=False)            # Дата заполнения
    completion_date     = Column(Date, nullable=True)             # Дата завершения (set when done)
    # Exact moment the status flipped to done (cleared on reopen) — powers the
    # created→done "время выполнения" minutes column; completion_date is only
    # day-grained.
    done_at             = Column(DateTime(timezone=True), nullable=True)
    solution            = Column(Text, nullable=True)             # Решение
    created_by          = Column(BigInteger, nullable=True)       # telegram_id of author (leader or admin)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LeaderTask(Base):
    """A supervisor→leader assignment (the "DAILY протокол" board that used to
    live in Google Sheets). ``priority`` is the per-leader queue position over
    the ACTIVE (todo/doing) tasks only — always a dense 1..N; a done task leaves
    the queue (priority NULL) and the rest close ranks. The queue invariant is
    maintained by routers/tasks.py."""
    __tablename__ = "leader_tasks"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    # Ownership key: the assigned leader's telegram_user_roles.id.
    leader_role_ref       = Column(Integer, nullable=False, index=True)
    leader_name           = Column(String, nullable=False)         # snapshot of the leader's name
    supervisor_manager_id = Column(Integer, nullable=True)         # managers.id (leader's unit)
    supervisor_name       = Column(String, nullable=True)          # snapshot of the unit/brigadir name
    task_text             = Column(Text, nullable=False)           # Задача
    priority              = Column(Integer, nullable=True)         # Приоритет: 1..N among active tasks; NULL once done
    status                = Column(String, nullable=False, server_default="todo")  # todo | doing | done
    due_date              = Column(Date, nullable=False)           # Срок выполнения
    completed_at          = Column(DateTime(timezone=True), nullable=True)  # set when flipped to done
    created_by            = Column(BigInteger, nullable=True)      # telegram_id of creator (supervisor or admin)
    created_by_name       = Column(String, nullable=True)          # snapshot of the creator's display name
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    updated_at            = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LeaderTaskComment(Base):
    """Chat-style comment thread on a leader task. Editable/deletable only by
    the authoring profile (enforced in routers/tasks.py)."""
    __tablename__ = "leader_task_comments"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    task_id            = Column(Integer, nullable=False, index=True)   # leader_tasks.id
    author_telegram_id = Column(BigInteger, nullable=False)
    # telegram_user_roles.id of the authoring PROFILE (0 = admin sentinel). One
    # account can hold several profiles, so ownership is per-profile; NULL rows
    # predate the column and fall back to account-scoped ownership.
    author_role_ref    = Column(Integer, nullable=True)
    author_name        = Column(String, nullable=True)                 # snapshot of the author's display name
    text               = Column(Text, nullable=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    edited_at          = Column(DateTime(timezone=True), nullable=True)  # set on every edit
