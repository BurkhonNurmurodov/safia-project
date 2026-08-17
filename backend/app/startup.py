"""One-time startup tasks (idempotent)."""
from collections import defaultdict
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from app.config import settings
from app.database import SessionLocal
from app.models import (
    Admin, AppSetting, Attendance, CellPerenaladka, Comment, DayApproval,
    EditRequest, ExchangeTask, HrDocument, Language, LeaderAiReview,
    LeaderConcern, LeaderTask,
    LeaderTaskComment, Manager, RoleProfile, SheetSource,
    TelegramUser, TelegramUserRole,
)

MANAGERS = [
    (1, "Арипова Манзура", 1),
    (2, "Артикова Масуда", 1),
    (3, "Абдукаримов Санжар", 1),
    (4, "Хакимов Руслан", 1),
    (5, "Абдугамитов Мухаммад", 1),
    (6, "Сувонов Элшод", 1),
    (7, "Султонова Умида", 1),
    (8, "Максумов Санжар", 1),
    (9, "Мирмахмудова Мунира", 1),
    (10, "Рахимова Камола", 1),
    (11, "Талипова Мамура", 1),
    (12, "Эргашев Мухриддин", 2),
    (13, "Олишев Ислом", 2),
    (14, "Файзуллаева Малика", 2),
    (15, "Ёгмиров Феруз", 2),
    (16, "Ибрагимова Сайёра", 2),
    (17, "Камолова Наргиза", 2),
    (18, "Акбаров Турсунали", 2),
    (19, "Уразов Аскар", 2),
]

# Shift report («Смена отчёт, Сафия»). Replaced 2026-07-29: the previous
# workbook ("Copy of Смена отчёт, Сафия(5/9)") stopped taking submissions on
# 2026-05-26, and the new one both carries the full history from 2026-03-28 and
# reshuffles the columns — see _shift_layout in services/sheets_reader.py.
SHIFT_REPORT_SHEET_ID = "1swk6vyvlZtY2L2HPRYd9H2Lwi-A3K53B2SvLcu5rXOs"

SHEET_SOURCES = [
    ("source", "1q-4PTcnGNNsGzXmXAIa5HE2Ze0f6hQ-7dKagvHSH2eI"),
    ("shift_report", SHIFT_REPORT_SHEET_ID),
    # Quality register (complaints & non-conformances) — tab «для свода».
    ("quality", "1DtQxGyc8IByew_Hakj0HX3ZL0MigphWON8CNkjZFE3k"),
]


BACKFILL_FLAG = "day_approvals_backfilled"

BUILTIN_LANGUAGES = [
    {"code": "uz",      "name": "O‘zbekcha", "sort_order": 1},
    {"code": "uz_cyrl", "name": "Ўзбекча",   "sort_order": 2},
    {"code": "ru",      "name": "Русский",   "sort_order": 3},
    {"code": "en",      "name": "English",   "sort_order": 4},
]


def seed_languages() -> None:
    """Ensure the built-in languages exist (idempotent)."""
    db = SessionLocal()
    try:
        existing = {l.code: l for l in db.query(Language).all()}
        for lng in BUILTIN_LANGUAGES:
            row = existing.get(lng["code"])
            if row:
                row.sort_order = lng["sort_order"]   # keep ordering stable when new builtins appear
            else:
                db.add(Language(code=lng["code"], name=lng["name"],
                                is_builtin=True, sort_order=lng["sort_order"]))
        db.commit()
    except Exception as exc:  # pragma: no cover
        db.rollback()
        print(f"[startup] language seed skipped: {exc}")
    finally:
        db.close()


def backfill_day_approvals() -> None:
    """
    On first launch, mark every existing (manager, date) that already has
    worker data as APPROVED, so the dashboard stays fully populated. Guarded
    by an AppSetting flag so it runs exactly once — dates added *after* launch
    will require manual approval.
    """
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=BACKFILL_FLAG).first():
            return

        pairs = (
            db.query(Attendance.manager_id, Attendance.date)
            .filter(
                Attendance.worker_name.isnot(None),
                Attendance.worker_name.notin_(["", "nan", "NaN"]),
            )
            .distinct()
            .all()
        )

        existing = {
            (mid, d) for mid, d in db.query(DayApproval.manager_id, DayApproval.date).all()
        }

        now = datetime.now(timezone.utc)
        added = 0
        for mid, d in pairs:
            if mid is None or d is None or (mid, d) in existing:
                continue
            db.add(DayApproval(
                manager_id=mid,
                date=d,
                approved_by_name="system (backfill)",
                approved_at=now,
            ))
            added += 1

        db.add(AppSetting(key=BACKFILL_FLAG, value="1"))
        db.commit()
        print(f"[startup] backfilled {added} day approvals")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] day-approval backfill skipped: {exc}")
    finally:
        db.close()


DAY_CLOSE_FLAG = "day_close_backfilled"


def backfill_day_closures() -> None:
    """
    Rollout migration for the supervisor day-close flow: every (manager, date)
    with worker data BEFORE today starts as CLOSED, so dashboards keep showing
    history unchanged (days with still-pending requests stay hidden until those
    are processed). Days from today onward start OPEN and must be closed by
    their supervisor. Guarded by an AppSetting flag so it runs exactly once.
    """
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=DAY_CLOSE_FLAG).first():
            return

        today = date.today()
        pairs = (
            db.query(Attendance.manager_id, Attendance.date)
            .filter(
                Attendance.worker_name.isnot(None),
                Attendance.worker_name.notin_(["", "nan", "NaN"]),
                Attendance.date < today,
            )
            .distinct()
            .all()
        )
        existing = {
            (mid, d) for mid, d in db.query(DayApproval.manager_id, DayApproval.date).all()
        }

        now = datetime.now(timezone.utc)
        added = 0
        for mid, d in pairs:
            if mid is None or d is None or (mid, d) in existing:
                continue
            db.add(DayApproval(
                manager_id=mid,
                date=d,
                approved_by_name="system (rollout)",
                approved_at=now,
            ))
            added += 1

        db.add(AppSetting(key=DAY_CLOSE_FLAG, value="1"))
        db.commit()
        print(f"[startup] backfilled {added} day closures")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] day-close backfill skipped: {exc}")
    finally:
        db.close()


def add_last_seen_column() -> None:
    """Add last_seen column to telegram_users if it does not exist yet (idempotent)."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS "
            "last_seen TIMESTAMP WITH TIME ZONE"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] last_seen migration skipped: {exc}")
    finally:
        db.close()


def add_tg_name_column() -> None:
    """Add tg_name to telegram_users (idempotent). full_name mirrors the claimed
    profile name, so the actual Telegram account name (first+last) gets its own
    column — written at bot registration and refreshed on every web login."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS tg_name VARCHAR"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] tg_name migration skipped: {exc}")
    finally:
        db.close()


def add_notification_template_columns() -> None:
    """Add nkey + params columns to notifications (idempotent). They let each row
    store its template key + params so the bell can render it in the viewer's
    current language; legacy rows have NULL and fall back to the stored text."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS nkey VARCHAR"))
        db.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS params JSONB"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] notification template columns migration skipped: {exc}")
    finally:
        db.close()


def add_notification_recipient_profile() -> None:
    """Add recipient_profile to notifications (idempotent). New rows address the
    recipient's PROFILE ("role:id" canonical key) so an account holding several
    profiles sees each notification only under the profile it concerns; legacy
    NULL rows stay account-keyed via recipient_telegram_id — no backfill."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_profile VARCHAR"))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notifications_recipient_profile "
            "ON notifications (recipient_profile)"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] notification recipient_profile migration skipped: {exc}")
    finally:
        db.close()


def add_task_comment_author_ref() -> None:
    """Add author_role_ref to leader_task_comments (idempotent). Comments are
    owned by the authoring PROFILE (telegram_user_roles.id, 0 = admin), not the
    telegram account — one account can hold several profiles via role switching.
    Legacy NULL rows fall back to account-scoped ownership in routers/tasks.py."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE leader_task_comments ADD COLUMN IF NOT EXISTS author_role_ref INTEGER"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader_task_comments author_role_ref migration skipped: {exc}")
    finally:
        db.close()


def add_leader_submission_columns() -> None:
    """Add submission_id / submitted_at to leader_checklists (idempotent). The
    leaders form export now carries a «Submission ID» and a «Submission time»;
    the timestamp is what the dashboard flags late-filed checklists with. The
    table is wipe-and-reloaded, so the columns fill on the next sheet refresh."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE leader_checklists ADD COLUMN IF NOT EXISTS submission_id VARCHAR"))
        db.execute(text("ALTER TABLE leader_checklists ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader_checklists submission columns migration skipped: {exc}")
    finally:
        db.close()


def add_pp_product_op() -> None:
    """Add op («Опер.») to pp_products (idempotent). The фаза step used to be
    readable only from the day's фаза upload; a catalog line may now pin its own,
    which wins in the Positions table — so a position that is missing from (or
    spelled differently in) the upload still shows the right operation."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE pp_products ADD COLUMN IF NOT EXISTS op VARCHAR"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] pp_products op column migration skipped: {exc}")
    finally:
        db.close()


def add_attendance_supervisor_column() -> None:
    """Add is_supervisor to attendance (idempotent). Marks the unit's own
    brigadir — a row the single-file «Davomat» upload files by NAME because the
    person clocks in with no «Код подразделения» to route on. Existing rows are
    FALSE, which is right: before this the row was never written at all."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "
            "is_supervisor BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] attendance is_supervisor column migration skipped: {exc}")
    finally:
        db.close()


def backfill_supervisor_attendance() -> None:
    """Give already-uploaded days the brigadir row they never got.

    Cell-less rows have been parked in every batch since the single-file upload
    shipped — they were parsed, stored, and then dropped on the floor because
    _sync_manager routes on cell codes and they carry none. This walks the
    retained batches and inserts the matched ones, so a day that was saved
    months ago gains its brigadir without a re-upload.

    Additive ONLY. It never touches an existing row, so verifix corrections made
    since that day was uploaded survive — which is exactly why this is not just
    a re-run of _sync_manager, whose wipe-and-reproject would undo them.
    """
    from app.models import AttendanceBatch, AttendanceBatchRow
    from app.services.name_map import supervisor_match

    db = SessionLocal()
    try:
        batches = db.query(AttendanceBatch).all()
        if not batches:
            return
        # Active units only — same candidate set the live upload path uses.
        managers = db.query(Manager).filter(Manager.archived.is_(False)).all()
        added = 0
        for batch in batches:
            rows = db.query(AttendanceBatchRow).filter(
                AttendanceBatchRow.batch_id == batch.id,
                AttendanceBatchRow.verifix_code.is_(None),
            ).all()
            if not rows:
                continue
            hits = supervisor_match(managers, [r.worker_name for r in rows])
            for r in rows:
                hit = hits.get(r.worker_name)
                if not hit:
                    continue
                # Only a day this supervisor actually has saved. Inserting into
                # an unsaved day would stand a lone brigadir up as if the whole
                # unit had been uploaded.
                if not db.query(Attendance.id).filter(
                    Attendance.manager_id == hit["id"],
                    Attendance.date == batch.date,
                ).first():
                    continue
                if db.query(Attendance.id).filter(
                    Attendance.manager_id == hit["id"],
                    Attendance.date == batch.date,
                    Attendance.worker_name == r.worker_name,
                ).first():
                    continue
                db.add(Attendance(
                    manager_id=hit["id"],
                    date=batch.date,
                    worker_name=r.worker_name,
                    job_title=r.job_title,
                    schedule=r.schedule,
                    clock_in_out=r.clock_in_out,
                    hours_worked=r.hours_worked,
                    early_arrival_min=r.early_arrival_min,
                    effective_hours=r.effective_hours,
                    verifix_code=None,
                    is_supervisor=True,
                ))
                added += 1
        if added:
            db.commit()
            print(f"[startup] backfilled {added} brigadir attendance row(s)")
    except Exception as exc:
        db.rollback()
        print(f"[startup] brigadir attendance backfill skipped: {exc}")
    finally:
        db.close()


