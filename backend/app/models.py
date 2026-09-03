from sqlalchemy import Column, Index, Integer, BigInteger, Boolean, String, Numeric, Float, Date, DateTime, LargeBinary, Text, ForeignKey, func, text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Factory(Base):
    """A physical plant. The company now runs more than one, so every page that
    reports production reality needs to say WHICH plant it is reporting on.

    The factory dimension is deliberately attached in exactly ONE place — a
    supervisor unit's ``managers.factory_id`` — and everything else derives from
    there: a cell follows its supervisor, a leader follows their unit, a
    downtime/quality row follows the supervisor its name resolves to. Storing it
    twice would let a cell claim factory A while the supervisor running it sits
    in factory B, and there is no correct way to render that.

    Names are per-language like every other DB-held name (Russian is what the
    plant actually fills in and is the display fallback — see
    ``utils/cellName.js``). ``sort_order`` fixes the tab order on the six
    factory-aware pages, so it never depends on insertion order or on an id.
    """
    __tablename__ = "factories"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    # Short human code shown in dense places (tabs on a 390px phone, exports).
    code       = Column(String, nullable=False, unique=True)
    name_uz      = Column(String, nullable=True)
    name_uz_cyrl = Column(String, nullable=True)
    name_ru      = Column(String, nullable=True)
    name_en      = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, server_default="0", default=0)
    # Archived factories keep their supervisors (and therefore their history)
    # but stop appearing as a tab — same "archive, never delete, once it holds
    # data" rule the supervisor units follow.
    archived   = Column(Boolean, nullable=False, server_default="false", default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
    # THE factory dimension (see Factory). Nullable so a newly seeded unit is
    # never silently attributed to the wrong plant: an unassigned supervisor is
    # visible only on the «All factories» tab, where an admin can see it needs
    # assigning, rather than padding some factory's numbers.
    factory_id = Column(Integer, ForeignKey("factories.id"), nullable=True, index=True)

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
    # 2026-08-01: which production cell («Код подразделения») the row came from,
    # set by the single-file «Davomat» upload. NULL on rows from the older
    # per-supervisor verifix files — those days simply group under "no cell".
    verifix_code = Column(String, nullable=True, index=True)
    # 2026-08-14: the unit's OWN brigadir. They clock in with no «Код
    # подразделения», so no cell routes their row to a supervisor — the single-
    # file upload matches them by NAME instead (see _cellless_by_manager). The
    # flag is what keeps them OFF the load: their job title is whatever the HR
    # export happens to spell, and a blank one would otherwise be counted by the
    # "no title + hours" fallback in is_direct_role.
    is_supervisor = Column(Boolean, nullable=False, server_default="false", default=False)
    # 2026-08-30: one worker-day SPLIT across two of the unit's own cells. The
    # supervisor names the split on /staff; the platform then has to count the
    # person once, not twice, so each half carries the FRACTION of a person it
    # represents — pro-rata by the hours placed in that cell, the two halves
    # summing to exactly 1.0.
    #
    # NULL means ONE WHOLE PERSON: every row that predates this, and every
    # unsplit row forever after. The readers spell that as
    # ``1.0 if hc_weight is None else float(hc_weight)`` rather than defaulting
    # the column, because a stored 1.0 would be indistinguishable from "somebody
    # split this worker and the other half is missing".
    #
    # Float and NOT Numeric on purpose: hours_worked is Numeric(10,4), so
    # SQLAlchemy hands it back as Decimal and every reader already wraps it in
    # float(). A Decimal summed into a float accumulator — which is what every
    # headcount total on this platform is — raises TypeError, and the one place
    # it would surface is inside a KPI nobody re-reads by hand.
    hc_weight = Column(Float, nullable=True)
    # The PRIMARY row's attendance.id, set only on the SECONDARY row of a split
    # pair — so the pair is walkable in one direction and there is exactly one
    # row that owns the worker-day. NULL on every normal row AND on the primary
    # row of a split; "is this the second half" is therefore a NOT NULL test and
    # never a comparison against a sentinel. Indexed because the /staff cell
    # editor looks the secondary up by its primary on every save.
    split_of  = Column(Integer, nullable=True, index=True)

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
    # Author PROFILE key ("role:id"). The profile owns the comment: any account
    # holding it — including a successor after handover — may edit/delete, while
    # the same account switched into a DIFFERENT profile may not. NULL rows
    # predate the column and fall back to author_telegram_id.
    author_profile = Column(String, nullable=True, index=True)
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
    # Every shift-report category is a column PAIR: the wait stopped the cell
    # («тўхтаганда» → total_minutes / by_category) or it did not («тўхтамаганда»
    # → the _ns pair below). One row carries both halves for a (brigadir, date);
    # the Ojidaniya page shows one half per tab.
    total_minutes = Column(Numeric(10, 4), default=0.0)
    by_category = Column(JSONB, default=dict)
    total_minutes_ns = Column(Numeric(10, 4), default=0.0)
    by_category_ns = Column(JSONB, default=dict)

    __table_args__ = (UniqueConstraint("manager_name", "date", name="uq_downtime_manager_date"),)


class LeaderChecklist(Base):
    """One leader's daily checklist submission, parsed from the leaders Google
    Sheet ("Data" tab); columns are resolved by header in sheets_reader, because
    the form gains questions and shifts everything to their right. The whole
    table is wiped and reloaded on each admin refresh, so no unique constraint —
    a leader may legitimately submit twice for the same day, and both rows count."""
    __tablename__ = "leader_checklists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)   # ISO "YYYY-MM-DD" — the day reported on
    supervisor = Column(String, nullable=False, index=True)  # brigadir («Бригадир ФИО»)
    leader = Column(String, nullable=False, index=True)      # («Name», else the brigadir's branch column)
    completion = Column(Numeric(6, 2), default=0.0)          # 0–100, weighted score straight from the sheet
    tasks = Column(JSONB, default=list)                      # [{id, done, answered, photo, reason}]
    # The form's own submission identity. submitted_at is the wall-clock moment the
    # leader filed the checklist — compared against `date`, it exposes the ones
    # backfilled a day or more after the shift they describe.
    submission_id = Column(String, nullable=True, index=True)
    submitted_at = Column(DateTime, nullable=True)


class LeaderLateRequest(Base):
    """A supervisor's request to count one leader-day that the shift-1 submission
    window voided (see routers/leaders.py), and the admin decision on it.

    Keyed by (leader, day), NOT by submission row: leader_checklists is wiped and
    reloaded on every sheet refresh, so anything keyed to a row id would lose its
    decision on the next sync. The leader is held BOTH ways — the profile id when
    the name resolved to one (the person, immune to the sheet's spelling) and the
    raw sheet spelling as the fallback for a leader who never resolved, so a day
    can still be opened for them.

    One live row per (leader, day): a rejected request may be re-filed, and the
    re-file replaces it. `status` is pending → approved | rejected; an approved
    row makes the day count at its full checklist score while still flagging it
    as late, which is the whole point of the flow (the day is opened, not
    laundered)."""
    __tablename__ = "leader_late_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), nullable=False, index=True)   # the REPORTED day
    leader_profile_id = Column(Integer, nullable=True, index=True)  # role_profiles.id
    leader_name = Column(String, nullable=False)            # raw sheet spelling
    manager_id = Column(Integer, nullable=True, index=True)  # the unit that owns the day
    status = Column(String, nullable=False, default="pending", index=True)

    # Why the day should count. Required — an opened day has to explain itself.
    reason = Column(Text, nullable=False)
    requested_by_profile = Column(String, nullable=True)     # "supervisor:12"
    requested_by_name = Column(String, nullable=True)
    requested_by_telegram = Column(BigInteger, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())

    decided_by_name = Column(String, nullable=True)
    decided_by_telegram = Column(BigInteger, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class UiPref(Base):
    """Per-profile UI preferences (table column visibility/order, …). Keyed by
    the viewer's ACTIVE profile key ("role:id"); accounts without a bound
    profile degrade to "acct:<telegram id>" so persistence still works."""
    __tablename__ = "ui_prefs"

    profile_key = Column(String, primary_key=True)
    pref_key = Column(String, primary_key=True)
    value = Column(String, nullable=False)  # JSON blob


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
    # Can the bot actually DM this account? Set when Telegram permanently
    # refuses a notification (never pressed /start, blocked the bot, account
    # deleted) and cleared by the next delivered one. Without it a bell row
    # with no DM behind it is invisible — the failure only ever reached the
    # server log, which nobody reads (see routers/profiles.py "DM" column).
    dm_failed_at = Column(DateTime(timezone=True), nullable=True)
    dm_error     = Column(String, nullable=True)


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
    # Canonical key of the PROFILE this registration claimed ("role:id" — see
    # app/identity.py). A profile is a person: several accounts may hold the
    # same one and they are all that person, so every people-list, assignment
    # and row-level permission keys off this, never off the row's own id.
    # Derivable for supervisor/shift-manager/top-manager/guest (role_id IS the
    # profile), but NOT for leaders — their role_id is the unit and the profile
    # was matched by name string, which silently broke on any rename. Stamped
    # at claim time; NULL only for rows a backfill could not resolve.
    profile_key = Column(String, nullable=True, index=True)
    status = Column(String, default="pending")  # pending | approved | rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)

    # One registration per (account, profile) — but "profile" is not role_id for
    # leaders: theirs is the UNIT, shared by every leader profile in it, so a
    # single (telegram_id, role, role_id) key allowed an account exactly ONE
    # leader profile per unit and silently swallowed the second claim. Leaders
    # are keyed on the profile they claimed; everyone else keeps the old key
    # (their role_id IS the profile). Live DBs get the same shape from
    # startup.migrate_leader_role_uniqueness.
    # Both predicates are given per dialect: a dialect that drops the WHERE turns
    # a partial index into a full one, i.e. back into the cap this removes.
    __table_args__ = (
        Index("uq_user_role_instance_nonleader", "telegram_id", "role", "role_id",
              unique=True,
              postgresql_where=text("role <> 'leader'"),
              sqlite_where=text("role <> 'leader'")),
        Index("uq_user_role_leader_profile", "telegram_id", "profile_key",
              unique=True,
              postgresql_where=text("role = 'leader' AND profile_key IS NOT NULL"),
              sqlite_where=text("role = 'leader' AND profile_key IS NOT NULL")),
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
    # Per-language display names (uz Latin stays in `name`). Nullable — filled
    # in as values become known; migrate_cells_leaders_columns backfills them
    # from any existing name.{canonical} translation overrides.
    name_uz_cyrl = Column(String, nullable=True)
    name_ru      = Column(String, nullable=True)
    name_en      = Column(String, nullable=True)
    shift      = Column(Integer, nullable=True)              # shift-managers only: 1 | 2
    # shift-managers only: the PLANT they run that shift in. NULL = every plant
    # — the pre-factory behaviour, and the default, so nothing moves until an
    # admin assigns one (see services/shift_scope.py). This is not a second
    # copy of the data dimension: managers.factory_id still decides which plant
    # a ROW belongs to; this says where a PERSON works, exactly as `shift` does.
    factory_id = Column(Integer, ForeignKey("factories.id"), nullable=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=True)  # leaders only: their supervisor's unit
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WebCredential(Base):
    """A username+password login for the browser, keyed by PROFILE.

    The app's own front door is Telegram: ``initData`` proves the caller sits
    inside a genuine WebView, and ``security.py`` re-verifies it on every
    request. Opening the dashboard at production.safiacorporate.uz means that
    proof does not exist, so a password stands in for it.

    The credential belongs to the PROFILE, not to a Telegram account, because a
    profile IS the person (see ``app/identity.py``). Several accounts holding
    one profile share this one login exactly as they already share that
    profile's work, and a generated password is DM'd to every holder. The key
    is the canonical ``"role:id"`` string, so supervisors (``managers.id``) and
    everyone else (``role_profiles.id``) live in one table.

    ``token_version`` is the revocation handle: bumping it invalidates every
    browser session issued for this profile ("sign out everywhere") while
    leaving Telegram sessions alone — those carry no version claim and are
    gated by initData anyway.
    """
    __tablename__ = "web_credentials"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    profile_key     = Column(String, nullable=False, unique=True, index=True)
    # Stored lowercase. The login form folds case before comparing, so a phone
    # keyboard's automatic capital never locks anyone out of their own account.
    username        = Column(String, nullable=False, unique=True, index=True)
    password_hash   = Column(String, nullable=False)
    # A SEALED, reversible copy of the same password (``web_auth.seal_password``).
    # The hash answers "is this the password?"; an admin managing logins also has
    # to answer "what IS it?" — people lose the DM, and the only other answer,
    # "reset it", signs that person out of every browser they are working in.
    # Sealed rather than plaintext because the key is derived from SECRET_KEY,
    # which lives in backend/.env and NOT in the database, so the .sql.gz the
    # dbdump tab mails to Telegram carries ciphertext and nothing more. NULL on
    # credentials last set before this column existed — those read as "unknown"
    # on the profile page, never as a guess.
    password_enc    = Column(String, nullable=True)
    enabled         = Column(Boolean, nullable=False, default=True)
    token_version   = Column(Integer, nullable=False, default=1)
    # Lockout state lives in the DB, not in process memory: an attacker who can
    # cause a restart must not be able to reset the counter.
    failed_attempts = Column(Integer, nullable=False, default=0)
    locked_until    = Column(DateTime(timezone=True), nullable=True)
    last_login_at   = Column(DateTime(timezone=True), nullable=True)
    password_set_at = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class ProfilePhoto(Base):
    """A profile's avatar, keyed by the canonical profile key like the web
    credential above — several Telegram accounts holding one profile share one
    photo, exactly as they share everything else the profile owns.

    Bytes live in the DB rather than on disk on purpose: the prod checkout is
    hard-reset on every deploy, so server-side files are state that has to be
    remembered about — a DB row survives deploys, restores and the dbdump tab
    for free. Images are re-encoded server-side (Pillow, ≤512px JPEG) before
    they land here, so a row is small and never carries the original upload."""
    __tablename__ = "profile_photos"

    profile_key = Column(String, primary_key=True)
    mime        = Column(String, nullable=False, default="image/jpeg")
    data        = Column(LargeBinary, nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(),
                         onupdate=func.now())


class Cell(Base):
    """A production cell, first-class entity: Verifix code (unique), optional
    SAP code and per-language workshop names, owned by a supervisor unit and,
    optionally, by one leader profile (a leader can own several; leader_id NULL
    = no leader — releasing a cell keeps the row so its metadata survives
    reassignment). manager_id is the primary owner link: a cell always belongs
    to a supervisor, with or without a leader. When a leader owns the cell its
    supervisor follows that leader's unit (kept in sync in profiles.py).

    2026-08-21: the cell also carries its working START and END clock. NULL =
    inherit the shift default of its supervisor's shift (the AppSetting rows
    cell_hours_shift_1 / cell_hours_shift_2); both-or-neither, a half-set pair
    is rejected on write and read as "inherit". Values are Tashkent wall-clock
    "HH:MM" strings, and ``shift_end <= shift_start`` means the window CROSSES
    MIDNIGHT — the duration is always DERIVED, never stored. NOTHING consumes
    these yet: they are a register only (no загрузка, no idle-cell, no
    checklist, no attendance)."""
    __tablename__ = "cells"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    verifix_code = Column(String, nullable=False, unique=True)
    sap_code     = Column(String, nullable=True)
    # Workshop name per language — all nullable until the values are known.
    name_workshop_uz      = Column(String, nullable=True)
    name_workshop_uz_cyrl = Column(String, nullable=True)
    name_workshop_ru      = Column(String, nullable=True)
    name_workshop_en      = Column(String, nullable=True)
    # Owning supervisor unit — a cell may belong to a supervisor with no leader.
    manager_id   = Column(Integer, ForeignKey("managers.id"), nullable=True, index=True)
    leader_id    = Column(Integer, ForeignKey("role_profiles.id"), nullable=True, index=True)
    # 2026-07-31: does this cell count toward the production load (загрузка)?
    # Until now that was DERIVED from "the cell has a supervisor"; it is now an
    # explicit admin decision, ticked on the cell's own page (/cells/:id).
    # Default off — a newly registered cell counts only once an admin says so.
    in_load      = Column(Boolean, nullable=False, server_default="false", default=False)
    # 2026-08-01: permanent answer to "do this cell's people count toward its
    # supervisor's attendance?" on the «Davomat» tab. NULL = derive it (a cell
    # with a supervisor counts, an orphan cell does not), TRUE/FALSE = an admin
    # made it permanent. Each upload day may still override it for that day
    # alone; this is only the starting state a new day inherits.
    att_included = Column(Boolean, nullable=True)
    # 2026-08-21: the cell's own working hours, "HH:MM" Tashkent wall clock.
    # NULL on BOTH = inherit the supervisor's shift default; see the docstring.
    shift_start  = Column(String(5), nullable=True)
    shift_end    = Column(String(5), nullable=True)


class CellOjidaniya(Base):
    """Manual per-cell idle-time (ojidaniya) TEST entry — one row per
    (cell, date, category): To'xtaganda (cell stopped) + To'xtamaganda (cell
    kept running) minutes with a REQUIRED per-category note. Kept SEPARATE from
    and additive to the sheets-import ``downtime_data`` table; a TEST input
    toward per-cell загрузка, never in the production pipeline. The shift is a
    property of the cell (its supervisor's shift), so it is derived on read, not
    stored. Cat H has no To'xtamaganda value (its real 2nd source column is a
    people-count). ``entered_by_profile`` = "role:id" of the last writer."""
    __tablename__ = "cell_ojidaniya"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    cell_id            = Column(Integer, ForeignKey("cells.id", ondelete="CASCADE"), nullable=False, index=True)
    date               = Column(String(10), nullable=False, index=True)  # ISO "YYYY-MM-DD"
    category           = Column(String, nullable=False)                  # "Cat A" … "Cat I"
    stopped            = Column(Numeric(10, 4), default=0.0)             # To'xtaganda minutes
    not_stopped        = Column(Numeric(10, 4), default=0.0)             # To'xtamaganda minutes (0 for Cat H)
    note               = Column(Text, nullable=False)                    # REQUIRED per-category reason
    entered_by_profile = Column(String, nullable=True)                   # "role:id" of the last writer
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("cell_id", "date", "category", name="uq_cellojid_cell_date_cat"),)


class CellOjidaniyaInterval(Base):
    """One ojidaniya EVENT on a cell: a start -> end wall-clock range, its
    category, whether the cell STOPPED working for it, and a required reason.
    Several per (cell, date, category) — a cell may wait on the same cause more
    than once in a day, and each stint is its own event with its own reason.

    Supersedes the minutes-only :class:`CellOjidaniya` (kept read-only for rows
    filed before 2026-08-20). Recording only a duration made overlapping causes
    unrepresentable, so two categories waiting on the same stretch were added
    together and the day's downtime was over-reported. With endpoints on record
    the total is the UNION of the ranges — see ``services/idle_intervals.py``,
    which is THE definition and the only place that arithmetic lives.

    ``stopped`` is a property of THIS event (did the cell stop working for it),
    not a second measure: only stopped ranges enter the union, a not-stopped one
    is kept for its reason alone. Cat H is always stopped — it never had a
    not-stopped half.

    Times are wall clock "HH:MM" as picked. An ``end`` at or before ``start``
    crossed midnight and is carried into the next day on read, so shift 2
    (17:00 -> 09:00) needs no special case; ``end == start`` is rejected at the
    API rather than becoming a silent 24-hour stop. The shift is a property of
    the cell (its supervisor's), so it is derived on read, never stored.

    ``status``: every entry is written ``approved`` — it counts the moment it
    is saved (the one-day request regime of 2026-08-21 was removed on
    2026-08-22; ``startup.approve_pending_idle_requests`` flipped what it left
    ``pending``). Only ``approved`` rows are ever fed to
    ``services/idle_intervals.summarize``, the per-cell загрузка or
    ``services/idle_source``. A ``rejected`` row from that day is KEPT, with
    the reason on it: deleting a refusal would read to the leader exactly like
    an entry they never filed.

    ``entered_by_profile`` is the AUTHOR and stops being rewritten by whoever
    touched the row last; ``decided_by_profile`` names whoever refused a
    leftover ``rejected`` row. A leader never edits or deletes their own entry
    — the unit's brigadir, an admin or a grantee does — so the brigadir is
    TOLD of each leader entry rather than asked about it."""
    __tablename__ = "cell_ojidaniya_intervals"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    cell_id            = Column(Integer, ForeignKey("cells.id", ondelete="CASCADE"), nullable=False, index=True)
    date               = Column(String(10), nullable=False, index=True)  # ISO "YYYY-MM-DD"
    category           = Column(String, nullable=False)                  # "Cat A" … "Cat I"
    start              = Column(String(5), nullable=False)               # "HH:MM"
    end                = Column(String(5), nullable=False)               # "HH:MM" (<= start ⇒ next day)
    stopped            = Column(Boolean, nullable=False, default=True)   # did the cell stop for this one
    note               = Column(Text, nullable=False)                    # REQUIRED reason
    entered_by_profile = Column(String, nullable=True)                   # "role:id" of the REQUESTER
    # pending | approved | rejected — only "approved" is an ojidaniya.
    status             = Column(String, nullable=False, server_default="approved", default="approved")
    decided_by_profile = Column(String, nullable=True)                   # "role:id" of the confirmer
    decided_at         = Column(DateTime(timezone=True), nullable=True)
    decision_note      = Column(Text, nullable=True)                     # rejection reason; cleared on resend
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # No unique key: several ranges per (cell, date, category) is the point.
    # The status index carries the day with it — every read of this table is
    # "this cell-day, approved" or "this unit-day, still pending".
    __table_args__ = (
        Index("ix_cellojint_cell_date", "cell_id", "date"),
        Index("ix_cellojint_date_status", "date", "status"),
    )


class CellPerenaladka(Base):
    """Manual per-cell CHANGEOVER (перenaладка) minutes — the second tab of the
    same TEST page as :class:`CellOjidaniya`. ONE row per (cell, date): how many
    minutes that cell spent changing over that day, with an OPTIONAL note. No
    categories, no stopped/not-stopped split.

    Distinct from :class:`SetupTime`, which is a hand-maintained REFERENCE of the
    *average* changeover time per cell with no date — this table is the daily
    actual. Like ``cell_ojidaniya`` it is isolated TEST data: nothing else reads
    it, and it is neither additive to nor a replacement for the sheets import.

    Blank means "not entered" — a 0 is never stored (clearing deletes the row),
    so a row's existence always means a real reported value. The shift is a
    property of the cell (its supervisor's shift), so it is derived on read.
    ``entered_by_profile`` = "role:id" of the last writer."""
    __tablename__ = "cell_perenaladka"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    cell_id            = Column(Integer, ForeignKey("cells.id", ondelete="CASCADE"), nullable=False, index=True)
    date               = Column(String(10), nullable=False, index=True)  # ISO "YYYY-MM-DD"
    minutes            = Column(Numeric(10, 4), default=0.0)             # changeover minutes (> 0)
    note               = Column(Text, nullable=True)                     # OPTIONAL reason
    entered_by_profile = Column(String, nullable=True)                   # "role:id" of the last writer
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("cell_id", "date", name="uq_cellperen_cell_date"),)


class CellAttendance(Base):
    """Per-CELL attendance ingested from the «Отчёт по посещениям сотрудников»
    export — one row per (worker, cell, day). This is a TEST-MODE, fully isolated
    table: it feeds the future per-cell zagruzka (load) calculation and does NOT
    touch the existing per-manager `attendance` flow.

    The source sheet tags every worker with «Код подразделения» = the cell's
    `verifix_code`, and can span multiple days (each day is its own column whose
    cell holds either a clock string "07:55 - 17:02 (8.4)" or a status marker
    like "X" / "О"). We fan those out to one row per day. `cell_id` resolves the
    code to a `cells` row when known, but a row is kept even if the code has no
    matching cell (raw `verifix_code` is always stored)."""
    __tablename__ = "cell_attendance"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    date         = Column(Date, nullable=False, index=True)     # the specific day
    verifix_code = Column(String, nullable=True, index=True)    # raw «Код подразделения»
    cell_id      = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)
    worker_name  = Column(String)
    job_title    = Column(String)                               # Должность
    schedule     = Column(String)                               # График работы
    day_raw      = Column(String)                               # raw day-cell text
    clock_in     = Column(String, nullable=True)
    clock_out    = Column(String, nullable=True)
    hours_worked = Column(Numeric(10, 4), nullable=True)        # parsed from "(h.hh)"
    early_arrival_min = Column(Numeric(10, 2), nullable=True)
    effective_hours   = Column(Numeric(10, 4), nullable=True)
    status       = Column(String, nullable=True)                # 'worked' | marker (X/О/…)
    # Provenance — the period date is authoritative; the filename only carries the
    # export timestamp, kept for audit.
    source_filename = Column(String, nullable=True)
    export_ts       = Column(DateTime(timezone=True), nullable=True)
    uploaded_at     = Column(DateTime(timezone=True), server_default=func.now())

    cell = relationship("Cell")


