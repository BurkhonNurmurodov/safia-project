from sqlalchemy import Column, Integer, BigInteger, Boolean, String, Numeric, Date, DateTime, Text, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Manager(Base):
    __tablename__ = "managers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    shift = Column(Integer)  # 1 or 2

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


class Notification(Base):
    __tablename__ = "notifications"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    recipient_telegram_id = Column(BigInteger, nullable=True)   # null = broadcast; set = user-specific
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