def add_downtime_ns_columns() -> None:
    """Add the «тўхтамаганда» half to downtime_data (idempotent). Every shift-report
    category is a column PAIR — the wait stopped the cell, or it did not — and only
    the "stopped" half was ever stored. These columns hold the other half, which the
    Ojidaniya page shows in its second tab. Existing rows stay 0 until the next
    shift-report sync (that sync wipes and reloads the table wholesale)."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE downtime_data ADD COLUMN IF NOT EXISTS total_minutes_ns NUMERIC(10, 4) DEFAULT 0.0"))
        db.execute(text("ALTER TABLE downtime_data ADD COLUMN IF NOT EXISTS by_category_ns JSONB DEFAULT '{}'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] downtime not-stopped columns migration skipped: {exc}")
    finally:
        db.close()


def add_broadcast_rich_columns() -> None:
    """Add mode / media_names to broadcasts (idempotent). Rich broadcasts
    (sendRichMessage, Bot API 10.1+) record mode='rich' and the embedded media
    file names; pre-existing rows default to the classic 'normal' path."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS mode VARCHAR NOT NULL DEFAULT 'normal'"))
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_names JSONB NOT NULL DEFAULT '[]'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] broadcasts rich columns migration skipped: {exc}")
    finally:
        db.close()


def add_broadcast_resume_columns() -> None:
    """Resumable-broadcast columns (idempotent). Passenger recycles app
    processes within seconds, killing the broadcast fan-out thread mid-run, so
    the sender persists the resolved recipient list plus a cursor and a worker
    heartbeat (claimed_at); any later process claims a stale 'sending' row and
    continues from the cursor (routers/broadcast.py resume_stuck_broadcasts)."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recipients JSONB"))
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS send_cursor INTEGER NOT NULL DEFAULT 0"))
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS attachment_file_id VARCHAR"))
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_specs JSONB"))
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] broadcasts resume columns migration skipped: {exc}")
    finally:
        db.close()


def add_broadcast_failures_column() -> None:
    """Per-recipient failure detail (idempotent). failed_names records WHO did
    not get the message; this records WHY, which is what tells an admin whether
    a retry can achieve anything — a user who blocked the bot fails identically
    on every retry, a flood-wait or a network blip does not. Rows sent before
    the column exists stay NULL and render as "—"."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS failures JSONB"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] broadcasts failures column migration skipped: {exc}")
    finally:
        db.close()


def add_broadcast_schedule_column() -> None:
    """Deferred-send column (idempotent). A scheduled broadcast is a normal,
    fully-resolved row parked at status 'scheduled' until scheduled_at; the
    timer that fires it is rebuilt from this column at every boot
    (routers/broadcast.py register_scheduled_broadcasts), so the send survives
    a restart or a deploy between composing and sending."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ"))
        # Partial index: the boot sweep and the 5-minute safety net both ask
        # exactly this question, and the table grows one row per broadcast
        # forever while pending rows stay a handful.
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_broadcasts_scheduled "
                        "ON broadcasts (scheduled_at) WHERE status = 'scheduled'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] broadcasts schedule column migration skipped: {exc}")
    finally:
        db.close()


def add_admin_language_column() -> None:
    """Add a language column to admins (idempotent). Seeded admins have no
    telegram_users row, so this is where their bot-DM language is stored, kept in
    sync with the dashboard via POST /api/auth/language (see staff._get_user_lang)."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE admins ADD COLUMN IF NOT EXISTS language VARCHAR DEFAULT 'uz'"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] admin language column migration skipped: {exc}")
    finally:
        db.close()