class AttendanceBatch(Base):
    """One DAY of «Отчёт по посещениям сотрудников» data, staged for review.

    The single-file attendance flow is deliberately two-phase: the admin uploads,
    ADJUSTS (ticks cells in/out, drags cells between supervisors, edits worker
    rows), and only then presses Save — which is the moment anything reaches the
    `attendance` table and the supervisors get their Telegram notification.
    Nothing here is visible to a supervisor before that.

    One batch per DATE (unique), but a date is fed by MANY files: the export is
    taken per «Орг. единица» group, so a day arrives as several workbooks each
    covering different cells. An upload therefore MERGES into the day's batch —
    it never replaces it. Cells a file doesn't mention are left completely alone,
    with their routing, ticks and row edits intact. `AttendanceUploadFile` records
    each contributing file so one can be pulled back out on its own.

    After Save the batch is KEPT: it stays the editable source of truth for that
    day, which is what lets an unticked cell be re-ticked later — its worker rows
    are still here, so the attendance is simply re-projected, never re-uploaded.
    """
    __tablename__ = "attendance_batches"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    date            = Column(Date, nullable=False, unique=True, index=True)
    status          = Column(String, nullable=False, default="draft")  # draft | saved
    # First file's name — kept for continuity; the authoritative per-file list
    # lives in `uploads`.
    source_filename = Column(String, nullable=True)
    export_ts       = Column(DateTime(timezone=True), nullable=True)
    uploaded_by     = Column(BigInteger, nullable=True)   # telegram id, audit
    uploaded_by_name = Column(String, nullable=True)
    uploaded_at     = Column(DateTime(timezone=True), server_default=func.now())
    saved_at        = Column(DateTime(timezone=True), nullable=True)
    saved_by_name   = Column(String, nullable=True)

    cells   = relationship("AttendanceBatchCell", back_populates="batch",
                           cascade="all, delete-orphan")
    rows    = relationship("AttendanceBatchRow", back_populates="batch",
                           cascade="all, delete-orphan")
    uploads = relationship("AttendanceUploadFile", back_populates="batch",
                           cascade="all, delete-orphan")