def add_profiles_columns() -> None:
    """Pre-created-profiles rollout columns (idempotent): managers.archived
    (units with history are archived, not deleted) and admins.profile_id
    (which admin RoleProfile the account claimed via /adminreg)."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE managers ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        db.execute(text("ALTER TABLE admins ADD COLUMN IF NOT EXISTS profile_id INTEGER"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] profiles columns migration skipped: {exc}")
    finally:
        db.close()


def migrate_cells_table() -> None:
    """Cells become first-class rows: `cells` (code UNIQUE, leader_id →
    role_profiles.id), one row per Verifix cell code — a leader can own several.
    Splits the old comma-joined role_profiles.cell strings into rows, then
    drops the column. Idempotent: the backfill+drop only run while the old
    column still exists; the table itself comes from Base.metadata.create_all."""
    db = SessionLocal()
    try:
        old_col = db.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='role_profiles' AND column_name='cell'"
        )).first()
        if old_col:
            rows = db.execute(text(
                "SELECT id, cell FROM role_profiles "
                "WHERE role='leader' AND cell IS NOT NULL"
            )).all()
            for pid, cell in rows:
                for code in {c.strip() for c in (cell or "").split(",") if c.strip()}:
                    db.execute(text(
                        "INSERT INTO cells (code, leader_id) VALUES (:c, :l) "
                        "ON CONFLICT (code) DO NOTHING"
                    ), {"c": code, "l": pid})
            db.execute(text("ALTER TABLE role_profiles DROP COLUMN cell"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] cells table migration skipped: {exc}")
    finally:
        db.close()


def migrate_cells_leaders_columns() -> None:
    """2026-07-23 cells/leaders model: cells.code becomes verifix_code and the
    table gains nullable sap_code + per-language workshop names; role_profiles
    gain nullable per-language name columns (`name` stays canonical uz-Latin).
    Leader name columns backfill once from any existing name.{canonical}
    translation overrides. Idempotent; runs after migrate_cells_table."""
    db = SessionLocal()
    try:
        old_col = db.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='cells' AND column_name='code'"
        )).first()
        if old_col:
            db.execute(text("ALTER TABLE cells RENAME COLUMN code TO verifix_code"))
        for col in ("sap_code", "name_workshop_uz", "name_workshop_uz_cyrl",
                    "name_workshop_ru", "name_workshop_en"):
            db.execute(text(f"ALTER TABLE cells ADD COLUMN IF NOT EXISTS {col} VARCHAR"))
        for col in ("name_uz_cyrl", "name_ru", "name_en"):
            db.execute(text(f"ALTER TABLE role_profiles ADD COLUMN IF NOT EXISTS {col} VARCHAR"))
        for col, lang in (("name_uz_cyrl", "uz_cyrl"), ("name_ru", "ru"), ("name_en", "en")):
            db.execute(text(
                f"UPDATE role_profiles p SET {col} = t.value FROM translations t "
                f"WHERE p.{col} IS NULL AND t.lang = :lang "
                f"AND t.key = 'name.' || p.name AND t.value <> ''"
            ), {"lang": lang})
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] cells/leaders columns migration skipped: {exc}")
    finally:
        db.close()


def migrate_cell_ojidaniya_percat() -> None:
    """TEST-table redesign (2026-07-28): cell_ojidaniya moved from one JSONB row
    per (cell,date,shift) to one row per (cell,date,category) with a per-category
    required note. The table only ever held manual TEST entries (never the sheets
    pipeline), so a legacy-schema table is dropped and rebuilt. Idempotent."""
    from sqlalchemy import inspect as sa_inspect
    from app.database import engine
    from app.models import CellOjidaniya
    insp = sa_inspect(engine)
    if "cell_ojidaniya" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("cell_ojidaniya")}
        if "category" not in cols:  # legacy JSONB schema → rebuild
            db = SessionLocal()
            try:
                db.execute(text("DROP TABLE cell_ojidaniya"))
                db.commit()
            finally:
                db.close()
    CellOjidaniya.__table__.create(bind=engine, checkfirst=True)


def migrate_cell_perenaladka() -> None:
    """2026-08-01: the «Perenaladka» tab of the idle-cell TEST page — one
    changeover-minutes row per (cell, date). New table only, no data to move."""
    from app.database import engine
    from app.models import CellPerenaladka
    CellPerenaladka.__table__.create(bind=engine, checkfirst=True)


def migrate_cell_supervisor_column() -> None:
    """2026-07-27: cells gain a direct supervisor link (manager_id → managers.id,
    nullable). A cell now belongs to a supervisor independently of its leader —
    leaderless cells can still name their owning unit, and going forward the
    leader is optional. Existing rows backfill their supervisor from the owning
    leader's unit (role_profiles.manager_id); leaderless rows stay NULL until an
    admin sets one. Idempotent; runs after migrate_cells_leaders_columns."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE cells ADD COLUMN IF NOT EXISTS manager_id INTEGER"))
        # Backfill only rows without a supervisor yet, from their leader's unit.
        db.execute(text(
            "UPDATE cells c SET manager_id = p.manager_id "
            "FROM role_profiles p "
            "WHERE c.leader_id = p.id AND c.manager_id IS NULL "
            "AND p.manager_id IS NOT NULL"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] cell supervisor column migration skipped: {exc}")
    finally:
        db.close()


def migrate_cell_in_load_column() -> None:
    """2026-07-31: «counts in загрузка» becomes an explicit per-cell flag instead
    of being derived from "the cell has a supervisor". Every existing row starts
    FALSE by deliberate choice — the admin ticks the cells that belong in the
    load one at a time on /cells/:id, rather than inheriting a set nobody chose.
    Idempotent; runs after migrate_cell_supervisor_column."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE cells ADD COLUMN IF NOT EXISTS in_load BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] cell in_load column migration skipped: {exc}")
    finally:
        db.close()


DEFAULT_FACTORY_SETTING = "default_factory_id"
FACTORY_ALL_TAB_SETTING = "factory_all_tab_enabled"


def migrate_factories() -> None:
    """2026-08-07: the plant dimension. ``factories`` itself comes from
    Base.metadata.create_all; this adds the supervisor→factory link and seeds
    the first plant.

    Every existing supervisor is put in ONE seeded factory rather than left
    NULL. That is the only migration that preserves today's numbers: an
    unassigned unit shows up solely on the «All factories» tab, so leaving the
    existing units NULL would empty every real factory tab on the day this
    ships. New units created afterwards start NULL on purpose — see Manager.

    The seeded factory also becomes the global default tab. Idempotent."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE managers ADD COLUMN IF NOT EXISTS factory_id INTEGER "
            "REFERENCES factories(id)"))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_managers_factory_id ON managers (factory_id)"))
        db.commit()

        row = db.execute(text("SELECT id FROM factories ORDER BY id LIMIT 1")).first()
        if row is None:
            db.execute(text(
                "INSERT INTO factories (code, name_uz, name_uz_cyrl, name_ru, name_en, "
                "sort_order, archived) VALUES "
                "('SAFIA', 'Safia', 'Сафия', 'Сафия', 'Safia', 0, FALSE)"))
            db.commit()
            row = db.execute(text("SELECT id FROM factories ORDER BY id LIMIT 1")).first()
        first_id = row[0] if row else None
        if first_id is None:
            return

        # Attach every supervisor that has never been assigned. Runs once in
        # practice; on later boots the UPDATE matches nothing.
        db.execute(text("UPDATE managers SET factory_id = :fid WHERE factory_id IS NULL"),
                   {"fid": first_id})
        db.commit()

        if not db.query(AppSetting).filter_by(key=DEFAULT_FACTORY_SETTING).first():
            db.add(AppSetting(key=DEFAULT_FACTORY_SETTING, value=str(first_id)))
            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] factories migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_criteria() -> None:
    """2026-08-05: the AI proof reviewer needs a written "what makes this task
    truly done" to judge a photo against. It rides the SAME global → supervisor
    → leader chain as name/weight/min_media, so all three config tables get the
    column; NULL means inherit the level above. Blank everywhere ⇒ the task is
    simply not reviewed. Idempotent."""
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS criteria TEXT"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task criteria migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_windows() -> None:
    """2026-08-14: a proof photo's allowed clock becomes PER TASK.

    Until now the reviewer judged every photo against one window per shift, and
    shift 2's opened at 21:00 — four hours after the crew actually starts at
    17:00 — so every correct 17:00–21:00 photo was date-flagged. The window now
    rides the same global → supervisor → leader chain as criteria/name/weight;
    NULL at every level = the shift default (leader_ai.SHIFT_WINDOW). Each end
    is independent, so a task may narrow only its open or only its close.

    Idempotent. `sync_leader_ai_dates()` re-derives the verdicts already
    written against the old window — see there for why that needs no Gemini
    call."""
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            for col in ("win_from", "win_to"):
                db.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} VARCHAR(5)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task window migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_deadlines() -> None:
    """2026-08-15: each checklist task gets a submission DEADLINE ("HH:MM"),
    on the same global → supervisor → leader chain as the photo window — the
    time the /leaders «Vazifalar» tab tells the leader the task is due by.

    Informational only: nothing scores or flags against it (a bot entry is
    still judged solely by the day's filing window). NULL at every level ⇒ the
    tab shows the day's filing deadline instead, marked as the day's. Idempotent.
    """
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS deadline VARCHAR(5)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task deadline migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_date_check() -> None:
    """2026-08-17: a task may declare that its proof does not need a DATE.

    Some proofs are screens that carry no clock — an in-app checklist, a printed
    system report — and for those the date question had only two outcomes, both
    wrong: reject every honest filing, or leave a flag nobody may act on. The
    answer now rides the same global → supervisor → leader chain as the photo
    window: NULL at an override level = inherit, and TRUE at the global level is
    what the platform did before this existed, so nothing changes until an admin
    unticks a task.

    Idempotent. The columns are added nullable (that is all
    `ADD COLUMN IF NOT EXISTS` can do without rewriting the table), then the
    GLOBAL level is filled in, because that one is the chain's floor and a NULL
    there would mean "inherit" with nothing left to inherit from.
    `leader_ai.resolve_date_check` reads NULL as "checked" regardless, so a box
    that never ran this still behaves exactly as before.
    """
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS date_check BOOLEAN"))
        db.execute(text(
            "UPDATE leader_task_defs SET date_check = TRUE WHERE date_check IS NULL"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task date-check migration skipped: {exc}")
    finally:
        db.close()


def add_leader_ai_clocks() -> None:
    """2026-08-14: the model stops judging the date and starts transcribing it.

    `clocks` holds one entry per proof photo — {raw, month, day, time, source} —
    which is what lets the backend own the date verdict: the window comparison
    runs on stored numbers, so changing a window re-decides every affected
    report with no AI call. Verdicts written before the column existed are
    backfilled by parsing their free-text `image_date`; one that will not parse
    becomes an entry with month/day 0, i.e. «day unconfirmed» (user's ruling),
    NOT an empty list — empty means no clock was visible at all.

    Idempotent: only rows still holding the default empty list are backfilled."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE leader_ai_reviews "
                        "ADD COLUMN IF NOT EXISTS clocks JSONB NOT NULL DEFAULT '[]'::jsonb"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader-ai clocks migration skipped: {exc}")
        db.close()
        return
    try:
        from .models import LeaderAiReview
        from .services.leader_ai import clocks_from_text
        rows = (db.query(LeaderAiReview)
                .filter(LeaderAiReview.reviewed_at.isnot(None),
                        LeaderAiReview.image_date.isnot(None))
                .all())
        n = 0
        for rev in rows:
            if rev.clocks:
                continue
            got = clocks_from_text(rev.image_date)
            if got:
                rev.clocks = got
                n += 1
        if n:
            db.commit()
            print(f"[startup] leader-ai: backfilled clocks for {n} verdict(s)")
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader-ai clocks backfill skipped: {exc}")
    finally:
        db.close()


def sync_leader_ai_dates() -> None:
    """2026-08-14: bring every written verdict's DATE flags in line with the
    windows in force now. Free — it re-reads the clocks each verdict stored, so
    there is no image fetch, no Gemini call and no quota.

    Runs at every boot (and from the window-edit, Refresh and overview paths):
    the date verdict is derived data, and this is what keeps the derivation and
    the stored copy the same thing. See services/leader_ai.sync_date_flags."""
    db = SessionLocal()
    try:
        from .services.leader_ai import sync_date_flags
        n = sync_date_flags(db)
        if n:
            print(f"[startup] leader-ai: {n} verdict(s) re-judged against the current window")
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader-ai date sync skipped: {exc}")
    finally:
        db.close()


def add_leader_ai_resolution() -> None:
    """2026-08-10: an AI flag gains a terminal state.

    Until now a verdict was write-once and read-forever: nothing recorded that a
    human had looked at it, so the admin re-read the same flags every session and
    the "N suspect" counter only ever grew. These four columns turn the flag list
    into a queue that empties — and `resolution='rejected'` is what lets a bad
    proof actually cost the day its points (routers/leaders.py). Idempotent; the
    index matters because every queue read filters on `resolution IS NULL`."""
    db = SessionLocal()
    try:
        for ddl in (
            "ALTER TABLE leader_ai_reviews ADD COLUMN IF NOT EXISTS resolution VARCHAR(12)",
            "ALTER TABLE leader_ai_reviews ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(160)",
            "ALTER TABLE leader_ai_reviews ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ",
            "ALTER TABLE leader_ai_reviews ADD COLUMN IF NOT EXISTS resolution_note TEXT",
            "CREATE INDEX IF NOT EXISTS ix_leader_ai_reviews_resolution "
            "ON leader_ai_reviews (resolution)",
        ):
            db.execute(text(ddl))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader-ai resolution migration skipped: {exc}")
    finally:
        db.close()


def migrate_attendance_batches() -> None:
    """2026-08-01: the single-file «Davomat» upload.

    Two additive columns — `attendance.verifix_code` (which cell a row came
    from; NULL on every historical row written by the per-supervisor verifix
    path) and `cells.att_included` (the permanent form of the tab's per-cell
    checkbox; NULL means "derive it from whether the cell has a supervisor").
    The three `attendance_batch*` tables come from `Base.metadata.create_all`,
    which both entrypoints already run. Idempotent."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS verifix_code VARCHAR"
        ))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_attendance_verifix_code "
            "ON attendance (verifix_code)"
        ))
        db.execute(text(
            "ALTER TABLE cells ADD COLUMN IF NOT EXISTS att_included BOOLEAN"
        ))
        # 2026-08-01 (same day, before first production use): a date is fed by
        # SEVERAL files, one per «Орг. единица» group, so uploads MERGE instead
        # of replacing. Per-file provenance + per-cell pending tracking.
        for stmt in (
            "ALTER TABLE attendance_batch_cells ADD COLUMN IF NOT EXISTS upload_id INTEGER",
            "ALTER TABLE attendance_batch_cells ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE attendance_batch_cells ADD COLUMN IF NOT EXISTS prev_manager_id INTEGER",
            "ALTER TABLE attendance_batch_rows ADD COLUMN IF NOT EXISTS upload_id INTEGER",
            "ALTER TABLE attendance_batch_rows ADD COLUMN IF NOT EXISTS file_values JSONB",
            "CREATE INDEX IF NOT EXISTS ix_att_batch_cells_upload ON attendance_batch_cells (upload_id)",
            "CREATE INDEX IF NOT EXISTS ix_att_batch_rows_upload ON attendance_batch_rows (upload_id)",
        ):
            db.execute(text(stmt))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] attendance batch migration skipped: {exc}")
    finally:
        db.close()


def add_concern_profile_columns() -> None:
    """Concerns re-key (shift-manager/supervisor rollout): a concern is owned by
    the leader's pre-created profile so it can be logged for a leader who hasn't
    registered yet. Adds leader_concerns.leader_profile_id and relaxes
    leader_role_ref to NULL (unclaimed profiles have no role row)."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS leader_profile_id INTEGER"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ALTER COLUMN leader_role_ref DROP NOT NULL"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern profile columns migration skipped: {exc}")
    finally:
        db.close()


def add_concern_shift_manager() -> None:
    """Concerns can now be created/held directly at the shift-manager level with
    a specific shift-manager attached (parallel to top_manager_*), so the
    supervisor→shift-manager step and admin/supervisor seeding name a person.
    Best-effort add of the two columns."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS shift_manager_profile_id INTEGER"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS shift_manager_name VARCHAR"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern shift_manager migration skipped: {exc}")
    finally:
        db.close()


def add_concern_category() -> None:
    """Concerns now carry a department ``category`` (fixed whitelist) and are
    keyed to a leader's production ``cell`` (reusing the pre-existing cell_code
    column). Best-effort add of the category column; cell_code already exists."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS category VARCHAR"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern category migration skipped: {exc}")
    finally:
        db.close()


def add_concern_done_at() -> None:
    """Concerns "время выполнения" column: done_at is the exact moment a concern
    flipped to done (completion_date is only day-grained, so minutes need a real
    timestamp). Best-effort backfill for already-done rows: when the last edit
    landed on the completion day it almost certainly WAS the done-flip, so reuse
    updated_at; anything else stays NULL and renders as "—"."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ"
        ))
        db.execute(text(
            "UPDATE leader_concerns SET done_at = updated_at "
            "WHERE done_at IS NULL AND status = 'done' "
            "AND completion_date IS NOT NULL AND updated_at::date = completion_date"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern done_at migration skipped: {exc}")
    finally:
        db.close()


def add_dm_reachability_columns() -> None:
    """Per-account "can the bot reach this person" state. A DM Telegram refuses
    permanently (never started the bot, blocked it, deleted account) used to be
    swallowed into the server log; these two columns carry it to the Profiles
    tab, where an admin can see WHY someone says they got no notification."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS dm_failed_at TIMESTAMPTZ"
        ))
        db.execute(text(
            "ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS dm_error VARCHAR"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] dm reachability columns migration skipped: {exc}")
    finally:
        db.close()


def backfill_concern_units() -> None:
    """Anchor concerns raised by an admin or a shift-manager to the unit of the
    cell they are about.

    Those two roles don't sit on a unit, so creation left brigadir_manager_id
    NULL — and that column is what puts a concern in front of the cell's
    brigadir (the supervisor scope filter), inside a factory, and on the
    receiving end of a step down to the supervisor level. The rows were
    therefore invisible to the very person running the cell. Creation now
    stamps it; this fills in the rows written before that. Resolution matches
    _cell_manager_id: the cell's leader's unit, else the cell's own unit."""
    db = SessionLocal()
    try:
        db.execute(text(
            "UPDATE leader_concerns lc "
            "SET brigadir_manager_id = m.id, "
            "    brigadir_name = COALESCE(lc.brigadir_name, m.name) "
            "FROM cells c "
            "LEFT JOIN role_profiles rp ON rp.id = c.leader_id AND rp.role = 'leader' "
            "JOIN managers m ON m.id = COALESCE(rp.manager_id, c.manager_id) "
            "WHERE lc.brigadir_manager_id IS NULL "
            "  AND lc.cell_code IS NOT NULL "
            "  AND btrim(lc.cell_code) = c.verifix_code"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern unit backfill skipped: {exc}")
    finally:
        db.close()


def add_concern_level_columns() -> None:
    """Concern escalation rollout: ``level`` is who currently holds the concern
    (leader → supervisor → shift-manager → top-manager; every existing row is a
    leader-level concern), plus the person-specific top-management assignment.
    The concern_escalations history table itself comes from create_all."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS "
            "level VARCHAR NOT NULL DEFAULT 'leader'"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS top_manager_profile_id INTEGER"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS top_manager_name VARCHAR"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern level columns migration skipped: {exc}")
    finally:
        db.close()


def backfill_concern_profiles() -> None:
    """Point every legacy concern (keyed only by the leader's role row) at the
    leader's profile: role row → (unit, canonical name) → role_profiles.
    Idempotent — only touches rows with a NULL profile; rows without a profile
    match keep working through the leader_role_ref fallback in the concerns
    scope filters."""
    db = SessionLocal()
    try:
        rows = (
            db.query(LeaderConcern)
            .filter(LeaderConcern.leader_profile_id.is_(None),
                    LeaderConcern.leader_role_ref.isnot(None))
            .all()
        )
        if not rows:
            return
        refs = {r.leader_role_ref for r in rows}
        role_rows = {
            t.id: t for t in
            db.query(TelegramUserRole).filter(TelegramUserRole.id.in_(refs)).all()
        }
        profiles = {
            (p.manager_id, p.name): p.id
            for p in db.query(RoleProfile).filter_by(role="leader").all()
        }
        moved = 0
        for c in rows:
            role_row = role_rows.get(c.leader_role_ref)
            if not role_row:
                continue
            pid = profiles.get((role_row.role_id, role_row.full_name))
            if pid:
                c.leader_profile_id = pid
                moved += 1
        if moved:
            db.commit()
            print(f"[startup] backfilled {moved} concern(s) onto leader profiles")
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern profile backfill skipped: {exc}")
    finally:
        db.close()


def add_concern_owner_columns() -> None:
    """Owner-column rollout: the Owner is the concern's CREATOR, keyed by their
    profile identity (owner_role + owner_profile_id — role_profiles.id, or
    managers.id for supervisors) and resolved to the current profile name at
    view time. Also pins "supervisor" as the level a concern OPENS at.

    The one-shot ``UPDATE … SET level='supervisor' WHERE level='leader'`` that
    shipped with this migration is gone: it ran on every boot, and the leader
    step is a live chain level again (a supervisor sends a concern down to their
    leader), so re-running it would silently pull every handed-down concern back
    up on the next restart. The 2026-07 rows it was written for were migrated
    long ago."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS owner_role VARCHAR"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS owner_profile_id INTEGER"
        ))
        db.execute(text(
            "ALTER TABLE leader_concerns ALTER COLUMN level SET DEFAULT 'supervisor'"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern owner columns migration skipped: {exc}")
    finally:
        db.close()


def backfill_concern_owner() -> None:
    """Give legacy concerns (typed free-text owner, creator only as a telegram
    id) a profile-keyed owner where it can be resolved safely, preferring the
    roles the creator plausibly acted in ON THIS concern: the concern's own
    leader first, then the unit's approved supervisor, then a shift-manager
    role row, then an admin profile. Unresolvable rows stay NULL and keep
    rendering their typed owner text (without a position). Idempotent."""
    db = SessionLocal()
    try:
        rows = (
            db.query(LeaderConcern)
            .filter(LeaderConcern.owner_role.is_(None),
                    LeaderConcern.created_by.isnot(None))
            .all()
        )
        if not rows:
            return
        # telegram_id of whoever claimed each leader profile: profile (unit,
        # name) ←→ approved leader role row (role_id = unit, full_name = name).
        leader_profiles = {
            p.id: (p.manager_id, p.name)
            for p in db.query(RoleProfile).filter_by(role="leader").all()
        }
        leader_claims = {
            (r.role_id, r.full_name): r.telegram_id
            for r in db.query(TelegramUserRole).filter_by(role="leader", status="approved").all()
        }
        leader_refs = {
            r.id: r.telegram_id
            for r in db.query(TelegramUserRole).filter_by(role="leader").all()
        }
        sup_claims = {
            (r.role_id, r.telegram_id)
            for r in db.query(TelegramUserRole).filter_by(role="supervisor", status="approved").all()
        }
        sm_claims = {
            r.telegram_id: r.role_id
            for r in db.query(TelegramUserRole).filter_by(role="shift-manager", status="approved").all()
        }
        admin_profiles = {
            a.telegram_id: a.profile_id
            for a in db.query(Admin).all() if a.profile_id
        }
        moved = 0
        for c in rows:
            tg = c.created_by
            owner = None
            # 1 ─ the concern's own leader wrote it on themselves
            prof_key = leader_profiles.get(c.leader_profile_id)
            if prof_key and leader_claims.get(prof_key) == tg:
                owner = ("leader", c.leader_profile_id)
            elif c.leader_role_ref and leader_refs.get(c.leader_role_ref) == tg:
                owner = ("leader", c.leader_profile_id)
            # 2 ─ the unit's supervisor logged it for their leader
            elif c.brigadir_manager_id and (c.brigadir_manager_id, tg) in sup_claims:
                owner = ("supervisor", c.brigadir_manager_id)
            # 3 ─ a shift-manager
            elif tg in sm_claims:
                owner = ("shift-manager", sm_claims[tg])
            # 4 ─ an admin
            elif tg in admin_profiles:
                owner = ("admin", admin_profiles[tg])
            if owner and owner[1]:
                c.owner_role, c.owner_profile_id = owner
                moved += 1
        if moved:
            db.commit()
            print(f"[startup] backfilled {moved} concern owner(s) onto profiles")
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern owner backfill skipped: {exc}")
    finally:
        db.close()


def add_edit_requests_batch_id() -> None:
    """Add batch_id column to edit_requests if it does not exist yet (idempotent)."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE edit_requests ADD COLUMN IF NOT EXISTS batch_id VARCHAR"
        ))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_edit_requests_batch_id ON edit_requests (batch_id)"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] batch_id migration skipped: {exc}")
    finally:
        db.close()


DELETION_BATCH_FLAG = "deletion_batch_ids_backfilled"


def backfill_deletion_batch_ids() -> None:
    """
    Group legacy deletion EditRequests (batch_id IS NULL) into per-action
    batches so they render as one row in the Requests tab. Rows inserted by
    one request share the same transaction timestamp (Postgres now()), so
    (manager_id, date, created_at) identifies the original bulk action.
    Guarded by an AppSetting flag so it runs exactly once.
    """
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=DELETION_BATCH_FLAG).first():
            return

        rows = (
            db.query(EditRequest)
            .filter(
                EditRequest.batch_id.is_(None),
                EditRequest.changes["_action"].astext == "delete",
            )
            .all()
        )

        groups: dict = defaultdict(list)
        for r in rows:
            groups[(r.manager_id, r.date, r.created_at)].append(r)

        updated = 0
        for reqs in groups.values():
            if len(reqs) < 2:
                continue  # solo rows render identically with or without batch_id
            bid = str(uuid4())
            for r in reqs:
                r.batch_id = bid
            updated += len(reqs)

        db.add(AppSetting(key=DELETION_BATCH_FLAG, value="1"))
        db.commit()
        print(f"[startup] grouped {updated} legacy deletion requests into batches")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] deletion batch backfill skipped: {exc}")
    finally:
        db.close()


EXCHANGE_TASKS_SEEDED_FLAG = "exchange_tasks_seeded"


def seed_exchange_tasks() -> None:
    """Carry the old per-day task names (collected from existing people_exchange
    documents) into the permanent exchange_tasks list, so making tasks permanent
    does not lose any task the team already uses. Flag-guarded so it runs exactly
    once — a task an admin later removes must not be resurrected on the next boot."""
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=EXCHANGE_TASKS_SEEDED_FLAG).first():
            return

        rows = db.query(HrDocument).filter(HrDocument.doc_type == "people_exchange").all()
        names = sorted({
            (r.payload or {}).get("task_name")
            for r in rows
            if (r.payload or {}).get("target_type") == "task" and (r.payload or {}).get("task_name")
        })

        existing = {t.name for t in db.query(ExchangeTask).all()}
        added = 0
        for name in names:
            if name and name not in existing:
                db.add(ExchangeTask(name=name, active=True))
                added += 1

        db.add(AppSetting(key=EXCHANGE_TASKS_SEEDED_FLAG, value="1"))
        db.commit()
        print(f"[startup] seeded {added} exchange task(s) from existing documents")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] exchange task seed skipped: {exc}")
    finally:
        db.close()


MULTI_ROLE_FLAG = "multi_roles_backfilled"


def migrate_multi_roles() -> None:
    """Multi-role rollout: add the new columns (idempotent) and copy each
    telegram_users row's single role into telegram_user_roles, pointing
    active_role_ref at it. The backfill is flag-guarded so it runs once."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS active_role_ref INTEGER"
        ))
        db.execute(text(
            "ALTER TABLE registration_notices ADD COLUMN IF NOT EXISTS role_ref INTEGER"
        ))
        db.commit()

        if db.query(AppSetting).filter_by(key=MULTI_ROLE_FLAG).first():
            return

        migrated = 0
        for u in db.query(TelegramUser).all():
            if not u.role:
                continue
            exists = db.query(TelegramUserRole).filter_by(
                telegram_id=u.telegram_id, role=u.role, role_id=u.role_id,
            ).first()
            if exists:
                role_row = exists
            else:
                role_row = TelegramUserRole(
                    telegram_id=u.telegram_id,
                    role=u.role,
                    role_id=u.role_id,
                    full_name=u.full_name,
                    status=u.status or "pending",
                    created_at=u.created_at,
                    approved_at=u.approved_at,
                )
                db.add(role_row)
                db.flush()
                migrated += 1
            if not u.active_role_ref:
                u.active_role_ref = role_row.id

        db.add(AppSetting(key=MULTI_ROLE_FLAG, value="1"))
        db.commit()
        print(f"[startup] migrated {migrated} user(s) to telegram_user_roles")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] multi-role migration skipped: {exc}")
    finally:
        db.close()


def migrate_leader_role_uniqueness() -> None:
    """Re-key the registrations table off (telegram_id, role, role_id).

    That key is wrong for leaders — their role_id is the UNIT, shared by every
    leader profile in it — so ``uq_user_role_instance`` let one Telegram account
    hold exactly ONE leader profile per unit. A person claiming a second leader
    profile under the same brigadir got "already approved" from the bot and no
    row, and the admin grant path hit an IntegrityError on the insert; either
    way the profile never reached the account's profile switcher.

    Uniqueness now follows the claimed PROFILE for leaders and stays on
    (role, role_id) for every other role, whose role_id already IS the profile.
    Idempotent, and atomic: if the new indexes cannot be built (a duplicate this
    was protecting against) the old constraint is rolled back into place rather
    than left dropped."""
    db = SessionLocal()
    try:
        # create_all builds it as a table CONSTRAINT; a hand-made copy on an
        # older DB may be a plain unique INDEX. Drop whichever exists.
        db.execute(text("ALTER TABLE telegram_user_roles "
                        "DROP CONSTRAINT IF EXISTS uq_user_role_instance"))
        db.execute(text("DROP INDEX IF EXISTS uq_user_role_instance"))
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role_instance_nonleader "
            "ON telegram_user_roles (telegram_id, role, role_id) "
            "WHERE role <> 'leader'"
        ))
        # Unstamped legacy leader rows stay unconstrained here — they were filed
        # under the old constraint, so no unit can hold two of them anyway.
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role_leader_profile "
            "ON telegram_user_roles (telegram_id, profile_key) "
            "WHERE role = 'leader' AND profile_key IS NOT NULL"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader role uniqueness migration skipped: {exc}")
    finally:
        db.close()