class AttendanceUploadFile(Base):
    """One workbook contributed to a day. Cells and rows point back at the file
    that last supplied them, which is what makes «remove this upload» able to
    take out exactly its cells and leave every other file's alone."""
    __tablename__ = "attendance_upload_files"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    batch_id      = Column(Integer, ForeignKey("attendance_batches.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    filename      = Column(String, nullable=True)
    export_ts     = Column(DateTime(timezone=True), nullable=True)
    uploaded_by   = Column(BigInteger, nullable=True)
    uploaded_by_name = Column(String, nullable=True)
    uploaded_at   = Column(DateTime(timezone=True), server_default=func.now())
    cells_added   = Column(Integer, nullable=False, default=0)
    cells_replaced = Column(Integer, nullable=False, default=0)
    rows_added    = Column(Integer, nullable=False, default=0)

    batch = relationship("AttendanceBatch", back_populates="uploads")


class AttendanceBatchCell(Base):
    """Per-day routing decision for ONE «Код подразделения» in a batch.

    `manager_id` is the supervisor this cell's people count for ON THIS DAY —
    seeded from the cell registry and changed by dragging the row into another
    supervisor's section. `included` is the row's checkbox. Both start from the
    registry (`Cell.manager_id` / `Cell.att_included`). A MOVE overrides the
    registry for this date only (making it permanent writes back to `cells`); a
    TICK always writes back, so the next day starts from the last decision.
    """
    __tablename__ = "attendance_batch_cells"
    __table_args__ = (UniqueConstraint("batch_id", "verifix_code", name="uq_batch_cell_code"),)

    id           = Column(Integer, primary_key=True, autoincrement=True)
    batch_id     = Column(Integer, ForeignKey("attendance_batches.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    verifix_code = Column(String, nullable=False, index=True)
    cell_id      = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)
    manager_id   = Column(Integer, ForeignKey("managers.id"), nullable=True, index=True)
    included     = Column(Boolean, nullable=False, default=False)
    # Label to fall back on when the cell record carries no workshop name —
    # taken from the file's «Орг. единица» header line.
    source_name  = Column(String, nullable=True)
    # The file that last supplied this cell (NULL once that file is removed but
    # hand-added rows keep the cell alive). Drives per-upload undo.
    upload_id    = Column(Integer, ForeignKey("attendance_upload_files.id", ondelete="SET NULL"),
                          nullable=True, index=True)
    # Has this cell changed since it was last projected into `attendance`?
    # Save only touches supervisors that own (or just lost) a pending cell, so a
    # second upload can't rewrite a supervisor whose data did not change — and
    # only those supervisors get notified.
    pending          = Column(Boolean, nullable=False, server_default="true", default=True)
    # The supervisor this cell was last SAVED under. When a cell is dragged, both
    # the old and the new owner must be re-projected; this is how the old one is
    # found after `manager_id` has already moved on.
    prev_manager_id  = Column(Integer, nullable=True)

    batch = relationship("AttendanceBatch", back_populates="cells")


class AttendanceBatchRow(Base):
    """One worker's day inside a batch — same shape as an `attendance` row plus
    the cell code it belongs to. These stay editable (and addable/deletable) on
    the «Davomat» tab; every Save re-projects them into `attendance` for the
    supervisors whose cells are ticked and whose day is still open."""
    __tablename__ = "attendance_batch_rows"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    batch_id          = Column(Integer, ForeignKey("attendance_batches.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    verifix_code      = Column(String, nullable=True, index=True)
    worker_name       = Column(String)
    job_title         = Column(String)
    schedule          = Column(String)
    clock_in_out      = Column(String)
    hours_worked      = Column(Numeric(10, 4), nullable=True)
    early_arrival_min = Column(Numeric(10, 2), nullable=True)
    effective_hours   = Column(Numeric(10, 4), nullable=True)
    status            = Column(String, nullable=True)   # 'worked' | marker (X/О/…)
    # Set once an admin edits or hand-adds the row. An edited row SURVIVES a
    # re-upload of its cell — the admin's correction outranks the file's value.
    edited            = Column(Boolean, nullable=False, default=False)
    manual            = Column(Boolean, nullable=False, default=False)
    # The file that supplied this row; NULL for hand-added rows, which is what
    # keeps them alive when that upload is removed.
    upload_id         = Column(Integer, ForeignKey("attendance_upload_files.id", ondelete="SET NULL"),
                               nullable=True, index=True)
    # What a LATER file said about this worker while an admin edit was winning.
    # Without it the newer export's value would be lost silently; with it the tab
    # can flag the row and offer a one-click revert.
    file_values       = Column(JSONB, nullable=True)

    batch = relationship("AttendanceBatch", back_populates="rows")


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


class ForecastCallNotice(Base):
    """One "invite N workers tomorrow" notification sent to a supervisor for a
    specific shift date (Trudoyomkost call-tomorrow modal). Powers the resend
    guard: the modal shows the latest notice per (manager, date) and asks for
    confirmation before notifying the same brigadir twice."""
    __tablename__ = "forecast_call_notices"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    for_date   = Column(Date, nullable=False, index=True)   # the shift date the count is for
    workers    = Column(Integer, nullable=False)             # the (possibly hand-edited) number sent
    sent_by    = Column(BigInteger, nullable=False)          # actor's telegram id
    sent_at    = Column(DateTime(timezone=True), server_default=func.now())


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
      rejected  → declined while draft (bot ❌ / webapp reject); kept as a
                  visible record, never applied, cannot be posted afterwards

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
    status                  = Column(String, nullable=False, default="draft")  # draft | approved | rejected
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
    action            = Column(String, nullable=False)   # created | edited | approved | cancelled | rejected
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
    op          = Column(String, nullable=True)           # «Опер.» / фаза step, hand-pinned; wins over the фаза upload
    labor_time  = Column(Numeric(12, 4), nullable=True)   # seconds/unit; NULL → warn
    sort_order  = Column(Integer, default=0)
    active      = Column(Boolean, nullable=False, server_default="true")
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class PPWorkCenter(Base):
    """Per-brigadir work-center config.

    shtatka (W)  — establishment headcount for the work center.
    capacity (S) — planned productive minutes the roster can deliver ("Для 85%
                   труд", ≈ W × 0.85 × 480). Hand-tuned per work center; when
                   NULL the engine falls back to W × productive_min (default 408).
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


class PPWorkCenterDaily(Base):
    """Per-day manual overrides for the staffing panel of one work center.

    O. SONI (N) is normally derived — ROUND(W × Σlabor / S) — and штатка (W) is
    global config on pp_work_centers. From the Production staffing cards an admin
    may pin either for a SINGLE date; NULL means "use the computed / configured
    value". Same semantics as pp_daily.*_override, so a day can always be reset
    back to the formula and neither past days nor the master config are touched."""
    __tablename__ = "pp_work_center_daily"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    manager_id  = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date        = Column(Date, nullable=False, index=True)
    work_center = Column(String, nullable=False)
    people      = Column(Integer, nullable=True)   # N override (O. SONI)
    shtatka     = Column(Integer, nullable=True)   # W override (штатка)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("manager_id", "date", "work_center", name="uq_pp_wc_daily_key"),
    )


class PPDaySetting(Base):
    """Per-(brigadir, date) planning constants for the staffing math.

    Holds the day's efficiency: `productive_min` = productive minutes ONE person
    contributes in the shift (the «Для 85% труд» figure), which is the S per head
    behind N = ROUND(W × Σlabor / S). Set from the Production «Odamlar soni» tab;
    no row (or NULL) = fall back to the global pp_productive_min app-setting, so
    untouched days keep the platform default."""
    __tablename__ = "pp_day_settings"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    manager_id     = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date           = Column(Date, nullable=False, index=True)
    productive_min = Column(Numeric(8, 2), nullable=True)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("manager_id", "date", name="uq_pp_day_setting_key"),)


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


class PPLineDaily(Base):
    """Per-CATALOG-LINE plan/fact override — the overlay that makes two lines of
    one (SKU, work centre) independently editable.

    `pp_daily` is keyed by (brigadir, date, SAP code, work centre) because that is
    the grain the SAP «фаза» export answers at: the file aggregates by SKU and
    work centre and knows nothing about which catalog line did which step. But the
    CATALOG is finer — "one row per (brigadir, SAP code, work center, operation)",
    so 313 of the platform's 2,158 lines sit in 118 groups that share one quantity
    record. Typing a ПЛАН on one of them moved every other line in the group,
    because they are literally the same row.

    So the manual value moves DOWN a level and the SAP snapshot stays where it is.
    Nothing about pp_daily changes: no new column, no widened key, no migration,
    and no re-ingest. A line resolves its quantity in three steps, and the last
    two are exactly what the platform already answered:

        1. this line's own override (here)
        2. the group's legacy shared override (pp_daily.*_override)
        3. the SAP snapshot (pp_daily.*_qty)

    The fallback is TOTAL, which is the whole safety argument: a unit that never
    touches the feature reads byte-for-byte what it read before, and no lookup
    here can ever miss into a zero.

    `line_no` is the line's rank inside its (qty_key, work centre) group, ordered
    by (sort_order, id) — see pp_calc.line_numbers. A row id cannot be used: the
    catalog is DELETED and re-created on every import, so ids do not survive. The
    rank is computed over ALL of the group's lines, active or not, so deactivating
    one never re-points another's stored value. Deleting a line from the sheet
    DOES shift the ranks below it, exactly as it already re-points a code-less
    line's quantities when it is renamed (see pp_calc.daily_key)."""
    __tablename__ = "pp_line_daily"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    manager_id      = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    date            = Column(Date, nullable=False, index=True)
    qty_key         = Column(String, nullable=False)   # pp_calc.daily_key — SAP code, or ~name
    work_center     = Column(String, nullable=False)
    line_no         = Column(Integer, nullable=False)  # rank within the (qty_key, wc) group
    plan_override   = Column(Numeric(14, 4), nullable=True)
    actual_override = Column(Numeric(14, 4), nullable=True)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Every component is NOT NULL, so a plain UniqueConstraint is enough — the
    # COALESCE-expression index the leader per-cell key needs (Postgres treats
    # NULLs as DISTINCT inside a unique key) has nothing to guard against here.
    __table_args__ = (
        UniqueConstraint("manager_id", "date", "qty_key", "work_center", "line_no",
                         name="uq_pp_line_daily_key"),
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
    manager_id NULL = the GLOBAL plant-wide file for that date (the SAP export
    is one file for everyone; brigadir views filter it at read time). Non-NULL
    rows are legacy per-brigadir slices from before global storage."""
    __tablename__ = "pp_uploads"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    manager_id  = Column(Integer, ForeignKey("managers.id"), nullable=True, index=True)
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


class PPManagerSetting(Base):
    """Per-brigadir production-planning switches. Today exactly one:

    ``auto_fill`` — does an UNATTENDED SAP upload reach this unit? The фаза /
    заголовок export is one plant-wide file and used to fan out to every
    configured brigadir, which in mode 'both' deletes the date's pp_daily rows
    and clears their overrides — so a unit whose ПЛАН/ФАКТ is kept by hand had
    its figures wiped by somebody else's upload. Switched off, the unit is
    skipped by the fan-out and by the catalog-import backfill, and its numbers
    are entered on the Production page.

    Absent row = ON, so nothing moves until an admin switches a unit off. This
    is a DEFAULT, not a lock: an upload may still name the unit explicitly
    (``manager_ids``), which is how a manual unit is filled deliberately."""
    __tablename__ = "pp_manager_settings"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False, unique=True, index=True)
    auto_fill  = Column(Boolean, nullable=False, server_default="true", default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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


class QualityComplaint(Base):
    """One non-conformance / complaint from the quality register (tab «для
    свода» of the QA workbook). Wipe-and-reload on every admin refresh, like
    the leader checklists — the sheet stays the source of truth.

    The sheet's Russian labels are normalized to stable slugs at sync time
    (source/ctype/category/status) so the frontend can translate them into all
    four platform languages; a value the map doesn't know is stored verbatim
    and falls back to transliteration in the UI.
    """
    __tablename__ = "quality_complaints"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    date        = Column(String(10), index=True)      # ISO "YYYY-MM-DD"
    source      = Column(String, index=True)          # production | guest | store
    place       = Column(String)                      # store / workshop the complaint came from
    product     = Column(String)                      # Наименование изделия
    ctype       = Column(String, index=True)          # risk | foreign | storage | sanitation | …
    category    = Column(String, index=True)          # hair | metal | plastic | … (foreign-object kind)
    description = Column(Text)                        # Описание жалобы
    fault       = Column(Boolean)                     # Есть ли вина цеха/магазина
    fault_code  = Column(String)                      # Номер виновного цеха/магазина
    cell_name   = Column(String)                      # code → name, from the «код производ.» tab
    brigadir    = Column(String, index=True)          # Отв. бригадир / ТМ
    manager     = Column(String, index=True)          # Отв. руководитель
    returned    = Column(Boolean)                     # Поступил возврат?
    status      = Column(String, index=True)          # done | open | not_required | repeat | waiting
    comment     = Column(Text)                        # комментарии
    action      = Column(Text)                        # Корректирующие действия
    ref_no      = Column(String)                      # № не соответствия


class QualitySyncMeta(Base):
    """Singleton row (id=1) tracking the last quality-register sheet sync."""
    __tablename__ = "quality_sync_meta"

    id          = Column(Integer, primary_key=True)
    last_synced = Column(DateTime(timezone=True), nullable=True)
    ok          = Column(Boolean, default=True)
    message     = Column(Text, nullable=True)
    row_count   = Column(Integer, default=0)


class LeaderSyncMeta(Base):
    """Singleton row (id=1) tracking the last leaders-checklist sheet sync — the
    "last updated" time shown on the Leaders page header."""
    __tablename__ = "leader_sync_meta"

    id          = Column(Integer, primary_key=True)
    last_synced = Column(DateTime(timezone=True), nullable=True)
    ok          = Column(Boolean, default=True)
    message     = Column(Text, nullable=True)
    row_count   = Column(Integer, default=0)


class LeaderTaskDef(Base):
    """Global catalog of the daily leader-checklist tasks, collected in-bot.
    id = the historic sheet question number (1..13) so bot submissions and
    Google-Form rows share task ids on the /leaders dashboard. Seeded lazily
    from the dashboard's task list (services/leader_tasks.py); names are
    editable via the admin column modal, per-language."""
    __tablename__ = "leader_task_defs"

    id           = Column(Integer, primary_key=True)  # question number, 1-based
    name_uz      = Column(String, nullable=False)
    name_uz_cyrl = Column(String, nullable=False)
    name_ru      = Column(String, nullable=False)
    name_en      = Column(String, nullable=False)
    note_uz      = Column(String, nullable=True)
    note_uz_cyrl = Column(String, nullable=True)
    note_ru      = Column(String, nullable=True)
    note_en      = Column(String, nullable=True)
    # "What makes this task truly done" — read by the AI proof reviewer, and
    # since 2026-08-15 ALSO shown to the leader as the task's description on the
    # /leaders «Vazifalar» tab (the rule a leader is judged by is a rule they
    # get to read). Single free text in any language: it started as prompt
    # material, so it is not translated. Blank ⇒ the task is not reviewable, and
    # its photos are left unjudged rather than measured against nothing.
    criteria     = Column(Text, nullable=True)
    # When a proof photo for THIS task may have been taken, "HH:MM" wall clock.
    # Either end NULL = fall back to the shift default (services/leader_ai.py
    # SHIFT_WINDOW: shift 1 07:00–20:00, shift 2 17:00–09:00), resolved per
    # field, so a task can narrow only its opening or only its deadline.
    win_from     = Column(String(5), nullable=True)
    win_to       = Column(String(5), nullable=True)
    # By when THIS task should be submitted, "HH:MM" wall clock in the shift's
    # day — INFORMATIONAL: shown to the leader on the /leaders «Vazifalar» tab,
    # never judged (a bot entry is still only measured against the day's filing
    # window, routers/leaders.WINDOW). NULL = no task-specific deadline; the
    # chain falls through supervisor → global and, blank everywhere, the tab
    # shows the day's filing deadline marked as such. Distinct from `win_to`:
    # that is when a photo may have been TAKEN, this is when the answer is DUE.
    deadline     = Column(String(5), nullable=True)
    # Is the DATE question asked for this task AT ALL? False = the proof does
    # not have to prove WHEN it was taken. The reviewer still transcribes any
    # clock it can see (so the flag can be flipped back and every stored verdict
    # re-decided for free), but `leader_ai.date_flags` returns nothing, so
    # `no_date`/`date_mismatch` can never be raised and — under the automatic
    # regime — can never deduct. For tasks whose proof is a screen that carries
    # no clock at all (an in-app checklist, a printed system report): the only
    # other options there are rejecting every honest filing, or leaving a
    # permanent flag nobody may act on. NULL at the two override levels below =
    # inherit; True everywhere is what the platform did before this existed.
    date_check   = Column(Boolean, nullable=False, default=True)
    # And if it IS asked — must the CLOCK be proven too, or is the DAY enough?
    # The third state of one three-way rule (`date_check` False dominates both):
    #   date_check T + time_check T  the old, strict answer: a SYSTEM clock must
    #                                be readable and inside `win_from..win_to`;
    #   date_check T + time_check F  DATE ONLY — the day must be the report's
    #                                day, the hour is never judged and the window
    #                                is not a rule; a date printed ON SCREEN (an
    #                                in-app date filter, a dated register row)
    #                                counts, and a proof with no readable date at
    #                                all is NOT flagged;
    #   date_check F                 the question is not asked at all.
    # Why the middle exists (user, 2026-08-17): most proofs here are screenshots
    # of THIS dashboard, where the day is plainly on screen but no OS clock is —
    # so strict mode answered `no_date` on honest filings, and the only escape
    # was exempting the day as well, i.e. losing the one fact the screen does
    # prove. NULL at the two override levels below = inherit; True everywhere is
    # what the platform did before this existed.
    time_check   = Column(Boolean, nullable=False, default=True)
    # How many days AFTER the report day the proof's date may also be. 0 — only
    # the report day itself, which is what every task did before this existed
    # and what every task still resolves to unless an admin says otherwise.
    #
    # It exists because some proofs are dated by what they are ABOUT, not by
    # when they were made: a work schedule filed on the 18th is the schedule
    # FOR the 19th, so its only visible date is tomorrow's (T11, user
    # 2026-08-19). Under the plain rule that is `date_mismatch` on every honest
    # filing, and the only escapes were exempting the date entirely or giving
    # the task a fake overnight window — one throws the check away, the other
    # hides it in a field that means something else.
    #
    # Deliberately NOT expressible in `criteria`: `leader_ai._prompt` never
    # tells the model which day the report is for, so a written "+1 kun" rule
    # is a rule nothing can evaluate. The day question is the backend's, and
    # this is where its answer widens. NULL at the two override levels below =
    # inherit; 0 here is the chain's floor.
    date_plus    = Column(Integer, nullable=False, default=0)
    # HOW the proof is collected. "screenshot" — the leader sends images to the
    # bot chat, which is every task's behaviour and the platform's only mode
    # before 2026-08-19. "camera" — the bot offers a mini-app button instead and
    # the photo is TAKEN in our own camera page, which stamps it with the
    # SERVER's clock: the leaders this was built for were editing the timestamp
    # a third-party camera app wrote, and a stamp the phone can author proves
    # nothing. A camera task therefore has no upload path at all — that is the
    # whole point, so it must never become "camera, but you may also send a
    # file". Same global → supervisor → leader chain as `min_media`; NULL at the
    # two override levels below = inherit, and "screenshot" at this level is the
    # floor, so nothing changes anywhere until an admin picks camera.
    proof_kind   = Column(String(12), nullable=False, default="screenshot")
    # Virtual-default weight: a supervisor with no leader_task_settings row for
    # this task uses this (the seeded weights sum to 100, so untouched
    # supervisors never trip the ≠100 warning).
    default_weight = Column(Integer, nullable=False, default=0)


class LeaderTaskSetting(Base):
    """Per-supervisor override of one task's config. Absent row = the virtual
    default (enabled, min_media 1, LeaderTaskDef.default_weight). The name_*
    columns rename the task for this supervisor's whole team; NULL = the
    global LeaderTaskDef name."""
    __tablename__ = "leader_task_settings"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=False, index=True)
    task_id    = Column(Integer, ForeignKey("leader_task_defs.id"), nullable=False)
    enabled    = Column(Boolean, nullable=False, default=True)
    min_media  = Column(Integer, nullable=False, default=1)
    weight     = Column(Integer, nullable=False, default=0)
    name_uz      = Column(String, nullable=True)
    name_uz_cyrl = Column(String, nullable=True)
    name_ru      = Column(String, nullable=True)
    name_en      = Column(String, nullable=True)
    # Per-supervisor "definition of done" for the AI reviewer. NULL = inherit
    # the global LeaderTaskDef.criteria.
    criteria     = Column(Text, nullable=True)
    # Per-supervisor proof-photo window. NULL = inherit the global one (and
    # through it the shift default). Each end inherits on its own.
    win_from     = Column(String(5), nullable=True)
    win_to       = Column(String(5), nullable=True)
    # Per-supervisor submission deadline (informational). NULL = inherit global.
    deadline     = Column(String(5), nullable=True)
    # Per-supervisor "is the date checked at all". NULL = inherit the global
    # answer; False exempts this unit's filings from the date question.
    date_check   = Column(Boolean, nullable=True)
    # Per-supervisor "must the CLOCK be proven, or is the day enough". NULL =
    # inherit; False = date-only for this unit (see LeaderTaskDef.time_check).
    time_check   = Column(Boolean, nullable=True)
    # Per-supervisor tolerance: how many days after the report day the proof's
    # date may also be. NULL = inherit the global answer (see
    # LeaderTaskDef.date_plus).
    date_plus    = Column(Integer, nullable=True)
    # Per-supervisor proof collection mode. NULL = inherit the global one. This
    # is the level the camera pilot is switched on at (see
    # LeaderTaskDef.proof_kind).
    proof_kind   = Column(String(12), nullable=True)

    __table_args__ = (UniqueConstraint("manager_id", "task_id", name="uq_ltask_setting"),)


class LeaderTaskLeaderSetting(Base):
    """Per-LEADER override of one task's config — the third level of the
    global → supervisor → leader chain. Every field is nullable: NULL means
    "inherit from the supervisor's effective value"; the whole row absent
    means full inherit. Supervisor/column edits never touch these rows."""
    __tablename__ = "leader_task_leader_settings"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    leader_id = Column(Integer, ForeignKey("role_profiles.id"), nullable=False, index=True)
    task_id   = Column(Integer, ForeignKey("leader_task_defs.id"), nullable=False)
    enabled   = Column(Boolean, nullable=True)
    min_media = Column(Integer, nullable=True)
    weight    = Column(Integer, nullable=True)
    name_uz      = Column(String, nullable=True)
    name_uz_cyrl = Column(String, nullable=True)
    name_ru      = Column(String, nullable=True)
    name_en      = Column(String, nullable=True)
    # Per-leader "definition of done" for the AI reviewer. NULL = inherit the
    # supervisor's effective criteria.
    criteria     = Column(Text, nullable=True)
    # Per-leader proof-photo window. NULL = inherit the supervisor's effective
    # one, per field.
    win_from     = Column(String(5), nullable=True)
    win_to       = Column(String(5), nullable=True)
    # Per-leader submission deadline (informational). NULL = inherit.
    deadline     = Column(String(5), nullable=True)
    # Per-leader "is the date checked at all". NULL = inherit the supervisor's
    # effective answer.
    date_check   = Column(Boolean, nullable=True)
    # Per-leader "must the CLOCK be proven, or is the day enough". NULL =
    # inherit (see LeaderTaskDef.time_check for the three-way rule).
    time_check   = Column(Boolean, nullable=True)
    # Per-leader tolerance in days after the report day. NULL = inherit the
    # supervisor's effective answer (see LeaderTaskDef.date_plus).
    date_plus    = Column(Integer, nullable=True)
    # Per-leader proof collection mode. NULL = inherit the supervisor's
    # effective one (see LeaderTaskDef.proof_kind).
    proof_kind   = Column(String(12), nullable=True)

    __table_args__ = (UniqueConstraint("leader_id", "task_id", name="uq_ltask_leader_setting"),)


class LeaderTaskExample(Base):
    """An admin-uploaded EXAMPLE proof photo for one checklist task — "a correct
    proof looks like this". Global per task like `note_*` (no supervisor/leader
    chain to walk), optional, capped at a few per task. Read by the AI proof
    reviewer as reference images beside the written criteria, and shown to the
    leader on the /leaders «Vazifalar» tab (page-gated, no row scope — it is
    reference material, not evidence). Bytes live in the DB for the same reason ProfilePhoto's
    do — a row survives deploys, restores and the dbdump tab — and are
    re-encoded to a ≤1280px JPEG before landing here, the exact size the Gemini
    request would shrink them to anyway."""
    __tablename__ = "leader_task_examples"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    task_id    = Column(Integer, ForeignKey("leader_task_defs.id"), nullable=False, index=True)
    mime       = Column(String, nullable=False, default="image/jpeg")
    data       = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeaderTaskDay(Base):
    """One leader's in-bot checklist day. Created lazily on the first saved
    task; closed_at set by «KUNNI YOPISH», or auto-set when a bygone open day
    is finalized on the leader's next /tasks (its unanswered tasks recorded as
    not-done, reason "-"). Once closed, entries are immutable and the day
    surfaces on the /leaders dashboard — where a Google-Sheet row for the same
    (leader, date) still wins over this one. The `date` follows the leader's
    shift boundary (services/leader_tasks.effective_date): shift 1 is the plain
    calendar day, shift 2 turns at 17:00 — the hour that shift starts, and the
    hour its 17:00 → 09:00 filing window opens.

    2026-09-02: a day may also belong to ONE CELL. On a unit switched to
    per-cell filing (`LeaderUnitSetting.cell_from`), a leader files a COMPLETE
    separate checklist for each cell they own — own day row, own score, own
    report page, own DM — so `cell_id` is what tells those days apart. NULL =
    filed before the unit's floor, or on a unit that was never switched: those
    rows are exactly what they always were, which is why the switch can be
    cleared and why history never moves. See `services/leader_cells.py`."""
    __tablename__ = "leader_task_days"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    leader_id  = Column(Integer, ForeignKey("role_profiles.id"), nullable=False, index=True)
    manager_id = Column(Integer, nullable=False, index=True)  # supervisor unit at save time
    date       = Column(String(10), nullable=False, index=True)  # ISO "YYYY-MM-DD"
    # The cell this checklist is FOR — NULL on every pre-switch day. Read
    # through `leader_cells.expected_days()`; never derived from the leader's
    # current cell list, because a cell reassigned tomorrow must not rewrite
    # which cell yesterday's checklist was filed against.
    cell_id    = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)
    closed_at  = Column(DateTime(timezone=True), nullable=True)
    completion = Column(Numeric(6, 2), nullable=True)  # weighted %, stamped at close
    # Task ids an ADMIN took back on this day (leader_close.reopen_task). Kept
    # on the DAY and not on the entry because the admin's «Tozalash» DELETES
    # the entry, and the grace has to outlive it: without that, the per-task
    # deadline sweep re-closes an emptied task as "not done" within five
    # minutes and the reopen silently undoes itself. Read through
    # `leader_close.reopened_tasks()`; it moves a task onto the DAY's filing
    # deadline, never off a deadline altogether.
    reopened   = Column(JSONB, nullable=True)

    # ONE checklist per (leader, date, cell) — an EXPRESSION index, not a plain
    # UniqueConstraint, and that is load-bearing. Postgres treats NULLs as
    # DISTINCT inside a unique key, so `UNIQUE(leader_id, date, cell_id)` would
    # cheerfully accept two cell-less days for one leader and hand the bot an
    # arbitrary one of them — the exact breakage this constraint exists to
    # prevent, reintroduced by widening it naively. `COALESCE(cell_id, 0)`
    # folds every pre-switch row onto one value, so the guarantee for a
    # cell-less day is byte-for-byte the old one and no data migration is
    # needed. `startup.add_leader_task_cell` swaps the constraint for this
    # index on an existing box; `create_all` builds it directly on a new one.
    __table_args__ = (
        Index("uq_ltask_day", "leader_id", "date",
              func.coalesce(cell_id, 0), unique=True),
    )


class LeaderTaskEntry(Base):
    """One task's answer within a LeaderTaskDay: done (Ha) with proof media, or
    not done (Yo'q) with a reason. Deleted wholesale when the leader resets the
    task before closing the day (channel posts stay as the audit trail)."""
    __tablename__ = "leader_task_entries"

    id       = Column(Integer, primary_key=True, autoincrement=True)
    day_id   = Column(Integer, ForeignKey("leader_task_days.id"), nullable=False, index=True)
    task_id  = Column(Integer, nullable=False)
    done     = Column(Boolean, nullable=False)
    reason   = Column(Text, nullable=True)
    saved_at = Column(DateTime(timezone=True), server_default=func.now())
    # PER-TASK submission only (see LeaderUnitSetting.per_task_close): when the
    # leader closed THIS task. NULL = still a draft — the answer is saved, the
    # photos are on the roll, and both can still be changed. Set = locked
    # forever and handed to the AI on its own.
    #
    # Read through `leader_close.locked()`, never directly: on a unit that does
    # not use per-task submission this column stays NULL and the DAY's own
    # `closed_at` is what makes an entry immutable, exactly as before.
    closed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("day_id", "task_id", name="uq_ltask_entry"),)


class LeaderTaskCapture(Base):
    """In-flight /tasks capture state — the leader is mid-answer, sending proof
    photos or a failure reason. DB-backed, NOT in-memory: Passenger runs several
    worker processes and consecutive webhook updates land on different workers,
    so process memory loses the flow between the button tap and the next message
    (the same reason broadcast_drafts exists). One row per Telegram account;
    stale rows expire via updated_at."""
    __tablename__ = "leader_task_captures"

    telegram_id = Column(BigInteger, primary_key=True)
    stage       = Column(String, nullable=False)  # photos | reason | confirm_reason
    leader_id   = Column(Integer, nullable=False)  # role_profiles.id
    task_id     = Column(Integer, nullable=False)
    # WHICH CELL's checklist this capture belongs to on a per-cell unit. NULL =
    # a cell-less day, i.e. every capture before the switch. It must be stored
    # rather than re-derived when the photos land: the leader can leave the
    # capture open, walk to another cell's menu and come back, and a capture
    # that re-resolved the cell at save time would file the shots against
    # whichever cell was touched last.
    cell_id     = Column(Integer, nullable=True)
    chat_id     = Column(BigInteger, nullable=False)
    message_id  = Column(BigInteger, nullable=True)   # counter / prompt message
    min_media   = Column(Integer, nullable=False, default=1)
    media       = Column(JSONB, default=list)         # [[channel file_id, channel msg id], …]
    reason      = Column(Text, nullable=True)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LeaderTaskMedia(Base):
    """A proof photo re-uploaded (as bytes) to the archive channel. file_id /
    message_id are the CHANNEL copy's — the private-chat original is never
    stored, per spec."""
    __tablename__ = "leader_task_media"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    entry_id   = Column(Integer, ForeignKey("leader_task_entries.id"), nullable=False, index=True)
    file_id    = Column(String, nullable=False)
    message_id = Column(BigInteger, nullable=True)
    pos        = Column(Integer, nullable=False, default=0)


class LeaderUnitSetting(Base):
    """Per-supervisor settings for the in-bot checklist that belong to the UNIT
    rather than to any one task.

    `per_task_close` is the first: with it on, that supervisor's leaders never
    close a DAY — they close each task on its own, which locks it irreversibly
    and sends only that task's proofs to the AI. The day then closes itself when
    the last enabled task is closed.

    `bot_from` is the second: the day this unit's BOT filings start COUNTING.
    Before it the unit is REHEARSING — its leaders fill the checklist in the bot
    to learn it, while the register, the score and the day report all keep
    reading the Google-Form sheet row for the same day. It exists because a unit
    is switched into camera capture on the day somebody has time to teach it,
    and that day's fumbling must not become the day's record. NULL = no
    rehearsal window, which is every unit until an admin opens one.

    Deliberately NOT on the global → supervisor → leader task chain: neither is
    a property of a task, and putting them there would let one be set at a level
    that means "everybody" — which is exactly how the camera pilot reached every
    leader on the platform twice (2026-08-19). An absent row means off / no
    rehearsal, so a unit is only ever in either state because somebody said so.
    """
    __tablename__ = "leader_unit_settings"

    manager_id     = Column(Integer, ForeignKey("managers.id"), primary_key=True)
    per_task_close = Column(Boolean, nullable=False, default=False)
    # "YYYY-MM-DD" — read through `leader_bot.bot_from_floors()`, which is
    # where the merge rule lives; a floor earlier than the camera pilot's own
    # MERGE_FROM cannot resurrect bot days that predate it.
    bot_from       = Column(String(10), nullable=True)
    # `cell_from` is the third, and the same shape for the same reason: the day
    # this unit's leaders start filing ONE CHECKLIST PER CELL instead of one per
    # day. NULL = not switched, which is every unit until an admin turns one on
    # — the operator's standing instruction (2026-09-02) is that nobody is
    # switched by default and units are enrolled by hand.
    #
    # A DATE and not a boolean, because the switch must not reach backwards:
    # days before it were filed as one-per-leader and are read exactly as they
    # always were, so turning a unit on cannot move a score anybody has already
    # been told. Clearing it is the rollback and needs no migration — new days
    # go back to being cell-less from the next effective date, and the per-cell
    # days already filed stay readable and scored.
    #
    # Compared against `leader_tasks.effective_date(shift)`, never against the
    # calendar day: shift 2's night belongs to the date its 17:00 boundary
    # opened, so a floor of "today" set at 15:00 makes tonight the first
    # per-cell night. `services/leader_cells.py` is THE reader.
    cell_from      = Column(String(10), nullable=True)


class IdleSourceSetting(Base):
    """Where a supervisor unit's ojidaniya minutes come from — per UNIT, dated.

    ``cells`` makes the figure the headcount-weighted mean of the unit's cells'
    interval unions (``services/idle_source.py`` is THE definition) FROM
    ``from_date`` onward; ``sheet`` (what an absent row means) is the «Смена
    отчёт» row the brigadir types at end of shift.

    **From ``idle_source.CELLS_FROM`` (2026-08-27) this table governs the days
    BEFORE that floor only**: every unit reads its cells from the floor on, so
    a row can still start one EARLIER (the pilot's 2026-08-21) and still keep a
    unit's earlier days on the sheet, but neither value reaches a day the floor
    covers. The date is what keeps history honest: an admin flipping the toggle
    moves the rule for the days it can reach and never rewrites the days behind,
    and where the cells answer a day the sheet is not read even though a row
    exists — two sources answering one day is how a figure stops being
    explainable.

    Per SUPERVISOR, like `LeaderUnitSetting`, and for the same reason it is not
    on a global → unit chain: a level that means "everybody" is one mis-tap away
    from switching every unit on the platform mid-shift — which is exactly why
    the fleet-wide rule is a constant in code and not a row anybody can save. A
    `cells` row without a from-date is refused on write and read as NOT
    switched.
    """
    __tablename__ = "idle_source_settings"

    manager_id = Column(Integer, ForeignKey("managers.id"), primary_key=True)
    source     = Column(String(10), nullable=False, server_default="sheet", default="sheet")
    from_date  = Column(String(10), nullable=True)      # ISO "YYYY-MM-DD"
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LeaderTaskPhoto(Base):
    """One proof photo TAKEN in the mini-app camera (`proof_kind == "camera"`).

    The roll a leader builds up for one (day, task) while the day is open: slot
    0..N-1 are the required shots, anything above is an extra. A slot is
    RETAKEN, never emptied — a required proof cannot be deleted back into a gap,
    which is the one destructive move a stray tap could otherwise make. The row
    is deleted only when its slot is retaken or an extra is removed; the archive
    channel keeps every version, exactly as the bot flow's channel posts do.

    Why a table of its own rather than more `LeaderTaskMedia` rows: those hang
    off a LeaderTaskEntry, which only exists once the task is ANSWERED, and this
    roll has to survive a leader who shot two of three photos and closed the
    app. When the roll reaches `min_media` the entry is written and these rows
    are mirrored into `leader_task_media` in slot order, so every existing
    reader — dashboard rows, the media proxy, the AI reviewer, the day report —
    keeps working with no knowledge of this table.

    `captured_at` is the shot's own clock and the ONLY time anything is judged
    by: it is the server's, handed to the page at open and advanced there by a
    MONOTONIC counter, so editing the phone's clock (the abuse this whole
    feature exists to stop) moves nothing. `received_at` is when the bytes
    arrived — later than `captured_at` by minutes when the shot was taken with
    no signal and flushed from the offline queue afterwards, which is what
    `deferred` marks. `late` is the capture falling outside the task's photo
    window; it is recorded here for the UI, while the DEDUCTION comes from the
    ordinary date machinery (services/leader_ai.date_flags), which reads the
    same instant out of `LeaderAiReview.clocks`.
    """
    __tablename__ = "leader_task_photos"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    day_id      = Column(Integer, ForeignKey("leader_task_days.id"), nullable=False, index=True)
    leader_id   = Column(Integer, nullable=False, index=True)   # role_profiles.id
    task_id     = Column(Integer, nullable=False)
    slot        = Column(Integer, nullable=False, default=0)
    file_id     = Column(String, nullable=False)                # archive-channel copy
    message_id  = Column(BigInteger, nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    # Exactly the text burnt into the image, so what a reviewer reads on the
    # picture and what the register prints can never drift apart.
    stamp       = Column(String(40), nullable=True)
    late        = Column(Boolean, nullable=False, default=False)
    deferred    = Column(Boolean, nullable=False, default=False)
    # Phone clock − server clock at capture, seconds. Diagnostic only: nothing
    # is judged by it, but a fleet of phones suddenly hours off is worth seeing.
    skew_s      = Column(Integer, nullable=True)
    # The PAGE's own id for the shot, minted before the first upload attempt and
    # carried with the blob into the offline queue. It is what makes the upload
    # idempotent, and the roll only reads right because of it: when the signal
    # dies between the bytes landing here and the reply reaching the phone, the
    # page cannot tell "never arrived" from "arrived, answer lost", so it re-
    # sends — and without a key the second POST wrote a SECOND row holding the
    # same picture with the same burnt stamp. NULL on rows written before this
    # column existed and on any request that sends no key; Postgres ignores
    # NULLs in a unique index, so those behave exactly as they always did.
    client_key  = Column(String(64), nullable=True)

    __table_args__ = (
        UniqueConstraint("day_id", "task_id", "slot", name="uq_ltask_photo_slot"),
        # Per LEADER rather than per day: a shot queued across the day boundary
        # is still the same shot, while two leaders' keys are none of each
        # other's business — a collision between them must never cost anybody a
        # photo. This is the backstop for two copies of one upload racing (the
        # drain can fire from the mount effect and from `online` at the same
        # moment); the lookup in save_photo handles the ordinary replay.
        Index("uq_ltask_photo_client_key", "leader_id", "client_key", unique=True),
    )


class LeaderAiReview(Base):
    """One AI verdict on one task's proof photos, for either collection layer.

    Keyed by `ref`, a stable string built in services/leader_ai.py — the bot
    entry id, or the form's submission id + task number. It deliberately does
    NOT key on leader_checklists.id: the leaders sheet syncs by wipe-and-reload,
    so a row id changes on every Refresh and would re-review the whole history.

    A row exists from the moment the report is discovered (`status="pending"`),
    so the queue IS this table — a drain looks for pending rows rather than
    diffing two datasets. Verdicts are never recomputed once written; only
    `error` rows are retried, bounded by `attempts`.
    """
    __tablename__ = "leader_ai_reviews"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    ref        = Column(String, nullable=False, unique=True, index=True)
    source     = Column(String(8), nullable=False)          # "bot" | "sheet"
    date       = Column(String(10), nullable=False, index=True)
    task_id    = Column(Integer, nullable=False)
    leader_id  = Column(Integer, nullable=True, index=True)  # role_profiles id when resolved
    manager_id = Column(Integer, nullable=True)
    shift      = Column(Integer, nullable=True)              # decides the date window

    # pending → ok | flagged | skipped | error
    status     = Column(String(10), nullable=False, default="pending", index=True)
    # Machine-readable reasons, rendered as chips: "date_mismatch" | "no_date" |
    # "off_topic" | "not_proven" | "unreadable". Empty on a clean pass.
    flags      = Column(JSONB, nullable=False, default=list)
    # The timestamp the model actually read off the image, verbatim, so an
    # admin can judge the judge without opening the photo. DERIVED from `clocks`
    # (leader_ai.clocks_text) — kept as a column because every list, export and
    # legacy row already reads it.
    image_date = Column(String, nullable=True)
    # The same clocks in NUMBERS, one entry per proof photo:
    #   {raw, month, day, time, source?}   month/day 0 and time "" = not visible
    # This is what makes the date verdict re-derivable. The model transcribes
    # here and judges nothing; `leader_ai.date_flags` compares these against the
    # task's window, so changing a window corrects every affected verdict with
    # no AI call. A verdict written before this column existed is backfilled by
    # parsing `image_date` (see startup.add_leader_ai_clocks).
    clocks     = Column(JSONB, nullable=False, default=list)
    # The verdict prose, per language — the page renders it in the viewer's own.
    reason_uz      = Column(Text, nullable=True)
    reason_uz_cyrl = Column(Text, nullable=True)
    reason_ru      = Column(Text, nullable=True)
    reason_en      = Column(Text, nullable=True)

    photos     = Column(Integer, nullable=False, default=0)  # images actually sent
    model      = Column(String, nullable=True)
    attempts   = Column(Integer, nullable=False, default=0)
    error      = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # ── the human decision ───────────────────────────────────────────────────
    # A flag with no terminal state is a flag the admin re-reads forever: the
    # triage queue has no bottom, and "12 suspect" means "12 ever", not "12 left
    # to look at". These four columns are what give a verdict an end.
    #   NULL       → still in the queue
    #   approved   → a human looked and the AI was wrong; flag retired
    #   rejected   → the AI was right; the task stops counting toward the day
    #   requeried  → the leader was asked to re-file; no penalty yet
    # `rejected` is the only value that changes a number anywhere (see
    # routers/leaders.py `_apply_overlays`), which is why it is stored as a
    # decision and never inferred from `flags`.
    resolution      = Column(String(12), nullable=True, index=True)
    resolved_by     = Column(String(160), nullable=True)   # actor's display name
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)


class LeaderDayReport(Base):
    """The ledger of verification reports already DMed for one leader-day.

    The automatic regime (shift 1, from `leader_ai.AUTO_FROM`) DMs the unit's
    supervisor and the leader once every task of a day has been judged, and
    again whenever a later ruling MOVES the day's score. `score_sent` is what
    makes the second half possible: without a record of the number the last DM
    carried, "did this change?" is unanswerable and the choice is between never
    correcting a stale figure and re-sending on every drain pass.

    Keyed by `report_key` — `leader_ai.report_key()`, the same grouping the
    queue and the census use — never by checklist row: leader_checklists is
    wiped and reloaded on every sheet refresh, so a row-keyed ledger would
    forget what it had sent and re-notify the whole week on the next sync.
    """
    __tablename__ = "leader_day_reports"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    report_key = Column(String, nullable=False, unique=True, index=True)
    uid        = Column(String, nullable=True)     # what /api/leaders prints
    date       = Column(String(10), nullable=False, index=True)
    shift      = Column(Integer, nullable=True)
    leader_id  = Column(Integer, nullable=True, index=True)
    leader_name = Column(String(160), nullable=True)
    manager_id = Column(Integer, nullable=True, index=True)

    # The day's adjusted score as of the last DM, and what it was made of. A
    # later re-review or human ruling is a "correction" only when it moves this.
    score_sent    = Column(Integer, nullable=False, default=0)
    rejected_sent = Column(Integer, nullable=False, default=0)
    tasks_total   = Column(Integer, nullable=False, default=0)

    sends        = Column(Integer, nullable=False, default=0)
    first_sent_at = Column(DateTime(timezone=True), server_default=func.now())
    last_sent_at  = Column(DateTime(timezone=True), nullable=True)


class LeaderAiDispute(Base):
    """An objection to one automatic AI rejection, and the two rulings on it.

    A flag costs its task the whole weight the moment it is written and nobody
    presses anything to make that happen, so the way back has to be at least as
    reliable as the deduction. Until 2026-08-30 it was not: only the unit's
    BRIGADIR could object, in one step, straight to an admin — so the person
    who was actually judged could not speak, and the admin ruled on a
    second-hand paraphrase of an argument nobody had recorded.

    It now runs the same three-stage chain as a late proof (`LeaderLateProof`),
    because a leader who missed a deadline and a leader the machine misjudged
    are the same person asking the same thing:

      leader     files with their own note, off the day report they were sent
      supervisor the unit's brigadir REJECTS it (final) or UPLIFTS it with
                 their own mandatory written case — they cannot restore the
                 weight themselves
      admin      reads BOTH notes and decides whether it is pointed

    `status` is the stage AND the outcome, one column: "supervisor" → "admin"
    → "approved" | "rejected", plus "cancelled" for a settled ruling taken
    back. `services/leader_dispute.py` is THE definition of the chain — which
    stage a filing enters at is decided by who filed it, which is also what
    makes every row written under the old one-stage flow read correctly
    unchanged: those were all filed by a brigadir and all waiting on an admin,
    i.e. they entered at the admin stage.

    Keyed by the verdict's `ref`, not by `review_id`: a review row is
    re-creatable from its ref (discovery re-inserts a deleted row, «stop and
    clear» deletes never-judged ones), so a dispute hung off the numeric id
    would lose its subject. One LIVE row per ref — a re-filed objection after a
    refusal replaces the old one, exactly like a late request.

    Approval writes `resolution="approved"` on the review, which is what
    actually restores the task's weight; this table is the paper trail and the
    queue the two deciders work from. Any ruling re-runs the day's report DM,
    so a corrected score announces itself.
    """
    __tablename__ = "leader_ai_disputes"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    ref       = Column(String, nullable=False, index=True)
    review_id = Column(Integer, nullable=True, index=True)
    date      = Column(String(10), nullable=False, index=True)
    task_id   = Column(Integer, nullable=False)
    leader_id = Column(Integer, nullable=True, index=True)
    leader_name = Column(String(160), nullable=True)
    manager_id = Column(Integer, nullable=True, index=True)

    # supervisor | admin | approved | rejected | cancelled
    status = Column(String(12), nullable=False, default="supervisor", index=True)

    # THE FILER'S OWN ACCOUNT — normally the leader's, since they are who the
    # verdict judged. Required: an overturned rejection has to explain itself
    # to the calibration stats as much as to the next reader. `requested_by_*`
    # says whose words these are, which is what lets a row filed by a brigadir
    # (the only route open to the ~18% of leaders who resolve to no profile)
    # be labelled honestly instead of being printed as the leader's.
    reason = Column(Text, nullable=False)
    requested_by_profile = Column(String, nullable=True)     # "leader:34"
    requested_by_name = Column(String(160), nullable=True)
    requested_by_telegram = Column(BigInteger, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── stage 1: the unit's brigadir ─────────────────────────────────────────
    # "rejected" (final) | "uplifted" (to the admins, note REQUIRED). Filled in
    # at filing time when a supervisor or an admin files it themselves — their
    # text IS the uplift, so the admin card never prints an empty block.
    sup_action   = Column(String(10), nullable=True)
    sup_note     = Column(Text, nullable=True)
    sup_by_name  = Column(String(160), nullable=True)
    sup_by_telegram = Column(BigInteger, nullable=True)
    sup_at       = Column(DateTime(timezone=True), nullable=True)

    # ── stage 2: the admins — the only place the weight comes back ───────────
    # Named `decided_*` and not `adm_*` because these columns predate the chain
    # and already hold every admin ruling ever made here. Renaming them would
    # orphan that history to buy a symmetry nobody reads.
    decided_by_name = Column(String(160), nullable=True)
    decided_by_telegram = Column(BigInteger, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decision_note = Column(Text, nullable=True)


class LeaderLateProof(Base):
    """A proof filed AFTER its task's own deadline, and the two rulings on it.

    The task itself is already over: the deadline sweep force-closed it, locked
    it forever and recorded it not-done, and none of that is undone here. What
    this row adds is the one thing the platform had no way to express — a
    leader who did the work, missed the hour, and has something to show for it.
    It carries its own photos and its own reason precisely so the locked entry
    is never touched: `leader_close.locked()` goes on answering exactly what it
    always answered, the AI queue never learns this exists, and the day's score
    is moved only at the very end, by an admin, through the ordinary
    LeaderTaskOverride overlay.

    **It never reaches the AI.** A late proof is judged on WHY it is late, which
    is a question about a person and not about a photograph, so the decision is
    human at both stages by construction — there is no queue door to close
    because no `LeaderAiReview` row is ever written for it.

    The chain is two-stage and deliberately asymmetric (the operator's spec):

      supervisor → the unit's own brigadir, who may REJECT (final, no points)
                   or UPLIFT to the admins with a written case for it. They
                   cannot grant points themselves — the person closest to the
                   leader is the one best placed to say whether the excuse is
                   true, and the least well placed to be the only one who says
                   it counts.
      admin      → approves (full weight, via LeaderTaskOverride) or rejects.

    `status` is the stage AND the outcome, one column: "supervisor" → waiting on
    the brigadir · "admin" → uplifted, waiting on an admin · "approved" ·
    "rejected". Nothing expires it: an undecided row sits in both queues with a
    badge until a person acts, because the default is already 0 points and a
    silent auto-reject would take the decision away from the two people the
    whole flow exists to put it in front of.

    One live row per (day, task) — `uq_ltask_late`. A rejected late proof is not
    re-filable: the leader had their say, two people ruled on it, and a second
    attempt at the same missed hour is a different feature.
    """
    __tablename__ = "leader_late_proofs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    day_id     = Column(Integer, ForeignKey("leader_task_days.id"), nullable=False, index=True)
    task_id    = Column(Integer, nullable=False)
    leader_id  = Column(Integer, nullable=False, index=True)   # role_profiles.id
    leader_name = Column(String(160), nullable=True)           # spelling at filing time
    manager_id = Column(Integer, nullable=True, index=True)    # the unit that owns the day
    date       = Column(String(10), nullable=False, index=True)
    shift      = Column(Integer, nullable=True)
    # The report uid `/api/leaders` prints for this day ("bot-{day_id}") — held
    # here so approval can write its LeaderTaskOverride without re-deriving an
    # identity two surfaces would then have to agree about.
    uid        = Column(String, nullable=True, index=True)
    # The hour that had already gone by when this was filed, for the card: a
    # reviewer judging "how late is late" should not have to look the rule up.
    deadline   = Column(String(5), nullable=True)

    status = Column(String(12), nullable=False, default="supervisor", index=True)

    # The leader's own explanation. Mandatory — a late proof with no reason is
    # exactly the thing the brigadir has nothing to rule on.
    reason     = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── stage 1: the unit's brigadir ─────────────────────────────────────────
    sup_action   = Column(String(10), nullable=True)   # "rejected" | "uplifted"
    sup_note     = Column(Text, nullable=True)         # required to uplift
    sup_by_name  = Column(String(160), nullable=True)
    sup_by_telegram = Column(BigInteger, nullable=True)
    sup_at       = Column(DateTime(timezone=True), nullable=True)

    # ── stage 2: the admins ──────────────────────────────────────────────────
    adm_action   = Column(String(10), nullable=True)   # "approved" | "rejected"
    adm_note     = Column(Text, nullable=True)
    adm_by_name  = Column(String(160), nullable=True)
    adm_by_telegram = Column(BigInteger, nullable=True)
    adm_at       = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("day_id", "task_id", name="uq_ltask_late"),)


class LeaderLateProofMedia(Base):
    """One photo of a late proof — the ARCHIVE-CHANNEL copy, as everywhere else.

    A table of its own rather than more `LeaderTaskMedia` rows: those hang off a
    LeaderTaskEntry, and the whole point of this flow is that the entry is
    locked and must not gain, lose or appear to gain anything. Keeping the
    pixels apart is what lets an approved late proof move the score through the
    override overlay while every existing reader of the day — the register, the
    media proxy, the AI reviewer, the day report — goes on seeing the submission
    the deadline actually caught.
    """
    __tablename__ = "leader_late_proof_media"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    late_id    = Column(Integer, ForeignKey("leader_late_proofs.id"), nullable=False, index=True)
    file_id    = Column(String, nullable=False)
    message_id = Column(BigInteger, nullable=True)
    pos        = Column(Integer, nullable=False, default=0)
    # WHICH DOOR this photo came through — "camera" (taken in the app, clock
    # server-authored) or "upload" (a file the leader chose). Nullable because
    # rows written before the camera door existed came through the upload one
    # and are read as such.
    #
    # It is on the row rather than derived because the reviewer has to SEE it.
    # A stamped camera shot and a hand-picked file that look identical on the
    # brigadir's card teach reviewers that the stamp is decorative, which is
    # the one way offering both doors could weaken the camera feature.
    source      = Column(String(10), nullable=True)
    # The server's own instant for a camera shot, and the text burnt into it.
    # NULL for an upload: a file the leader chose has no instant this platform
    # can vouch for, and inventing one is exactly what the camera exists to stop.
    captured_at = Column(DateTime(timezone=True), nullable=True)
    stamp       = Column(String(40), nullable=True)


class LeaderLateProofShot(Base):
    """The DRAFT roll of a late filing — shots taken (or sent) before the
    leader has written their reason and pressed send.

    Three separate arguments put this in a table of its own, and each one alone
    would be enough:

    1. **It must survive the app closing.** That is `LeaderTaskPhoto`'s own
       reason for existing: a leader who shot two of three and closed Telegram
       comes back to two. The late flow staged its photos in
       `LeaderTaskCapture.media` — one row per Telegram ACCOUNT, deleted by any
       `_lt_clear`, and expiring after 30 minutes — so a leader who opened
       /tasks again, or simply took too long writing the reason, silently lost
       every photo they had taken.

    2. **It must not be reachable from `leader_task_photos`.** Sharing that
       table would be actively dangerous, not merely untidy:
       `leader_close.force_answer` turns ANY photo on a (day, task) roll into a
       `done` LeaderTaskEntry via `sync_entry` — awarding the point with no
       ruling at all — and `leader_proof.server_clocks` feeds that same roll
       into `LeaderAiReview.clocks`. A late shot sharing the key would be
       auto-submitted, scored AND sent to Gemini: all three of the rules this
       feature is named for, broken at once. It would also collide on
       `uq_ltask_photo_slot` with whatever the on-time roll already holds.

    3. **One store for BOTH doors.** A camera shot and a chat upload land here
       alike (`source`), so the count on screen, the durability and the submit
       all read one place. Two stores would be two answers to "how many photos
       does this filing have".

    `client_key` is carried for the same reason `LeaderTaskPhoto` carries it:
    the page cannot tell a request that never arrived from one whose answer
    died on the way back, so it re-sends, and without the key the same picture
    lands twice.

    Rows live only until the filing is submitted (`leader_late_proof.create`
    consumes them) or its window shuts — see `clear_draft` / `drop_drafts`.
    """
    __tablename__ = "leader_late_proof_shots"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    day_id      = Column(Integer, ForeignKey("leader_task_days.id"), nullable=False, index=True)
    leader_id   = Column(Integer, nullable=False, index=True)   # role_profiles.id
    task_id     = Column(Integer, nullable=False)
    slot        = Column(Integer, nullable=False, default=0)
    source      = Column(String(10), nullable=False, default="upload")  # camera | upload
    file_id     = Column(String, nullable=False)                # archive-channel copy
    message_id  = Column(BigInteger, nullable=True)
    # Server-authored, camera only. An uploaded file carries no instant this
    # platform can vouch for, so it carries none here either.
    captured_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    stamp       = Column(String(40), nullable=True)
    skew_s      = Column(Integer, nullable=True)
    client_key  = Column(String(64), nullable=True)

    __table_args__ = (
        UniqueConstraint("day_id", "task_id", "slot", name="uq_late_shot_slot"),
        # Per LEADER, exactly as the camera roll's key is: the backstop for two
        # copies of one upload racing out of the offline queue.
        Index("uq_late_shot_client_key", "leader_id", "client_key", unique=True),
    )


class LeaderTaskOverride(Base):
    """An admin's manual ruling on ONE task of ONE report — done or not done,
    regardless of what the leader answered or what the AI thought.

    Keyed by the report uid /api/leaders prints (the form's submission id for a
    sheet row, ``bot-{day_id}`` for a bot day) — the same identity the AI
    overlay resolves its verdicts to, so both rulings land on the same card.
    Neither source can be written back (the leaders sheet is wipe-and-reloaded,
    a closed bot day is immutable), so this is a read-time overlay exactly like
    the AI rejection in routers/leaders.py, and deleting the row restores the
    leader's own answer. Where both exist for one task, this one wins: it is
    the explicit human statement of the task's state.
    """
    __tablename__ = "leader_task_overrides"
    __table_args__ = (UniqueConstraint("uid", "task_id", name="uq_leader_task_override"),)

    id      = Column(Integer, primary_key=True, autoincrement=True)
    uid     = Column(String, nullable=False, index=True)
    task_id = Column(Integer, nullable=False)
    date    = Column(String(10), nullable=False, index=True)  # narrows the read-time scan
    leader  = Column(String(160), nullable=True)              # display/audit only
    done    = Column(Boolean, nullable=False)
    set_by  = Column(String(160), nullable=True)              # actor's display name
    set_at  = Column(DateTime(timezone=True), nullable=True)


class LeaderTaskPendingChange(Base):
    """A config edit STAGED to take effect from a future checklist day
    ("apply from next day"). The live config tables (leader_task_settings /
    _leader_settings / _defs) always mean "in effect right now" — the bot and
    scoring never learn about staging — so a staged edit sits here until the
    day boundary, when the first bot request that observes the new date
    promotes it (services.leader_tasks.promote_due, lazy: there is no
    scheduler). `shift` tags which day boundary applies — a supervisor/leader
    change carries its unit's shift (1 = midnight, 2 = 17:00) so it flips
    exactly at that shift's rollover; a global_task change (names / default
    weight, cosmetic or rarely-governing) is shift-agnostic (NULL) and promotes
    at the first crossing. One pending change per target — re-staging the same
    target replaces it (handled in stage_change)."""
    __tablename__ = "leader_task_pending_changes"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    kind           = Column(String, nullable=False)   # supervisor | leader | global_task
    task_id        = Column(Integer, nullable=True)   # NULL for a supervisor batch
    manager_id     = Column(Integer, nullable=True, index=True)
    leader_id      = Column(Integer, nullable=True, index=True)
    shift          = Column(Integer, nullable=True)   # 1 | 2, NULL = shift-agnostic
    effective_date = Column(String(10), nullable=False, index=True)  # ISO, ≥ tomorrow
    payload        = Column(JSONB, nullable=False)    # exact apply-function args
    created_by     = Column(String, nullable=True)    # admin profile key / name
    created_at     = Column(DateTime(timezone=True), server_default=func.now())


class LeaderTaskConfigAudit(Base):
    """Append-only history of every leader-task CONFIG change (not submissions).
    This config sets people's KPI scores, so edits need receipts: who changed
    what, when, and the before→after so the History drawer can show it and
    Revert can restore it. `action` covers the staged lifecycle too."""
    __tablename__ = "leader_task_config_audit"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    ts         = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor      = Column(String, nullable=True)   # admin profile key / name
    # scheduled | applied | cancelled | superseded | reverted | failed
    action     = Column(String, nullable=False)
    kind       = Column(String, nullable=False)  # supervisor | leader | global_task
    task_id    = Column(Integer, nullable=True)
    manager_id = Column(Integer, nullable=True, index=True)
    leader_id  = Column(Integer, nullable=True, index=True)
    effective_date = Column(String(10), nullable=True)   # set for scheduled/applied
    before     = Column(JSONB, nullable=True)    # payload-shaped prior state
    after      = Column(JSONB, nullable=True)    # payload-shaped new state


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
    # The PROFILE that was active for these pings ("role:id"). The dashboard
    # reports PEOPLE, so rows aggregate by profile: two accounts working as one
    # profile are one person with one combined time-in-app, while one account
    # switching profiles mid-day splits into a row per profile instead of having
    # the whole day relabelled by whichever profile pinged last.
    # NULL for identities that cannot be resolved (seeded admins) — those still
    # aggregate by account.
    profile_key    = Column(String, nullable=True, index=True)
    day            = Column(Date, nullable=False, index=True)   # UTC calendar day
    full_name      = Column(String, nullable=True)              # snapshot from JWT
    role           = Column(String, nullable=True)              # snapshot from JWT
    first_seen     = Column(DateTime(timezone=True), nullable=True)
    last_seen      = Column(DateTime(timezone=True), nullable=True)
    active_seconds = Column(Integer, nullable=False, default=0)
    event_count    = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        # Uniqueness now spans the profile too. Enforced in the DB by a unique
        # INDEX over COALESCE(profile_key, '') — a plain constraint would treat
        # NULL profiles as distinct and let duplicate rows accumulate.
        UniqueConstraint("telegram_id", "profile_key", "day",
                         name="uq_user_activity_tid_profile_day"),
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
    # The concern's REGISTER NUMBER — the «№» column. Handed out in creation
    # order (max+1) and never reused, so the number is a property of the CONCERN
    # and not of the view: one row is «42» to its leader, to its brigadir and to
    # an admin, under every sort, filter and period. A deleted concern leaves its
    # number unused rather than renumbering everything raised after it — a number
    # that shifts under rows nobody touched cannot be used to name a row. NULL
    # only until the one-shot backfill runs (startup.add_concern_seq); readers
    # fall back to `id`, never to a blank.
    seq                 = Column(Integer, nullable=True, index=True)
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
    cell_code           = Column(String, nullable=True)           # Ячейка (the leader's production cell the concern is about)
    # Department category the concern falls under (fixed whitelist in
    # routers/concerns.py CATEGORIES). Required on new rows; NULL on legacy rows
    # created before categories existed.
    category            = Column(String, nullable=True)
    # Creator-name snapshot. New rows stamp the creator's name here as a
    # fallback; the Owner column resolves the CURRENT profile name from
    # owner_role/owner_profile_id at view time. Pre-owner-rollout rows keep
    # whatever free text was typed ("worker who raised it").
    concern_owner       = Column(String, nullable=False)
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
    # Escalation level — who currently holds the concern. Every concern OPENS at
    # "supervisor" and each level uplifts one step when they can't solve it:
    # leader → supervisor → shift-manager → top-manager. "leader" is the bottom
    # step and a downgrade destination only — a supervisor hands a concern down
    # to the leader it was logged against, who then holds it (status + send-back).
    # The handler at the current level AND everyone above it in the chain keep
    # edit rights; levels below turn read-only (see routers/concerns.py).
    level               = Column(String, nullable=False, server_default="supervisor")
    # When the concern arrived at the level it currently sits on — stamped on
    # every escalation step, up OR down. The "прошло времени" clock counts from
    # here, so each level is measured on the time IT held the concern and a
    # handover hands over a fresh timer. NULL on rows that never moved (and on
    # anything predating the column) ⇒ falls back to created_at, which is the
    # same instant. created_at / entry_date keep the concern's whole life.
    level_since         = Column(DateTime(timezone=True), nullable=True)
    # Top-management is person-specific: the shift-manager picks ONE top-manager
    # profile on the last uplift step; only that person (plus admin) may act.
    # Cleared when the concern is sent back down.
    top_manager_profile_id = Column(Integer, nullable=True)
    top_manager_name       = Column(String, nullable=True)        # snapshot of the chosen top-manager
    # Shift-management is person-specific too (parallel to top_manager_*): the
    # shift-manager who holds the concern at the shift-manager level — picked on
    # the supervisor → shift-manager uplift and when a supervisor/admin seeds a
    # concern straight at that level. Cleared when sent back down to supervisor.
    shift_manager_profile_id = Column(Integer, nullable=True)
    shift_manager_name       = Column(String, nullable=True)      # snapshot of the chosen shift-manager
    created_by          = Column(BigInteger, nullable=True)       # telegram_id of author (leader or admin)
    # The creator's PROFILE identity — the Owner column resolves the current
    # profile name from these at view time (renames stay live). owner_role:
    # leader|supervisor|shift-manager|admin; owner_profile_id: role_profiles.id
    # (managers.id for supervisors). NULL pair = legacy row → the typed
    # concern_owner text renders without a position.
    owner_role          = Column(String, nullable=True)
    owner_profile_id    = Column(Integer, nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ConcernEscalation(Base):
    """One uplift / send-back event on a concern — the trail the history modal
    reads. ``reason`` is mandatory ("why I can't solve this").

    A step is stored as a HANDOVER BETWEEN PEOPLE, not just between levels:
    ``from_name`` is whoever held the concern before the move and ``target_name``
    whoever receives it at ``to_level`` — both snapshotted at the instant of the
    move, on EVERY step (they used to name only the top-manager, so the trail
    could not answer "handed to whom?" for any other step, and a level whose
    holder later changed rewrote its own history). Both are resolved through
    ``routers/concerns._holder_name``, the one definition of who sits on a
    level, so the trail and the row's responsible_name can never disagree.
    Legacy rows carry NULL and render as a bare level chip."""
    __tablename__ = "concern_escalations"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    concern_id  = Column(Integer, nullable=False, index=True)     # leader_concerns.id
    from_level  = Column(String, nullable=False)
    to_level    = Column(String, nullable=False)
    reason      = Column(Text, nullable=False)
    actor_telegram_id = Column(BigInteger, nullable=True)
    actor_name  = Column(String, nullable=True)                   # snapshot of the escalator's name
    actor_role  = Column(String, nullable=True)
    from_name   = Column(String, nullable=True)                   # who HELD it before this move
    target_name = Column(String, nullable=True)                   # who RECEIVES it at to_level
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class LeaderConcernComment(Base):
    """Chat-style comment thread on a concern — the discussion between the
    people a concern passes through (its cell's leader, the unit brigadir and
    whoever holds it now). Same shape and ownership rule as
    ``LeaderTaskComment``: editable/deletable only by the authoring PROFILE
    (enforced in routers/concerns.py)."""
    __tablename__ = "leader_concern_comments"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    concern_id         = Column(Integer, nullable=False, index=True)   # leader_concerns.id
    author_telegram_id = Column(BigInteger, nullable=False)
    # telegram_user_roles.id of the authoring PROFILE (0 = admin sentinel), kept
    # for parity with the task thread; ``author_profile`` below is THE ownership
    # key — any account holding the authoring profile may edit or delete.
    author_role_ref    = Column(Integer, nullable=True)
    author_profile     = Column(String, nullable=True, index=True)     # "role:id"
    author_name        = Column(String, nullable=True)                 # snapshot of the author's display name
    text               = Column(Text, nullable=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    edited_at          = Column(DateTime(timezone=True), nullable=True)  # set on every edit
    # What the message IS: NULL for ordinary chat, "resolution" for the
    # mandatory note written when the concern was CLOSED. That note is a message
    # in this thread and nowhere else — the answer belongs beside the questions
    # that led to it, not in a 10px footnote on the register — so the flag is
    # what lets the thread mark it, the trail find it, and the delete guard
    # protect it (routers/concerns.py). ``LeaderConcern.solution`` is the legacy
    # column: concerns closed before this carry their note there, untouched.
    kind               = Column(String(12), nullable=True)


class LeaderTask(Base):
    """A supervisor→leader assignment (the "DAILY протокол" board that used to
    live in Google Sheets). ``priority`` is the per-leader queue position over
    the ACTIVE (todo/doing) tasks only — always a dense 1..N; a done task leaves
    the queue (priority NULL) and the rest close ranks. The queue invariant is
    maintained by routers/tasks.py."""
    __tablename__ = "leader_tasks"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    # OWNERSHIP KEY: the assigned leader PROFILE (role_profiles.id). The profile
    # is the person — every account holding it sees and works the same queue,
    # and the task survives an unassign→re-claim (role rows churn, profiles do
    # not). ``leader_role_ref`` below is the legacy registration key, kept only
    # as a read fallback for rows the backfill could not resolve.
    leader_profile_id     = Column(Integer, ForeignKey("role_profiles.id"), nullable=True, index=True)
    leader_role_ref       = Column(Integer, nullable=True, index=True)
    leader_name           = Column(String, nullable=False)         # snapshot of the leader's name
    supervisor_manager_id = Column(Integer, nullable=True)         # managers.id (leader's unit)
    supervisor_name       = Column(String, nullable=True)          # snapshot of the unit/brigadir name
    task_text             = Column(Text, nullable=False)           # Задача
    priority              = Column(Integer, nullable=True)         # Приоритет: 1..N among active tasks; NULL once done
    status                = Column(String, nullable=False, server_default="todo")  # todo | doing | done
    due_date              = Column(Date, nullable=False)           # Срок выполнения
    completed_at          = Column(DateTime(timezone=True), nullable=True)  # set when flipped to done
    created_by            = Column(BigInteger, nullable=True)      # telegram_id of creator (supervisor or admin)
    # Creator PROFILE key ("role:id"). Creator rights (edit/delete, "your task
    # was completed" notices) belong to the profile, so a co-holder of the same
    # brigadir profile can act on it and a role switch does not carry the rights
    # into an unrelated profile. NULL rows fall back to ``created_by``.
    created_by_profile    = Column(String, nullable=True, index=True)
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
    # Author PROFILE key ("role:id") — THE ownership key: any account holding
    # the authoring profile may edit/delete, and rights survive a re-claim.
    # ``author_role_ref`` above stays as the legacy fallback for NULL rows.
    author_profile     = Column(String, nullable=True, index=True)
    author_name        = Column(String, nullable=True)                 # snapshot of the author's display name
    text               = Column(Text, nullable=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    edited_at          = Column(DateTime(timezone=True), nullable=True)  # set on every edit


class Broadcast(Base):
    """One admin broadcast delivered to selected profiles as Telegram DMs.
    The row is created up-front with status 'sending'; a background thread
    performs the sends (routers/broadcast.py) and bumps sent/failed counts as
    it goes, flipping status to 'done' at the end — the admin history table
    polls this row to show live progress."""
    __tablename__ = "broadcasts"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    sender_telegram_id = Column(BigInteger, nullable=False)
    sender_name        = Column(String, nullable=True)      # admin profile name snapshot
    # normal → sendMessage/HTML parse mode; rich → sendRichMessage (Bot API 10.1+)
    mode               = Column(String, nullable=False, server_default="normal")
    text_html          = Column(Text, nullable=False)       # sanitized Telegram HTML
    text_plain         = Column(Text, nullable=False)       # entity-stripped text (snippets/length)
    attachment_kind    = Column(String, nullable=True)      # normal mode: photo | video | document
    attachment_name    = Column(String, nullable=True)
    media_names        = Column(JSONB, nullable=False, server_default="[]")  # rich mode: embedded media file names
    target_keys        = Column(JSONB, nullable=False, default=list)  # ["role:id", …] as selected
    recipient_total    = Column(Integer, nullable=False, default=0)   # deduped Telegram accounts
    sent_count         = Column(Integer, nullable=False, default=0)
    failed_count       = Column(Integer, nullable=False, default=0)
    failed_names       = Column(JSONB, nullable=False, default=list)  # profile names whose DM failed
    # Per-recipient failure detail — [[telegram_id, name, reason], …]. failed_names
    # above stays the name/count surface every existing consumer reads; this adds
    # WHY, which is the only thing that tells an admin whether retrying is worth
    # anything at all ("bot was blocked by the user" fails again every time).
    # NULL on rows that predate the column — the record page renders those as "—"
    # rather than inventing a reason.
    failures           = Column(JSONB, nullable=True)
    status             = Column(String, nullable=False, default="sending")  # scheduled | sending | done | canceled
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    finished_at        = Column(DateTime(timezone=True), nullable=True)
    # Resumable fan-out state. Passenger recycles app processes within seconds,
    # so the send loop cannot rely on its thread surviving: the resolved
    # recipient list [[telegram_id, name], …] and a cursor into it live on the
    # row, committed after every recipient. Any later process claims a row
    # whose worker heartbeat (claimed_at) went stale and continues from the
    # cursor (see routers/broadcast.py resume_stuck_broadcasts).
    recipients         = Column(JSONB, nullable=True)
    send_cursor        = Column(Integer, nullable=False, default=0, server_default="0")
    attachment_file_id = Column(String, nullable=True)   # harvested after the 1st successful media send
    media_specs        = Column(JSONB, nullable=True)    # rich mode: reusable media specs, ditto
    claimed_at         = Column(DateTime(timezone=True), nullable=True)
    # Deferred send. NULL = went out immediately (every row before scheduling
    # existed). A 'scheduled' row is already FULLY resolved — recipients,
    # sanitized HTML, and for media the harvested file_id/media_specs — so
    # firing it is just a status flip into the same resumable fan-out; nothing
    # about the send needs the process that composed it, which is what lets it
    # survive a deploy. app/scheduler.py holds the timer, this column is the
    # truth that timer is rebuilt from at every boot.
    scheduled_at       = Column(DateTime(timezone=True), nullable=True)


class BroadcastDraft(Base):
    """A /broadcast in progress, keyed to the admin composing it (one active
    draft per admin — a new /broadcast replaces the old one). The admin's own
    message(s) stay in their private chat; we only remember their message_ids
    and copy them to each recipient at send time (copyMessage/copyMessages),
    so any Telegram content — rich text, media, an album — is preserved
    exactly, and in-place edits are picked up automatically.

    Flow / status: awaiting_message → awaiting_continue (message captured, the
    "review & continue" warning is up) → awaiting_recipients (the mini-app
    picker button is shown) → sent. `warn_message_id` is the bot message that
    is edited across those steps (warning → picker → final "sent X/Y")."""
    __tablename__ = "broadcast_drafts"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    admin_telegram_id = Column(BigInteger, nullable=False, unique=True, index=True)
    token             = Column(String, nullable=False, unique=True, index=True)  # opaque, → mini-app URL
    from_chat_id      = Column(BigInteger, nullable=False)                        # where the message(s) live (the admin's chat)
    message_ids       = Column(JSONB, nullable=False, default=list)              # captured message id(s), in order
    media_group_id    = Column(String, nullable=True)                            # set when the draft is an album
    preview_text      = Column(Text, nullable=True)                             # first text/caption, for the history row
    warn_message_id   = Column(BigInteger, nullable=True)                        # bot message edited through the flow
    status            = Column(String, nullable=False, default="awaiting_message")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CustomEmoji(Base):
    """A saved premium (custom) Telegram emoji for the Broadcast composer's
    palette. Telegram identifies a premium emoji by a numeric custom_emoji_id,
    not an image; the composer inserts it as
    ``<tg-emoji emoji-id="…">fallback</tg-emoji>`` — rendered animated for
    Premium recipients, the plain fallback char for everyone else. Admins add
    each one once; the id is obtained by forwarding the emoji to the bot, which
    echoes it back (see telegram_bot._custom_emoji_echo)."""
    __tablename__ = "custom_emojis"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    emoji_id   = Column(String, nullable=False, unique=True)   # Telegram custom_emoji_id (numeric string)
    fallback   = Column(String, nullable=False)                # plain emoji shown to non-Premium users
    label      = Column(String, nullable=True)                 # admin's note, e.g. "sun"
    created_by = Column(BigInteger, nullable=True)             # admin telegram id who added it
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SetupTime(Base):
    """Average changeover («переналадка») time of one production cell, as
    reported by its supervisor. Seeded once from the «периналадка» workbook
    (data/setup_times_seed.json), maintained from the Setup times page after
    that. manager_id links the row to a supervisor unit (display name/shift
    come from the live managers row); `supervisor` is the fallback display
    name for rows whose sheet doesn't match a platform unit. The workbook has
    no SKU column, so `sku` starts empty and is filled in from the UI."""
    __tablename__ = "setup_times"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    manager_id = Column(Integer, ForeignKey("managers.id"), nullable=True, index=True)
    supervisor = Column(String, nullable=False, default="")
    cell       = Column(String, nullable=False)
    minutes    = Column(Numeric(6, 2), nullable=True)
    reason     = Column(Text, nullable=False, default="")
    sku        = Column(String, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProfileCapability(Base):
    """One admin capability granted to ONE profile.

    Capabilities are the per-person half of the permission system: the
    page-access matrix (app/permissions.py) decides which PAGES a ROLE may
    open, this decides which admin-only ACTIONS a single PROFILE may perform.
    Grants are additive — every hardcoded rule (admin, shift-manager, the
    receiving supervisor of a transfer…) keeps working untouched; a grant only
    widens the set of people who may act.

    Keyed by ``profile_key`` ("supervisor:42" — see app/identity.py), never by
    telegram_user_roles.id: a profile is a person, so every holder of that
    profile wields the grant and it survives an unassign→re-claim. A person
    switched into a DIFFERENT profile does not carry it over.

    ``scope`` decides how much data the action reaches:
      own → the profile's normal row scoping (supervisor→their unit,
            shift-manager→their shift); the grant only adds the action.
      all → admin reach: every unit, shift and date.

    The ``page.view.<page>`` family stores PAGE access in the same rows: one
    person may be given a page their role was never ticked for on the Access
    matrix, and — on the pages whose data narrows to the viewer — ``scope``
    says whether they read only their own rows or the whole factory.

    LEGACY as of the per-account rollout: capabilities are now granted to a
    Telegram ACCOUNT (see :class:`UserCapability`), so two accounts holding one
    profile can differ. These rows are read only once, by the one-time
    ``migrate_user_capabilities`` startup fan-out that seeds UserCapability from
    them; nothing writes here anymore. Kept so that migration is re-runnable and
    the history is not destroyed.

    NOT to be confused with :class:`ProfilePermission`, the LIVE profile-level
    table: this one is a frozen pre-rollout snapshot, that one holds pending
    grants and permanent page denies written by the Permissions tab today.
    """
    __tablename__ = "profile_capabilities"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    profile_key = Column(String, nullable=False, index=True)
    capability  = Column(String, nullable=False)
    scope       = Column(String, nullable=False, default="own")   # own | all
    granted_by  = Column(String, nullable=True)                   # admin's display name
    granted_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("profile_key", "capability", name="uq_profile_capability"),
    )


class ProfilePermission(Base):
    """One permission entry attached to a PROFILE — the POSITION, not a login.

    :class:`UserCapability` answers "what may this Telegram ACCOUNT do"; this
    answers "what may WHOEVER RUNS THIS UNIT do". Both are read live on every
    request (``capabilities.caller_caps``), and the admin Permissions tab picks
    between them with a switch above the tree.

      * **mode="grant".** Every account holding the profile wields it from the
        moment it is saved — including accounts that already held it — and an
        account that switches to another profile leaves it behind, because
        nothing is ever copied onto the login. That is the point: the power
        belongs to the job. It also equips a position NOBODY has claimed yet
        (profiles exist before their people register, see `pre-created
        profiles`), with no second step when the person finally appears.

      * **mode="deny".** The one subtractive entry in the whole permission
        system: it CLOSES a page the profile's role opens on the Access matrix,
        for every account holding the profile. Only the ``page.view.*`` family
        may be denied; role-native ACTIONS stay purely additive, so no hardcoded
        authority check has to consult a deny list.

    Resolution (``capabilities.caller_caps`` / ``caller_denied_pages``): grants
    union, with the account's own scope winning where both carry a capability;
    for the subtractive half, the account entry decides if it has one, else a
    profile deny closes the page, else the role × page matrix. An account-level
    grant is therefore the escape hatch from a profile deny for exactly one
    login.
    """
    __tablename__ = "profile_permissions"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    profile_key = Column(String, nullable=False, index=True)       # "role:id"
    capability  = Column(String, nullable=False)
    mode        = Column(String, nullable=False, default="grant")  # grant | deny
    scope       = Column(String, nullable=False, default="own")    # own | all (grant only)
    granted_by  = Column(String, nullable=True)                    # admin's display name
    granted_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("profile_key", "capability", name="uq_profile_permission"),
    )


class UserCapability(Base):
    """One admin capability granted to ONE Telegram account.

    The per-person half of the permission system, keyed by the ACCOUNT
    (``telegram_id``) rather than the profile. This is the deliberate exception
    to the "a profile is the person" rule (app/identity.py): everywhere else one
    person's several logins are one identity, but permissions are handed out per
    login — so a supervisor profile held by two accounts can grant the transfer
    power to just one of them. Every guard resolves the JWT's ``sub`` (the
    telegram id) straight to these rows via ``capabilities.caller_caps``.

    Still ADDITIVE and read LIVE: a grant only ever widens who may act, and a
    revoke takes effect on the holder's next request with no re-login.

    ``scope`` decides how much data the action reaches:
      own → the account's normal row scoping (derived at request time from the
            profile it is acting as: supervisor→their unit, shift-manager→their
            shift); the grant only adds the action.
      all → admin reach: every unit, shift and date.

    The ``page.view.<page>`` family stores PAGE access in the same rows: one
    account may be given a page its role was never ticked for on the Access
    matrix, and — on the pages whose data narrows to the viewer — ``scope`` says
    whether it reads only its own rows or the whole factory.

    ``mode`` is "grant" for every row the system ever wrote before the deny
    rollout, and stays the default. "deny" CLOSES a ``page.view.*`` page for
    this one login — the account-level counterpart of a
    :class:`ProfilePermission` deny, and the more specific of the two, so it
    also overrides a deny (or an opening) inherited from the profile. Only the
    page family may carry it; an action capability is either granted or absent.
    """
    __tablename__ = "user_capabilities"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    capability  = Column(String, nullable=False)
    mode        = Column(String, nullable=False, default="grant")  # grant | deny
    scope       = Column(String, nullable=False, default="own")   # own | all
    granted_by  = Column(String, nullable=True)                   # admin's display name
    granted_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("telegram_id", "capability", name="uq_user_capability"),
    )


class CapabilityAudit(Base):
    """Append-only log of every capability grant / revoke / scope change.

    Grants hand out admin-level powers, so who widened whose access — and when
    — must stay answerable long after the grant itself was revoked and its
    UserCapability row deleted.

    Per-account rollout: new rows record the ``telegram_id`` the change targeted.
    ``profile_key`` is the legacy target column — nullable now, still populated on
    the pre-rollout history rows so nothing in the trail is lost."""
    __tablename__ = "capability_audit"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    profile_key = Column(String, nullable=True, index=True)         # legacy target
    telegram_id = Column(BigInteger, nullable=True, index=True)     # per-account target
    capability  = Column(String, nullable=False)
    action      = Column(String, nullable=False)   # granted | revoked | rescoped
    scope       = Column(String, nullable=True)    # the scope after the change
    actor_name  = Column(String, nullable=True)
    actor_telegram_id = Column(BigInteger, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class CapabilityUse(Base):
    """Append-only log of every EXERCISE of a granted capability.

    The persistent half of the grant-use warning DMs (app/capability_alerts):
    the DM pings the admins in the moment, this row keeps who/what/old→new
    answerable later on the admin «Action history» tab. Rows exist only for
    grant-authorized actions — native admin/role authority never logs here.

    ``details`` ([label_key, value] pairs) and ``changes`` ([field, old, new]
    triples) hold the language-NEUTRAL alert payload; values may be
    ["__t__", key] markers. Rendering translates per viewer language through
    the same 4-lang table the DMs use (capability_alerts.render_use)."""
    __tablename__ = "capability_uses"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    actor_name  = Column(String, nullable=True)
    actor_role  = Column(String, nullable=True)
    capability  = Column(String, nullable=False)
    scope       = Column(String, nullable=True)    # grant scope at use time
    granted_by  = Column(String, nullable=True)    # who handed out the grant
    action      = Column(String, nullable=False)   # capability_alerts action key
    details     = Column(JSONB, nullable=True)
    changes     = Column(JSONB, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class WorkerConcern(Base):
    """One worker-submitted concern («хавотир»), synced from the 180 per-cell
    Google spreadsheets linked off the «Liderlar Havotirlar» registry tab.

    The per-cell sheets are the ONLY place resolution status lives (the master
    «Umumiy» tab has an always-empty Status column), so the sync crawls each
    linked sheet and stores per-row status here. The registry row's (brigadir,
    leader, cell) triple is stamped onto every row of its sheet as ``reg_*`` —
    that is the attribution the business's own monthly KPI uses (the sheet's
    IMPORTRANGE summaries credit the whole cell to its registered leader), and
    it is spelling-stable where the free-typed per-row names are not. The raw
    per-row leader/owner spellings are kept for the register view.

    ``date`` is the FILING date (ISO) and is None when the sheet's value can't
    be parsed or falls outside the plausible window — those rows still count in
    people-keyed KPIs but are excluded from date-bound charts, and the sync
    reports how many (never silently dropped). «Дата завершения» in the sheets
    is garbage (years like 1912) and is deliberately not imported: resolution
    TIME cannot be measured until the source records it honestly."""
    __tablename__ = "worker_concerns"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    sheet_id     = Column(String, nullable=False, index=True)  # source spreadsheet (wipe-replace key)
    reg_cell     = Column(String, index=True)    # registry «Новая кодировка» cell code
    reg_brigadir = Column(String, index=True)    # registry brigadir (canonical-ish spelling)
    reg_leader   = Column(String, index=True)    # registry leader; "" when the cell has none
    row_leader   = Column(String)                # the row's own «Лидер» free-text spelling
    owner        = Column(String)                # «Хавотир эгаси» — the worker who submitted
    text         = Column(Text)                  # «Хавотир» free text
    date         = Column(String(10), index=True, nullable=True)  # ISO filing date; None = unparseable
    date_raw     = Column(String, nullable=True)                  # sheet spelling, kept for the register
    status       = Column(String, index=True)    # todo | doing | done | deferred | other
    status_raw   = Column(String, nullable=True) # sheet spelling when status == other


class WorkerConcernSyncMeta(Base):
    """Singleton row (id=1) tracking the worker-concerns crawl across the ~180
    per-cell sheets. Doubles as the progress feed the page polls while a
    refresh runs and as the claim that keeps two refreshes from overlapping
    (``running`` + ``heartbeat``; a heartbeat older than the stale window may
    be taken over — the previous process died mid-crawl).

    ``failures`` is WHY the run left rows stale — one entry per sheet that could
    not be read: ``{cell, sheet_id, code, detail}``. Without it the page could
    only name the cell, and the cause lived exclusively in ``app.log`` on the
    server, where the people who own these sheets cannot reach it — so every
    failure looked identical and none of them was actionable. ``code`` is the
    classified cause (the page translates it into a sentence); ``detail`` is the
    truncated raw error, shown only as a fallback. The list is rewritten whole
    each run: a sheet that failed is always re-crawled next run (a failure never
    writes a skip baseline), so "failed in the last run" and "still broken" are
    the same set."""
    __tablename__ = "worker_concern_sync"

    id            = Column(Integer, primary_key=True)
    last_synced   = Column(DateTime(timezone=True), nullable=True)
    ok            = Column(Boolean, default=True)
    message       = Column(Text, nullable=True)
    row_count     = Column(Integer, default=0)
    invalid_dates = Column(Integer, default=0)   # rows kept with date=None
    failed_sheets = Column(Integer, default=0)   # sheets that kept stale rows this run
    failures      = Column(JSONB, nullable=True) # [{cell, sheet_id, code, detail}] of the last run
    running       = Column(Boolean, default=False, nullable=False)
    progress_done  = Column(Integer, default=0)
    progress_total = Column(Integer, default=0)
    # Why the run cost what it cost. ``skipped_sheets`` is the incremental
    # saving actually realised; ``sweep_error`` is set when the Drive
    # modifiedTime sweep could not run at all, in which case NOTHING can be
    # skipped and the crawl is a full one. That distinction used to exist only
    # as a log warning on the server — so a permanently disabled Drive API was
    # indistinguishable, from the page, from an optimisation that simply never
    # helped. It is state, not a log line: it belongs here.
    skipped_sheets = Column(Integer, default=0)
    sweep_error    = Column(Text, nullable=True)
    started_at    = Column(DateTime(timezone=True), nullable=True)
    heartbeat     = Column(DateTime(timezone=True), nullable=True)


class WorkerConcernSheetState(Base):
    """Per-sheet incremental-sync baseline: the Drive ``modifiedTime`` each
    per-cell sheet had when it was last crawled SUCCESSFULLY. A refresh skips
    sheets whose current Drive time still equals this value — their committed
    rows already ARE the content of exactly that revision. The row is written
    only on success, inside the same transaction as the sheet's wipe-replace,
    so a failed or interrupted crawl can never mark a sheet clean; any doubt
    (no row, no Drive answer, a mismatch) falls back to crawling the sheet."""
    __tablename__ = "worker_concern_sheet_state"

    sheet_id      = Column(String, primary_key=True)
    modified_time = Column(String, nullable=True)  # Drive RFC3339 string, compared verbatim
    crawled_at    = Column(DateTime(timezone=True), nullable=True)


class ArcRequest(Base):
    """One «АРС Фабрика» ticket mirrored from IT's internal API.

    ``remote_id`` is the ticket's own id as text and the ONLY identity — the
    row is upserted on it every sync, so the local copy always reads as the
    API's latest state (there is no updated_at anywhere, so every walk
    re-writes every row it sees). ``request_num`` is the same number as an
    integer, because «заявка №491» is what everybody upstream calls it.

    The LIST endpoint is thin: it carries the ticket, its author, division,
    category and brigade, but not the description, the deny reason, the files
    or the status timeline. Those come one call at a time from the card
    endpoint — ``detail_at`` is when that call last landed, and NULL means the
    row is list-only so far (see services/arc_sync.hydrate_details).

    ``missing_since`` is set ONLY by a full walk that finished (page reached
    pages, no exception) for rows the API stopped returning, and cleared the
    moment a row is seen again. A quick pass (first N pages) never touches it —
    it cannot tell "gone" from "further down than I looked". Missing rows stay
    in the table (never deleted) and are hidden by default on the page."""
    __tablename__ = "arc_requests"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    remote_id       = Column(String, unique=True, nullable=False)
    request_num     = Column(Integer, index=True)
    status          = Column(Integer, index=True)      # 0 new · 1 doing · 3 done · 4 denied · 6 handled
    # who filed it
    user_id         = Column(Integer, index=True)
    user_name       = Column(String, index=True)
    user_phone      = Column(String, nullable=True)
    user_manager    = Column(String, nullable=True)
    # where
    division_id     = Column(String, index=True)       # uuid, the API's «fillial_id» filter
    division_name   = Column(String, index=True)
    manager_name    = Column(String, nullable=True)    # the division's manager block
    # who works it
    brigada_id      = Column(Integer, index=True)
    brigada_name    = Column(String, index=True)
    # what kind of job
    category_id     = Column(Integer, index=True)
    category_name   = Column(String, index=True)
    category_urgent = Column(Boolean, nullable=True)
    category_ftime  = Column(Float, nullable=True)     # hours allowed → the derived due moment
    department      = Column(Integer, nullable=True)   # 1 = АРС, per their section split
    sphere_status   = Column(Integer, nullable=True)
    is_bot          = Column(Boolean, nullable=True)   # filed from the Telegram bot
    # when
    created_at      = Column(DateTime(timezone=True), index=True)
    started_at      = Column(DateTime(timezone=True), nullable=True)   # taken into work
    finished_at     = Column(DateTime(timezone=True), nullable=True)   # closed / denied
    # card-only fields (see detail_at)
    description     = Column(Text, nullable=True)
    deny_reason     = Column(Text, nullable=True)
    files           = Column(JSONB, nullable=True)     # [{id, url, href}]
    update_time     = Column(JSONB, nullable=True)     # {status: moment it was entered}
    comments        = Column(JSONB, nullable=True)
    comment_count   = Column(Integer, nullable=True)
    detail_at       = Column(DateTime(timezone=True), nullable=True)   # last card fetch
    raw             = Column(JSONB, nullable=True)     # the full list item
    detail_raw      = Column(JSONB, nullable=True)     # the full card
    first_seen_at   = Column(DateTime(timezone=True), server_default=func.now())
    synced_at       = Column(DateTime(timezone=True), nullable=True)   # every upsert
    missing_since   = Column(DateTime(timezone=True), nullable=True)   # completed full walk only


class ArcSyncMeta(Base):
    """Singleton row (id=1) tracking the ARC mirror: the claim that keeps two
    passes from overlapping (``running`` + ``heartbeat``; a heartbeat older
    than the stale window is a dead process's claim), the progress feed the
    page polls, and the last outcome. ``mode`` says what the last pass was —
    «quick» (first pages, every 15 min) or «full» (every page, nightly / on
    Refresh). ``status_catalog`` is the distinct statuses with counts,
    recomputed after every pass so the filter never offers a value the table
    doesn't hold. ``detail_pending`` is how many mirrored tickets still have no
    card fetched — the one number that says the mirror is still filling in."""
    __tablename__ = "arc_sync_meta"

    id              = Column(Integer, primary_key=True)
    last_synced     = Column(DateTime(timezone=True), nullable=True)
    ok              = Column(Boolean, default=True)
    message         = Column(Text, nullable=True)
    row_count       = Column(Integer, default=0)
    remote_total    = Column(Integer, default=0)
    running         = Column(Boolean, default=False, nullable=False)
    started_at      = Column(DateTime(timezone=True), nullable=True)
    heartbeat       = Column(DateTime(timezone=True), nullable=True)
    progress_done   = Column(Integer, default=0)
    progress_total  = Column(Integer, default=0)
    last_full_at    = Column(DateTime(timezone=True), nullable=True)
    mode            = Column(String, nullable=True)     # "full" | "quick"
    status_catalog  = Column(JSONB, nullable=True)      # [{status, count}]
    detail_pending  = Column(Integer, default=0)
    detail_done     = Column(Integer, default=0)        # cards fetched by the last pass


class ActionLog(Base):
    """THE register of everything that happens on this platform.

    Six partial trails existed before this one — capability uses (grant-authorised
    actions only, and it returns early for admins), the capability grant audit,
    HR document history, the ltasks config audit, concern escalations, and a
    presence heartbeat that says a person was in the app but never what they did.
    Between them, an admin uploading attendance, closing a day, restoring the
    database or revealing a browser password left no queryable trace anywhere.

    This table is the one place that answers "what happened, who did it, and what
    changed". It is APPEND-ONLY: no endpoint deletes from it, and there is no
    purge tool. At the platform's real rate (a few hundred changes a day) that is
    ~100k rows a year, which Postgres does not notice.

    Two writers feed it, deliberately:

      * ``ActionLogMiddleware`` records an AUTOMATIC row for every mutating
        HTTP request (POST/PUT/PATCH/DELETE) under /api and /admin — actor,
        category, action key, outcome, duration. Nothing has to be remembered
        for a new endpoint to be covered, which is precisely the discipline
        ``capability_uses`` lacked.
      * ``action_log.enrich()``, called from inside the handlers that know
        something the request line cannot say: the unit's NAME, the day, the
        old→new values, the operator's reason. It fills in the SAME row.
        ``enriched`` says which rows got that treatment, so a thin row is never
        displayed as if it were a rich one.

    Bot taps (``source="bot"``) and scheduled jobs (``source="system"``) call
    ``action_log.record()`` directly — they never pass through an HTTP route a
    middleware could see, and an auto-close at 09:00 is as much an action as a
    button press.

    Every label is a KEY (``category``, ``action``), never a translated string:
    the tab renders per viewer language through one 4-language table, exactly
    like the capability-use DMs. Names of people, units and targets ARE
    snapshotted — a rename must not silently rewrite what the log says happened.
    """
    __tablename__ = "action_logs"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # ── what ──────────────────────────────────────────────────────────────────
    category      = Column(String, nullable=False, index=True)   # action_log.CATEGORIES
    action        = Column(String, nullable=False, index=True)   # "attendance.day_closed"
    outcome       = Column(String, nullable=False, index=True)   # done|refused|denied|error
    source        = Column(String, nullable=False, index=True)   # telegram|web|bot|system

    # ── who ───────────────────────────────────────────────────────────────────
    # BOTH keys: the profile is the person (one person may hold two accounts),
    # the account is what actually authenticated. capability_uses keys only by
    # account, which cannot answer "everything this person did".
    actor_profile_key = Column(String, nullable=True, index=True)
    actor_telegram_id = Column(BigInteger, nullable=True, index=True)
    actor_name    = Column(String, nullable=True)                # snapshot
    actor_role    = Column(String, nullable=True)                # snapshot
    via_capability = Column(String, nullable=True)               # acted through a grant
    ghost         = Column(Boolean, nullable=False, server_default=text("false"))

    # ── on what ───────────────────────────────────────────────────────────────
    target_kind   = Column(String, nullable=True, index=True)    # day|document|profile|cell|task…
    target_id     = Column(String, nullable=True, index=True)
    target_name   = Column(String, nullable=True)                # snapshot
    unit_id       = Column(Integer, nullable=True, index=True)   # managers.id
    unit_name     = Column(String, nullable=True)                # snapshot
    day           = Column(Date, nullable=True, index=True)      # business date acted on

    # ── the detail ────────────────────────────────────────────────────────────
    details       = Column(JSONB, nullable=True)   # [[label_key, value], …]
    changes       = Column(JSONB, nullable=True)   # [[field_key, old, new], …]
    reason        = Column(Text, nullable=True)    # operator's own words
    enriched      = Column(Boolean, nullable=False, server_default=text("false"))

    # ── taken back ────────────────────────────────────────────────────────────
    # The row this one REVERSES. The register stays append-only: an undo is a
    # new action that happens to be the inverse of an old one, never an edit of
    # it. Indexed because the tab asks "was this undone" for every row of every
    # page — a JSONB scan for that answer would grow with the table forever.
    undo_of       = Column(BigInteger, nullable=True, index=True)

    # ── the request it rode in on ─────────────────────────────────────────────
    method        = Column(String, nullable=True)
    path          = Column(String, nullable=True)
    status        = Column(Integer, nullable=True)
    duration_ms   = Column(Integer, nullable=True)
    ip            = Column(String, nullable=True)
    app_version   = Column(String, nullable=True)

    __table_args__ = (
        # The register's own reading order, and the two filters that always ride
        # with it: a day of one category, and everything one person ever did.
        Index("ix_action_logs_at_desc", created_at.desc()),
        Index("ix_action_logs_cat_at", "category", created_at.desc()),
        Index("ix_action_logs_actor_at", "actor_profile_key", created_at.desc()),
    )


class LeaderDaySource(Base):
    """WHICH of the two collection layers counts for ONE (leader, day).

    The Google Form (→ `leader_checklists`) and the in-bot /tasks checklist are
    two doors onto the same daily checklist, and `leader_bot.merges()` decides
    between them by RULE — shift 2 from the bot, shift 1 from the sheet, plus
    the bounded camera-pilot exception. That rule is right for the general case
    and cannot be right for every case: a leader who filed through both doors on
    one day leaves two honest submissions, and only a person can say which of
    them is the record.

    This is that person's answer, and it is the ONLY thing that outranks the
    rule. `source` is "bot" or "sheet" — never null; clearing the choice DELETES
    the row, so "no opinion" is the absence of a record rather than a third
    value every reader would have to spell out.

    Keyed by the leader PROFILE and the day, because that pair is the register's
    own dedupe key (`get_leaders`: a bot day replaces the sheet row for the same
    `(leader_id, date)`). Keying it by bot-day id instead would lose the choice
    the moment the day was deleted and re-filed, and could never express "take
    the sheet row" for a day whose bot twin does not exist yet.

    Bounded on write, not here: an override is only accepted for a pair that
    genuinely holds BOTH submissions, so it can never point the register at a
    row that does not exist (a shift-2 day forced to "sheet" would otherwise
    vanish from every surface — that shift files only in the bot).
    """
    __tablename__ = "leader_day_sources"
    __table_args__ = (
        UniqueConstraint("leader_profile_id", "date", name="uq_leader_day_source"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    leader_profile_id = Column(Integer, nullable=False, index=True)  # role_profiles.id
    date = Column(String(10), nullable=False, index=True)            # "YYYY-MM-DD"
    source = Column(String(8), nullable=False)                       # "bot" | "sheet"
    set_by = Column(String(160), nullable=True)
    set_at = Column(DateTime, nullable=True)


class LeaderDayExclusion(Base):
    """ONE leader-day taken OUT of the results — neither a plus nor a minus.

    Every other "this day does not count" on the platform is really one of two
    other things: it scores the day 0 while the day still occupies a slot in the
    denominator (the filing-window void), or it switches WHICH layer supplies
    the number (`LeaderDaySource`, `bot_from`). Neither can express the thing an
    operator actually needs when the platform itself was at fault — a day that
    is not green, not red, and simply absent from the average, so nobody is
    rewarded or punished for a night the system got wrong.

    That is this. An excluded day leaves the numerator AND the denominator: the
    leader's mean is taken over the days that remain, their consistency counts
    neither a filing nor a miss, and the brigadir's unit mean loses that
    leader's contribution to it. Removing it from the denominator is the whole
    point — scoring it 0 was always possible and is exactly what makes an
    incident night cost the leader their month.

    Keyed by leader-day the way `LeaderLateRequest` is, through
    `leader_exclusions.key()`: the profile id when the sheet name resolved to a
    person, else the folded raw name. `leader_checklists` is wiped and reloaded
    on every sheet refresh and ~18% of its names never resolve to a profile, so
    a key built from a row id would not survive the next Refresh and a key built
    from the profile alone could never reach an unlinked leader's day.

    The `reason` is mandatory at the endpoint, not here: a score that changed
    with no button behind it is precisely the change an operator later cannot
    explain, and this one is visible to the leader it belongs to.

    Lifting an exclusion DELETES the row — "counts again" is the absence of a
    record, never a third state every reader would have to spell out.
    """
    __tablename__ = "leader_day_exclusions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # `leader_exclusions.key()` — "p<profile_id>" or "n<folded name>"
    leader_key = Column(String(200), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)            # "YYYY-MM-DD"
    # WHICH of that leader's cell-checklists this forgives, on a per-cell unit.
    # NULL = the whole leader-day, which is every exclusion recorded before
    # per-cell filing existed and every one on an un-switched unit.
    #
    # Per CELL because a per-cell day is a submission of its own: an incident
    # that cost cell 6722 its night says nothing about 6732, and forgiving both
    # would take a real filing out of the average. Excluding one is
    # arithmetically free on the client — `slotsBy` marks a date `off` only
    # when it has NO surviving slot, so the day stands on the cell that
    # counted. The «all this leader's cells» shortcut is the tab sending one
    # batch of per-cell rows, not a second kind of record.
    cell_id = Column(Integer, nullable=True, index=True)
    # Snapshotted so the register can name who was excluded even after a rename
    # or a profile deletion — the log's rule: a rename must not rewrite what the
    # record says happened.
    leader_profile_id = Column(Integer, nullable=True, index=True)
    leader_name = Column(String(160), nullable=True)
    manager_id = Column(Integer, nullable=True, index=True)          # the unit at the time
    reason = Column(Text, nullable=False)
    # What the day was worth when it was excluded, so the register can say what
    # was taken out of the average without re-deriving a score the sheet may no
    # longer hold.
    score_at = Column(Float, nullable=True)
    set_by = Column(String(160), nullable=True)
    set_at = Column(DateTime, nullable=True)

    # Expression index for the same reason `uq_ltask_day` is one: NULLs are
    # DISTINCT in a Postgres unique key, so a plain three-column constraint
    # would let one leader-day be excluded twice over. Declared after the
    # columns because it names one of them.
    __table_args__ = (
        Index("uq_leader_day_exclusion", "leader_key", "date",
              func.coalesce(cell_id, 0), unique=True),
        Index("ix_leader_day_excl_date", "date"),
    )


class LeaderCutoff(Base):
    """A leader whose results STOP COUNTING from one day on — open-ended.

    `LeaderDayExclusion` beside it answers a question about a NAMED DAY: the
    platform got that night wrong, so nobody is scored on it. This answers a
    question about a PERSON: from this date they are not a leader here any more
    — they left, they moved to another job, their unit was handed over — and
    every day from that one on is a day they were never expected to file.

    The two cannot be spelled as each other. An exclusion is one row per day and
    the future has no days in it yet, so expressing "from 21 August onwards" as
    exclusions means writing rows for days that do not exist, then writing more
    of them every morning forever — and the moment the writer stops, the person
    starts scoring 0 again with nothing on screen saying why. One record per
    decision is the only shape that keeps answering after the person who made it
    has stopped looking.

    **The date is the FLOOR and there is no ceiling.** A leader who comes back
    has their cutoff LIFTED (or moved later); a gap in the middle of a career is
    a run of day exclusions, which is exactly what that tool is for. Two dates
    here would make "is this day counted" a question with four answers, and
    every reader would have to spell all four.

    Keyed by PERSON, through `leader_cutoffs.person_key()` — the same "p<id> or
    n<folded name>" spelling `leader_exclusions.key()` puts before its date, so
    a leader who is one person to the day-exclusion tool cannot be two people to
    this one. ~18% of sheet names never resolve to a profile, and a
    profile-only key could not reach those leaders at all.

    Nothing is written onto a score. Every consumer asks this module, so lifting
    a cutoff restores every affected day everywhere at once, with no migration
    and no re-sync — the property that already makes a window edit free.
    """
    __tablename__ = "leader_cutoffs"
    __table_args__ = (
        UniqueConstraint("leader_key", name="uq_leader_cutoff"),
        Index("ix_leader_cutoff_from", "from_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    # `leader_cutoffs.person_key()` — "p<profile_id>" or "n<folded name>". The
    # uniqueness (and the index behind it) is the named constraint above; a
    # `unique=True, index=True` here as well would be three indexes on one
    # column, all answering the same question.
    leader_key = Column(String(200), nullable=False)
    # INCLUSIVE: this day and every day after it are out of the results.
    from_date = Column(String(10), nullable=False, index=True)        # "YYYY-MM-DD"
    # Snapshotted for the same reason the exclusion snapshots them — a rename or
    # a profile deletion must not rewrite what the record says happened.
    leader_profile_id = Column(Integer, nullable=True, index=True)
    leader_name = Column(String(160), nullable=True)
    manager_id = Column(Integer, nullable=True, index=True)           # the unit at the time
    reason = Column(Text, nullable=False)
    set_by = Column(String(160), nullable=True)
    set_at = Column(DateTime, nullable=True)