LEADER_PAGE_ACCESS_FLAG = "leader_page_access_backfilled"


def backfill_leader_page_access() -> None:
    """The ``leader`` role was added to TOGGLEABLE_ROLES/DEFAULT_PAGE_ACCESS after
    the page-access matrix (app_settings.page_access) had already been saved. Since
    get_page_access lets the stored per-page lists shadow the code defaults
    (``stored.get(page, DEFAULT_PAGE_ACCESS[page])``), a stored matrix that predates
    leader leaves it with zero pages — every leader then dead-ends on the NoAccess
    screen instead of landing on zagruzka/concerns.

    This one-time, flag-guarded backfill re-adds leader to the pages
    DEFAULT_PAGE_ACCESS grants it, but only where the stored matrix already lists
    that page (i.e. shadows the default) and only when leader is absent from the
    whole matrix (proof it predates the role). Pages the admin never configured
    still fall back to defaults, so they're left untouched; once this runs, admins
    fully own leader's access via the Access tab (a deliberate later uncheck is
    preserved because the flag stops this from running again)."""
    import json
    from app.permissions import SETTING_KEY, DEFAULT_PAGE_ACCESS, PAGE_KEYS

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=LEADER_PAGE_ACCESS_FLAG).first():
            return

        row = db.query(AppSetting).filter_by(key=SETTING_KEY).first()
        # No stored matrix → code defaults already grant leader its pages; nothing
        # to fix. A stored matrix is what shadows the defaults.
        if row:
            try:
                stored = json.loads(row.value)
            except (ValueError, TypeError):
                stored = {}
            if not isinstance(stored, dict):
                stored = {}

            present = {
                r for roles in stored.values()
                if isinstance(roles, list) for r in roles
            }
            if "leader" not in present:
                changed = False
                for page in PAGE_KEYS:
                    if (
                        "leader" in DEFAULT_PAGE_ACCESS.get(page, [])
                        and isinstance(stored.get(page), list)
                        and "leader" not in stored[page]
                    ):
                        stored[page] = stored[page] + ["leader"]
                        changed = True
                if changed:
                    row.value = json.dumps(stored)
                    db.commit()
                    print("[startup] backfilled leader into stored page-access matrix")

        db.add(AppSetting(key=LEADER_PAGE_ACCESS_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] leader page-access backfill skipped: {exc}")
    finally:
        db.close()


def seed_admins() -> None:
    """Seed the admins table from ADMIN_TELEGRAM_ID (comma-separated) the
    first time — i.e. only while the table is empty. Once seeded, admins are
    managed in the DB and .env changes are ignored. Emptying the table
    deliberately re-seeds from .env on next startup (lockout recovery)."""
    db = SessionLocal()
    try:
        # Seed only while the table is empty. (An earlier force-clear-every-boot
        # hack lived here; it would now wipe /adminreg-assigned admins and their
        # profile links on every restart, so the documented guarded behavior is
        # restored. Lockout recovery still works: empty the table and restart.)
        if db.query(Admin).first():
            return
        ids = settings.admin_telegram_ids
        if not ids:
            return
        for tid in ids:
            db.add(Admin(telegram_id=tid))
        db.commit()
        print(f"[startup] seeded {len(ids)} admin(s) from ADMIN_TELEGRAM_ID")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] admin seed skipped: {exc}")
    finally:
        db.close()


PP_SEED_FLAG = "pp_seed_manager5"
# Bump when backend/app/data/pp_seed_manager5.json changes so prod re-syncs the
# catalog. v2: fixed 3 junk SKU='0' rows → real product F00002812 (18.06 data).
# v3: Оф. Торт faza-yacheyka rebuild. v4: 04.07 update (A1421 → A1437).
PP_CATALOG_VERSION = "4"
PP_CATALOG_FLAG = "pp_catalog_version"


def _load_pp_seed():
    import json
    import os
    path = os.path.join(os.path.dirname(__file__), "data", "pp_seed_manager5.json")
    if not os.path.isfile(path):
        print(f"[startup] production seed file missing: {path}")
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def resync_production_catalog() -> None:
    """Re-sync manager 5's product catalog + work-center config from the bundled
    seed JSON whenever PP_CATALOG_VERSION advances past what's recorded. Replaces
    products (so stale/junk rows are dropped) and upserts work centers. pp_daily
    keys on (sap_code, work_center), not product ids, so re-inserting is safe.
    NOTE: this overwrites admin labor-time edits — acceptable in the pilot; a
    self-service catalog import will supersede it."""
    from app.models import PPProduct, PPWorkCenter

    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter_by(key=PP_CATALOG_FLAG).first()
        if row and row.value == PP_CATALOG_VERSION:
            return
        seed = _load_pp_seed()
        if not seed:
            return
        mid = seed["manager_id"]

        db.query(PPProduct).filter_by(manager_id=mid).delete()
        for p in seed.get("products", []):
            db.add(PPProduct(
                manager_id=mid, sap_code=p["sap_code"], name=p.get("name") or "",
                work_center=p.get("work_center") or "", labor_time=p.get("labor_time"),
                sort_order=p.get("sort_order", 0),
            ))

        existing = {w.code: w for w in db.query(PPWorkCenter).filter_by(manager_id=mid).all()}
        seed_codes = set()
        for w in seed.get("work_centers", []):
            seed_codes.add(w["code"])
            wc = existing.get(w["code"])
            if wc:
                wc.shtatka = w.get("shtatka") or 0
                wc.capacity = w.get("capacity")
                wc.active = True
            else:
                db.add(PPWorkCenter(
                    manager_id=mid, code=w["code"], shtatka=w.get("shtatka") or 0,
                    capacity=w.get("capacity"), sort_order=w.get("sort_order", 0),
                ))
        # WCs dropped from the seed would otherwise linger as empty team cards
        for code, wc in existing.items():
            if code not in seed_codes:
                wc.active = False

        if row:
            row.value = PP_CATALOG_VERSION
        else:
            db.add(AppSetting(key=PP_CATALOG_FLAG, value=PP_CATALOG_VERSION))
        db.commit()
        print(f"[startup] re-synced production catalog to v{PP_CATALOG_VERSION} "
              f"({len(seed.get('products', []))} products)")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] production catalog resync skipped: {exc}")
    finally:
        db.close()


def seed_production_pilot() -> None:
    """Seed the pilot brigadir's (manager 5, Абдугамитов Мухаммад) production
    catalog + work centers from the ABC Excel 'Sheet1 Торт'. Flag-guarded so it
    runs exactly once; new pp_* tables are created by create_all beforehand."""
    import json
    import os
    from app.models import PPProduct, PPWorkCenter

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PP_SEED_FLAG).first():
            return
        path = os.path.join(os.path.dirname(__file__), "data", "pp_seed_manager5.json")
        if not os.path.isfile(path):
            print(f"[startup] production seed file missing: {path}")
            return
        with open(path, encoding="utf-8") as fh:
            seed = json.load(fh)
        mid = seed["manager_id"]

        existing_wc = {w.code for w in db.query(PPWorkCenter).filter_by(manager_id=mid).all()}
        for w in seed.get("work_centers", []):
            if w["code"] in existing_wc:
                continue
            db.add(PPWorkCenter(
                manager_id=mid, code=w["code"], shtatka=w.get("shtatka") or 0,
                capacity=w.get("capacity"), sort_order=w.get("sort_order", 0),
            ))

        if db.query(PPProduct).filter_by(manager_id=mid).count() == 0:
            for p in seed.get("products", []):
                db.add(PPProduct(
                    manager_id=mid, sap_code=p["sap_code"], name=p.get("name") or "",
                    work_center=p.get("work_center") or "", labor_time=p.get("labor_time"),
                    sort_order=p.get("sort_order", 0),
                ))

        db.add(AppSetting(key=PP_SEED_FLAG, value="1"))
        # Fresh install already has the current catalog → stamp version so the
        # resync step is a no-op here.
        if not db.query(AppSetting).filter_by(key=PP_CATALOG_FLAG).first():
            db.add(AppSetting(key=PP_CATALOG_FLAG, value=PP_CATALOG_VERSION))
        db.commit()
        print(f"[startup] seeded production pilot for manager {mid}: "
              f"{len(seed.get('products', []))} products, {len(seed.get('work_centers', []))} WCs")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] production pilot seed skipped: {exc}")
    finally:
        db.close()


def relax_pp_upload_manager() -> None:
    """pp_uploads.manager_id becomes nullable: a NULL row holds the GLOBAL
    plant-wide фаза/заголовок slice for a date (the SAP export is one file for
    everyone; brigadir views filter it at read time). Existing per-brigadir
    rows stay as legacy history."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE pp_uploads ALTER COLUMN manager_id DROP NOT NULL"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] pp_uploads manager_id relax skipped: {exc}")
    finally:
        db.close()


PP_ACTUAL_DELIV_FLAG = "pp_actual_from_deliv_v1"


def backfill_pp_actual_from_deliv() -> None:
    """Re-point pp_daily.actual_qty («Факт») at the order-header «Поставлено»
    (Excel «План пост», col M) instead of the old фаза «ПодтвВыходПрод», for every
    date whose raw faza+zaga uploads are still stored. Brings already-loaded
    snapshots in line with the new «Факт» definition without a manual re-upload.

    Replays the same join the upload now does: order → «Поставлено» from the
    stored заголовок, summed once per matching фаза operation, grouped by
    (SAP, work center). Flag-guarded so it runs exactly once. Dates without a
    stored заголовок — or whose «Поставлено» sums to zero — are left untouched,
    so we never wipe a live actual when the source is missing/misaligned."""
    from app.models import PPDaily, PPUpload

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PP_ACTUAL_DELIV_FLAG).first():
            return

        # stored slices indexed by (manager, date)
        zaga = {(u.manager_id, u.date): u for u in
                db.query(PPUpload).filter(PPUpload.file_type == "zaga").all()}
        faza = {(u.manager_id, u.date): u for u in
                db.query(PPUpload).filter(PPUpload.file_type == "faza").all()}

        updated_rows = updated_days = 0
        for key, fz in faza.items():
            zg = zaga.get(key)
            if not zg or not zg.rows:
                continue  # no «Поставлено» source for this date → leave as-is
            # zaga row: [order, sku, plant, ordqty, deliv, conf, date, name, status]
            order_deliv: dict[str, float] = {}
            for r in zg.rows:
                if r and r[0] is not None and len(r) > 4:
                    try:
                        order_deliv[str(r[0])] = float(r[4] or 0)
                    except (TypeError, ValueError):
                        pass
            if not order_deliv:
                continue
            # faza row: [order, op, wc, sku, name, plan, status, date, conf]
            agg: dict[tuple[str, str], float] = defaultdict(float)
            for r in (fz.rows or []):
                if not r or len(r) < 4:
                    continue
                sku = r[3]
                if not sku or sku == "—":
                    continue
                agg[(str(sku), str(r[2]))] += order_deliv.get(str(r[0]), 0.0)
            if sum(agg.values()) <= 0:
                continue  # nothing delivered / misaligned source → don't zero actuals

            mid, day = key
            touched = False
            for d in db.query(PPDaily).filter(PPDaily.manager_id == mid, PPDaily.date == day).all():
                new_actual = agg.get((str(d.sap_code), str(d.work_center)))
                if new_actual is None or float(d.actual_qty or 0) == new_actual:
                    continue
                d.actual_qty = new_actual
                updated_rows += 1
                touched = True
            if touched:
                updated_days += 1

        db.add(AppSetting(key=PP_ACTUAL_DELIV_FLAG, value="1"))
        db.commit()
        print(f"[startup] pp actual←Поставлено backfill: {updated_rows} row(s) across {updated_days} day(s)")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] pp actual backfill skipped: {exc}")
    finally:
        db.close()


PP_EFF_BASE_FLAG = "pp_efficiency_base_480"


def rescale_pp_efficiency_base() -> None:
    """One-time rescale of the efficiency store from the legacy 500-minute
    nominal base to the real 480-minute shift (85% is now 408 min/head).

    Only values that are PROVABLY legacy are touched — exactly 425/head, the
    Excel's «Для 85% труд» constant (85% × 500). The new UI can never produce
    425.00 (88.5% × 480 = 424.8), so re-running after fresh saves is safe, and
    already-shift-based configs (e.g. manager 5's ≈407.5/head) stay untouched.

    - pp_work_centers.capacity: rate 425/head → shtatka × 408.
    - pp_day_settings.productive_min: 425 → 408 (the pin was saved by a
      brigadir typing «85» into the old 500-base box).
    """
    from app.models import PPWorkCenter, PPDaySetting

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PP_EFF_BASE_FLAG).first():
            return
        caps = pins = 0
        for wc in db.query(PPWorkCenter).all():
            if wc.capacity and wc.shtatka:
                rate = float(wc.capacity) / int(wc.shtatka)
                if abs(rate - 425.0) < 0.05:
                    wc.capacity = int(wc.shtatka) * 408
                    caps += 1
        for ds in db.query(PPDaySetting).all():
            if ds.productive_min is not None and abs(float(ds.productive_min) - 425.0) < 0.05:
                ds.productive_min = 408
                pins += 1
        db.add(AppSetting(key=PP_EFF_BASE_FLAG, value="1"))
        db.commit()
        print(f"[startup] pp efficiency base 500→480: {caps} capacity row(s), "
              f"{pins} day pin(s) rescaled 425→408/head")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] pp efficiency base rescale skipped: {exc}")
    finally:
        db.close()


MANAGERS_SEEDED_FLAG = "managers_seeded"


def seed_managers_and_sources() -> None:
    """Ensure supervisors (managers) and sheet sources exist. The manager seed
    is flag-guarded after its first run: admins now manage units in the
    Profiles tab, and re-adding missing MANAGERS entries on every boot would
    resurrect a unit an admin deliberately deleted."""
    db = SessionLocal()
    try:
        if not db.query(AppSetting).filter_by(key=MANAGERS_SEEDED_FLAG).first():
            for mgr_id, name, shift in MANAGERS:
                existing = db.query(Manager).filter(Manager.id == mgr_id).first()
                if not existing:
                    db.add(Manager(id=mgr_id, name=name, shift=shift))
                    print(f"[startup] Added manager {mgr_id}: {name}")
            db.add(AppSetting(key=MANAGERS_SEEDED_FLAG, value="1"))

        for name, sheet_id in SHEET_SOURCES:
            existing = db.query(SheetSource).filter(SheetSource.name == name).first()
            if not existing:
                db.add(SheetSource(name=name, sheet_id=sheet_id))
                print(f"[startup] Added sheet source: {name}")

        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] manager/source seed skipped: {exc}")
    finally:
        db.close()


SHIFT_SHEET_REPOINT_FLAG = "shift_report_sheet_2026_07_29"


def repoint_shift_report_sheet() -> None:
    """Point the stored `shift_report` source at the new «Смена отчёт, Сафия»
    workbook (2026-07-29).

    seed_managers_and_sources only ever INSERTS a missing source row, so
    changing SHEET_SOURCES alone would leave every existing deployment reading
    the retired workbook — which stopped taking submissions on 2026-05-26.
    Flag-guarded so it runs exactly once: an admin who later repoints the source
    by hand keeps their choice.
    """
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=SHIFT_SHEET_REPOINT_FLAG).first():
            return

        src = db.query(SheetSource).filter(SheetSource.name == "shift_report").first()
        if src and src.sheet_id != SHIFT_REPORT_SHEET_ID:
            print(f"[startup] shift_report sheet {src.sheet_id} → {SHIFT_REPORT_SHEET_ID}")
            src.sheet_id = SHIFT_REPORT_SHEET_ID

        db.add(AppSetting(key=SHIFT_SHEET_REPOINT_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] shift_report repoint skipped: {exc}")
    finally:
        db.close()


CELL_PEREN_WIPE_FLAG = "cell_perenaladka_wipe_2026_08_06"


def wipe_cell_perenaladka_history() -> None:
    """One-shot wipe of the hand-entered TEST rows in ``cell_perenaladka``
    (2026-08-06). The /idle-cell Perenaladka tab now imports its historical
    minutes from the shift report's per-cell «Переналадка» columns, and the
    user chose to clear the trial data first so the sheet becomes the baseline
    (sheet wins on every later conflict). Flag-guarded: runs exactly once, so
    entries made on the page after the first import are never wiped again."""
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=CELL_PEREN_WIPE_FLAG).first():
            return

        n = db.query(CellPerenaladka).delete()
        if n:
            print(f"[startup] cell_perenaladka: wiped {n} test row(s) before the first sheet import")

        db.add(AppSetting(key=CELL_PEREN_WIPE_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] cell_perenaladka wipe skipped: {exc}")
    finally:
        db.close()


# One flag per floor date. Bumping the date needs a NEW key: the old flag says
# "the 10 Aug purge already ran", which is true and must stay true, while the
# 11 Aug purge has not. Reusing the key would make the new floor a no-op on
# every box that had already booted once.
LEADER_AI_PURGE_FLAG = "leader_ai_purged_pre_2026_08_13"


def purge_leader_ai_history() -> None:
    """One-shot purge of every AI proof-review verdict dated before the review
    floor (`services.leader_ai.DEFAULT_FLOOR`, **13 Aug 2026** since
    2026-08-14 — the day automatic shift-1 review begins, so the platform
    states ONE start date instead of two).

    The historical backfill judged months of reports under questions the system
    no longer asks, so those verdicts are not data to repair: they are answers
    to a retired question, and nothing on the page can tell the two apart by
    looking. The same now goes for 11–12 Aug: the user does not want them, and
    a floor above verdicts that still show in the triage queue would restate
    the very contradiction moving the floor was meant to remove.

    Pins the review floor to the same date — discovery back-fills everything
    ever filed, and without the floor the next drain pass would re-insert the
    deleted history as `pending` and re-spend the Gemini quota on it. The floor
    is only ever RAISED here, never lowered.

    Flag-guarded per date, so verdicts written from the floor onward are never
    touched, and an admin who later moves the floor from the page (see
    `POST /api/leader-ai/history/clear`) is not overruled on the next boot.
    """
    from app.services.leader_ai import DEFAULT_FLOOR, FLOOR_SETTING

    FLOOR = DEFAULT_FLOOR
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=LEADER_AI_PURGE_FLAG).first():
            return

        n = (db.query(LeaderAiReview)
             .filter(LeaderAiReview.date < FLOOR)
             .delete(synchronize_session=False))
        row = db.query(AppSetting).filter_by(key=FLOOR_SETTING).first()
        if row is None:
            db.add(AppSetting(key=FLOOR_SETTING, value=FLOOR))
        elif (row.value or "") < FLOOR:
            row.value = FLOOR
        db.add(AppSetting(key=LEADER_AI_PURGE_FLAG, value="1"))
        db.commit()
        if n:
            print(f"[startup] leader_ai_reviews: purged {n} verdict(s) before {FLOOR}")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] leader-ai purge skipped: {exc}")
    finally:
        db.close()


# Named after the shifts it clears, and versioned, for the same reason the floor
# purge above is: the flag records "this exact pause has been applied once". If
# `REVIEW_PAUSED_SHIFTS` ever changes, this key must change WITH it, or the old
# "already ran" mark makes the new pause a no-op on every box that has booted.
LEADER_AI_PAUSE_FLAG = "leader_ai_review_paused_shift2_v1"


def drop_paused_shift_reviews() -> None:
    """Take the paused shifts' work OUT of the AI queue, once.

    Closing the doors (services/leader_ai.REVIEW_PAUSED_SHIFTS) stops new rows;
    it does nothing about the ones queued before the pause existed. Those would
    sit `pending` forever now that the drain refuses them — inflating «N queued»
    on the admin strip and holding coverage below 100% with work nothing will
    ever do. A queue figure that never moves is how an operator learns to stop
    reading the strip.

    **Only never-judged rows go.** `reviewed_at IS NULL AND resolution IS NULL`
    is the whole rule: a verdict already written is an answer somebody may have
    acted on, and a human ruling is that row's terminal state. What is deleted
    is queue debris — the platform's own words for it (`scope="unjudged"` in the
    cleanup tool) — and it is not lost: `discover()` re-finds every one of these
    refs the moment the pause lifts, because the ref is what made them known.
    """
    from app.services.leader_ai import REVIEW_PAUSED_SHIFTS

    if not REVIEW_PAUSED_SHIFTS:
        # Nothing paused — and deliberately no flag written, so the guard stays
        # honest about never having run.
        return

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=LEADER_AI_PAUSE_FLAG).first():
            return
        n = (db.query(LeaderAiReview)
             .filter(LeaderAiReview.shift.in_(REVIEW_PAUSED_SHIFTS),
                     LeaderAiReview.reviewed_at.is_(None),
                     LeaderAiReview.resolution.is_(None))
             .delete(synchronize_session=False))
        db.add(AppSetting(key=LEADER_AI_PAUSE_FLAG, value="1"))
        db.commit()
        shifts = "/".join(str(s) for s in REVIEW_PAUSED_SHIFTS)
        print(f"[startup] leader-ai: shift {shifts} review paused"
              + (f", {n} unjudged row(s) dropped from the queue" if n else ""))
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] leader-ai pause cleanup skipped: {exc}")
    finally:
        db.close()


ROLE_PROFILES_FLAG = "role_profiles_backfilled_v1"


def backfill_role_profiles() -> None:
    """Pre-created-profiles rollout. One-time (flag-guarded): every existing
    role registration becomes a claimed profile — the 4 hardcoded shift-admin
    slots turn into editable shift-manager profiles (role rows re-pointed from
    slot number to profile id), top-managers' typed names become profiles
    (role_id set to the profile), leaders' typed names become leader profiles
    under their unit (role rows unchanged — they keep role_id = manager id).
    Every boot (idempotent): admins without a profile get one, named from
    their Telegram account where known, so /adminreg-era invariants hold for
    legacy .env-seeded admins too."""
    db = SessionLocal()
    try:
        if not db.query(AppSetting).filter_by(key=ROLE_PROFILES_FLAG).first():
            from app.routers.auth import SHIFT_ADMIN_SLOTS  # slots' last use — retired after this

            # Shift managers: slots → profiles, remap role rows slot→profile id.
            slot_to_profile: dict[int, int] = {}
            for idx, slot in enumerate(SHIFT_ADMIN_SLOTS, start=1):
                p = RoleProfile(role="shift-manager", name=slot["name"], shift=slot["shift"])
                db.add(p)
                db.flush()
                slot_to_profile[idx] = p.id
            for r in db.query(TelegramUserRole).filter_by(role="shift-manager").all():
                if r.role_id in slot_to_profile:
                    r.role_id = slot_to_profile[r.role_id]

            # Top managers: typed names → profiles, role rows point at them.
            tm_rows = (
                db.query(TelegramUserRole)
                .filter(TelegramUserRole.role == "top-manager",
                        TelegramUserRole.status != "rejected")
                .all()
            )
            tm_profiles: dict[str, int] = {}
            for r in tm_rows:
                name = (r.full_name or "").strip()
                if not name:
                    continue
                if name not in tm_profiles:
                    p = RoleProfile(role="top-manager", name=name)
                    db.add(p)
                    db.flush()
                    tm_profiles[name] = p.id
                r.role_id = tm_profiles[name]

            # Leaders: typed names → profiles under their unit. Role rows keep
            # role_id = the supervisor's manager id (JWT/Concerns contract).
            seen: set[tuple[str, int | None]] = set()
            for r in (
                db.query(TelegramUserRole)
                .filter(TelegramUserRole.role == "leader",
                        TelegramUserRole.status != "rejected")
                .all()
            ):
                name = (r.full_name or "").strip()
                key = (name, r.role_id)
                if not name or key in seen:
                    continue
                seen.add(key)
                db.add(RoleProfile(role="leader", name=name, manager_id=r.role_id))

            db.add(AppSetting(key=ROLE_PROFILES_FLAG, value="1"))
            db.commit()
            print(f"[startup] backfilled role profiles: {len(slot_to_profile)} shift-manager, "
                  f"{len(tm_profiles)} top-manager, {len(seen)} leader")

        # Admins → profiles (idempotent, runs every boot so .env re-seeds get one).
        users_by_tid = {u.telegram_id: u for u in db.query(TelegramUser).all()}
        created = 0
        admins = db.query(Admin).order_by(Admin.id).all()
        for n, a in enumerate(admins, start=1):
            if a.profile_id and db.query(RoleProfile).filter_by(id=a.profile_id, role="admin").first():
                continue
            u = users_by_tid.get(a.telegram_id)
            # telegram_users.full_name mirrors the LAST-CLAIMED role profile
            # (e.g. the user's leader name) — never name an admin profile after
            # it. Use the @username or a placeholder; admins rename in Settings.
            name = (f"@{u.username}" if u and u.username else "") or f"Admin {n}"
            p = RoleProfile(role="admin", name=name)
            db.add(p)
            db.flush()
            a.profile_id = p.id
            created += 1
        if created:
            db.commit()
            print(f"[startup] linked {created} admin(s) to admin profiles")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] role-profiles backfill skipped: {exc}")
    finally:
        db.close()


def seed_setup_times() -> None:
    """Seed the setup_times register from the bundled «периналадка» workbook
    extract (data/setup_times_seed.json). Flag-guarded so it runs exactly once
    — after that the register is maintained from the Setup times page and must
    not be overwritten (the seed has no SKUs; those are filled in by hand).
    The setup_times table itself comes from Base.metadata.create_all."""
    import json
    import os
    from app.models import SetupTime

    FLAG = "setup_times_seeded"
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=FLAG).first():
            return
        path = os.path.join(os.path.dirname(__file__), "data", "setup_times_seed.json")
        if not os.path.isfile(path):
            print(f"[startup] setup-times seed file missing: {path}")
            return
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh)["rows"]
        for r in rows:
            db.add(SetupTime(
                manager_id=r.get("manager_id"),
                supervisor=r.get("supervisor") or "",
                cell=r["cell"],
                minutes=r.get("minutes"),
                reason=r.get("reason") or "",
            ))
        db.add(AppSetting(key=FLAG, value="1"))
        db.commit()
        print(f"[startup] seeded setup_times with {len(rows)} rows")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] setup-times seed skipped: {exc}")
    finally:
        db.close()


# ── profile identity ──────────────────────────────────────────────────────────
# A PROFILE is a person; a telegram_user_roles row is only a login that may act
# as that person. Anything keyed to a registration splits one person into as
# many people as they have accounts, and orphans on unassign→re-claim. These
# migrations move the remaining ownership keys onto profiles. See app/identity.py.

def add_profile_identity_columns() -> None:
    """Add the profile keys (idempotent).

    ``telegram_user_roles.profile_key`` is the keystone: it records WHICH
    profile a registration claimed. Without it, leader identity had to be
    re-derived by matching a name string on every read, so a renamed leader
    silently lost their holders and their work.
    """
    db = SessionLocal()
    stmts = [
        "ALTER TABLE telegram_user_roles ADD COLUMN IF NOT EXISTS profile_key VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_telegram_user_roles_profile_key "
        "ON telegram_user_roles (profile_key)",
        "ALTER TABLE leader_tasks ADD COLUMN IF NOT EXISTS leader_profile_id INTEGER",
        "CREATE INDEX IF NOT EXISTS ix_leader_tasks_leader_profile_id "
        "ON leader_tasks (leader_profile_id)",
        # The registration key becomes optional: a task may be assigned to a
        # profile nobody has claimed yet.
        "ALTER TABLE leader_tasks ALTER COLUMN leader_role_ref DROP NOT NULL",
        "ALTER TABLE leader_tasks ADD COLUMN IF NOT EXISTS created_by_profile VARCHAR",
        "ALTER TABLE leader_task_comments ADD COLUMN IF NOT EXISTS author_profile VARCHAR",
        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_profile VARCHAR",
    ]
    try:
        for s in stmts:
            db.execute(text(s))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] profile identity columns migration skipped: {exc}")
    finally:
        db.close()


def backfill_role_profile_keys() -> None:
    """Stamp every registration with the profile it claimed.

    Direct roles carry their profile in role_id already; leaders are matched by
    (unit, name) — the last time that fragile match is needed, since the stamped
    key survives later renames. Rows that resolve to nothing are left NULL and
    keep working through the legacy fallbacks."""
    db = SessionLocal()
    try:
        rows = db.query(TelegramUserRole).filter(
            TelegramUserRole.profile_key.is_(None)).all()
        if not rows:
            return
        leader_profiles = {
            (p.manager_id, p.name): p.id
            for p in db.query(RoleProfile).filter_by(role="leader").all()
        }
        admin_profiles = {
            a.telegram_id: a.profile_id
            for a in db.query(Admin).all() if a.profile_id
        }
        stamped = 0
        for r in rows:
            key = None
            if r.role in ("top-manager", "shift-manager", "guest", "supervisor") and r.role_id:
                key = f"{r.role}:{r.role_id}"
            elif r.role == "leader":
                pid = leader_profiles.get((r.role_id, r.full_name))
                key = f"leader:{pid}" if pid else None
            elif r.role == "admin":
                pid = admin_profiles.get(r.telegram_id)
                key = f"admin:{pid}" if pid else None
            if key:
                r.profile_key = key
                stamped += 1
        if stamped:
            db.commit()
            print(f"[startup] stamped {stamped} registration(s) with their profile")
        unresolved = sum(1 for r in rows if not r.profile_key)
        if unresolved:
            print(f"[startup] {unresolved} registration(s) matched no profile "
                  f"— they keep the legacy account fallback")
    except Exception as exc:
        db.rollback()
        print(f"[startup] role profile key backfill skipped: {exc}")
    finally:
        db.close()


def backfill_task_profiles() -> None:
    """Move leader tasks and comment authorship onto profiles, then merge the
    per-registration priority queues that keying-by-login had split.

    A leader held by two accounts previously had TWO independent dense 1..N
    queues — two different tasks both numbered 1, each visible from only one
    login. Once the tasks share a profile the union has duplicate positions, so
    the active queue is renumbered per profile, preserving the existing order
    (priority, then creation time) and keeping it dense.
    """
    db = SessionLocal()
    try:
        role_rows = {t.id: t for t in db.query(TelegramUserRole).all()}
        leader_profiles = {
            (p.manager_id, p.name): p.id
            for p in db.query(RoleProfile).filter_by(role="leader").all()
        }

        def _leader_pid(t):
            """Profile of a task: via its registration, else via the snapshots
            the task itself carries (which survive the role row's deletion)."""
            r = role_rows.get(t.leader_role_ref)
            if r is not None:
                if r.profile_key and r.profile_key.startswith("leader:"):
                    return int(r.profile_key.split(":", 1)[1])
                pid = leader_profiles.get((r.role_id, r.full_name))
                if pid:
                    return pid
            return leader_profiles.get((t.supervisor_manager_id, t.leader_name))

        tasks = db.query(LeaderTask).filter(LeaderTask.leader_profile_id.is_(None)).all()
        moved = 0
        for t in tasks:
            pid = _leader_pid(t)
            if pid:
                t.leader_profile_id = pid
                moved += 1

        # Creator profile: supervisor-created tasks resolve from the unit
        # (managers.id IS the supervisor profile); others from the creator's
        # registration at the time.
        by_account: dict[int, list] = {}
        for r in role_rows.values():
            if r.telegram_id:
                by_account.setdefault(r.telegram_id, []).append(r)
        creators = 0
        for t in db.query(LeaderTask).filter(LeaderTask.created_by_profile.is_(None)):
            if not t.created_by:
                continue
            held = by_account.get(t.created_by, [])
            key = None
            if t.supervisor_manager_id and any(
                r.role == "supervisor" and r.role_id == t.supervisor_manager_id for r in held
            ):
                key = f"supervisor:{t.supervisor_manager_id}"
            else:
                approved = [r for r in held if r.status == "approved" and r.profile_key]
                if len(approved) == 1:
                    key = approved[0].profile_key
            if key:
                t.created_by_profile = key
                creators += 1

        # Comment authorship: author_role_ref → the profile that role row claimed.
        authors = 0
        for c in db.query(LeaderTaskComment).filter(LeaderTaskComment.author_profile.is_(None)):
            r = role_rows.get(c.author_role_ref) if c.author_role_ref else None
            if r is not None and r.profile_key:
                c.author_profile = r.profile_key
                authors += 1

        db.flush()

        # Renumber each profile's active queue: dense 1..N, order preserved.
        renumbered = 0
        active = db.query(LeaderTask).filter(
            LeaderTask.status != "done",
            LeaderTask.leader_profile_id.isnot(None),
        ).all()
        per_profile: dict[int, list] = {}
        for t in active:
            per_profile.setdefault(t.leader_profile_id, []).append(t)
        for pid, rows in per_profile.items():
            rows.sort(key=lambda x: (
                x.priority if x.priority is not None else 10**6,
                x.created_at or datetime.min.replace(tzinfo=timezone.utc),
                x.id,
            ))
            for i, t in enumerate(rows, start=1):
                if t.priority != i:
                    t.priority = i
                    renumbered += 1

        if moved or creators or authors or renumbered:
            db.commit()
            print(f"[startup] tasks → profiles: {moved} assigned, {creators} creators, "
                  f"{authors} comment authors, {renumbered} queue position(s) merged")
    except Exception as exc:
        db.rollback()
        print(f"[startup] task profile backfill skipped: {exc}")
    finally:
        db.close()


def backfill_comment_profiles() -> None:
    """Unit-dashboard comments: attribute each to the profile that wrote it, so
    a co-holder (or a successor after handover) can edit and delete it. Only
    unambiguous authors are resolved — an account that held several profiles at
    once is left NULL and keeps the account fallback."""
    db = SessionLocal()
    try:
        rows = db.query(Comment).filter(
            Comment.author_profile.is_(None),
            Comment.author_telegram_id.isnot(None),
        ).all()
        if not rows:
            return
        # A unit comment is written by that unit's supervisor profile whenever
        # the author actually held it; managers.id IS the supervisor profile.
        sup = {
            (r.telegram_id, r.role_id)
            for r in db.query(TelegramUserRole).filter(
                TelegramUserRole.role == "supervisor").all()
        }
        done = 0
        for c in rows:
            if (c.author_telegram_id, c.manager_id) in sup:
                c.author_profile = f"supervisor:{c.manager_id}"
                done += 1
        if done:
            db.commit()
            print(f"[startup] attributed {done} unit comment(s) to their profile")
    except Exception as exc:
        db.rollback()
        print(f"[startup] comment profile backfill skipped: {exc}")
    finally:
        db.close()


def add_activity_profile_key() -> None:
    """Key the usage ledger by (account, PROFILE, day).

    The dashboard counts PEOPLE. Keeping one row per account made a profile
    held by two accounts read as two users with half the time each, and inflated
    every headline counter. Replaces the (telegram_id, day) uniqueness with a
    functional unique index that also spans the profile — COALESCE, because a
    plain constraint treats NULL profiles as distinct and would let duplicates
    accumulate for unresolved identities.
    """
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE user_activity ADD COLUMN IF NOT EXISTS profile_key VARCHAR"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_user_activity_profile_key "
                        "ON user_activity (profile_key)"))
        db.execute(text("ALTER TABLE user_activity "
                        "DROP CONSTRAINT IF EXISTS uq_user_activity_tid_day"))
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_activity_tid_profile_day "
            "ON user_activity (telegram_id, COALESCE(profile_key, ''), day)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] user_activity profile_key migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_setting_names() -> None:
    """Per-supervisor task renames: leader_task_settings gains nullable
    per-language name overrides (NULL = the global LeaderTaskDef name).
    The per-LEADER override table (leader_task_leader_settings) is new and
    comes from Base.metadata.create_all — no ALTER needed. Idempotent."""
    db = SessionLocal()
    try:
        for col in ("name_uz", "name_uz_cyrl", "name_ru", "name_en"):
            db.execute(text(
                f"ALTER TABLE leader_task_settings ADD COLUMN IF NOT EXISTS {col} VARCHAR"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader_task_settings name columns migration skipped: {exc}")
    finally:
        db.close()


def add_web_credential_password_enc() -> None:
    """The sealed copy of a browser password (WebCredential.password_enc), so an
    admin can READ a login back on the profile page instead of resetting it.

    Idempotent and deliberately backfill-free: an existing hash cannot be turned
    back into a password, so rows predating this stay NULL and the page says the
    password is unknown until it is next set. Guessing would be worse."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE web_credentials ADD COLUMN IF NOT EXISTS password_enc VARCHAR"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] web_credentials.password_enc migration skipped: {exc}")
    finally:
        db.close()


CAPS_PER_USER_FLAG = "caps_migrated_to_user_v1"


def migrate_user_capabilities() -> None:
    """Per-ACCOUNT capabilities rollout — the one deliberate break from
    "a profile is the person" (see app/capabilities.py). Grants move off the
    profile onto the Telegram account, so two logins of one profile can differ.

    Columns (idempotent): capability_audit gains a ``telegram_id`` target and its
    legacy ``profile_key`` becomes nullable, so new per-account audit rows don't
    need a profile. The ``user_capabilities`` table itself comes from
    Base.metadata.create_all.

    Data (flag-guarded, once): fan every existing profile-keyed grant out to the
    accounts currently holding that profile. A grant on a profile nobody has
    claimed is dropped — a per-account grant has no login to land on — which is
    the accepted trade-off of leaving profile keys. The source
    profile_capabilities rows are left untouched so this stays re-derivable."""
    from app import identity
    from app.models import ProfileCapability, UserCapability

    db = SessionLocal()
    try:
        try:
            db.execute(text(
                "ALTER TABLE capability_audit ADD COLUMN IF NOT EXISTS telegram_id BIGINT"))
            db.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_capability_audit_telegram_id "
                "ON capability_audit (telegram_id)"))
            db.execute(text(
                "ALTER TABLE capability_audit ALTER COLUMN profile_key DROP NOT NULL"))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[startup] capability_audit columns migration skipped: {exc}")

        if db.query(AppSetting).filter_by(key=CAPS_PER_USER_FLAG).first():
            return
        existing = {(r.telegram_id, r.capability) for r in db.query(UserCapability).all()}
        moved = 0
        for pc in db.query(ProfileCapability).all():
            for tid in identity.profile_holders(db, pc.profile_key):
                if (tid, pc.capability) in existing:
                    continue
                db.add(UserCapability(
                    telegram_id=tid, capability=pc.capability,
                    scope=pc.scope, granted_by=pc.granted_by,
                ))
                existing.add((tid, pc.capability))
                moved += 1
        db.add(AppSetting(key=CAPS_PER_USER_FLAG, value="1"))
        db.commit()
        print(f"[startup] fanned {moved} profile grant(s) out to Telegram accounts")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] user-capabilities backfill skipped: {exc}")
    finally:
        db.close()


def migrate_permission_modes() -> None:
    """2026-08-13: permission entries gain a DIRECTION.

    Until now every row in ``user_capabilities`` meant "granted"; a page could be
    opened for one person but never closed for one person, so taking a page away
    from a single supervisor meant taking it from every supervisor. ``mode``
    adds "deny" beside "grant" (see app/capabilities.py rule 1 — pages only).

    Idempotent, and deliberately backfilled to 'grant' with a NOT NULL default:
    a row that read as NULL would be ambiguous exactly where ambiguity is most
    expensive, and every row that exists today IS a grant. The
    ``profile_permissions`` table itself comes from Base.metadata.create_all."""
    db = SessionLocal()
    try:
        for table in ("user_capabilities", "profile_permissions"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "
                "mode VARCHAR NOT NULL DEFAULT 'grant'"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] permission mode migration skipped: {exc}")
    finally:
        db.close()


def add_worker_concern_failures_column() -> None:
    """2026-08-13: the worker-concerns sync records WHY each unreadable sheet was
    left stale, not just which cell it was. Existing rows stay NULL until the
    next crawl rewrites the list — nothing is back-derived, because the reason a
    past run failed is not recoverable from anything but its log line."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE worker_concern_sync ADD COLUMN IF NOT EXISTS failures JSONB"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] worker-concern failures column migration skipped: {exc}")
    finally:
        db.close()


def add_worker_concern_sweep_columns() -> None:
    """2026-08-14: record what the incremental sync actually saved (how many
    sheets it skipped) and, when it saved nothing, why — the Drive
    modifiedTime sweep's own failure. Before this the sweep failing (Drive API
    disabled on the Google project) looked exactly like the sweep working and
    finding every sheet changed: both crawl all ~180 sheets, and the reason
    reached only ``app.log``."""
    db = SessionLocal()
    try:
        for col in ("skipped_sheets INTEGER DEFAULT 0", "sweep_error TEXT"):
            db.execute(text(
                f"ALTER TABLE worker_concern_sync ADD COLUMN IF NOT EXISTS {col}"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] worker-concern sweep columns migration skipped: {exc}")
    finally:
        db.close()
