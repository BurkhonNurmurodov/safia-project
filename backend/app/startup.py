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
    LeaderConcern, LeaderConcernComment, LeaderTask,
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


def add_concern_comment_kind_column() -> None:
    """Add kind to leader_concern_comments (idempotent). NULL is an ordinary
    message; "resolution" is the mandatory note written when the concern was
    closed, which lives in the thread instead of on the row. Messages written
    before the column existed read as ordinary ones, which is what they are —
    and the concerns closed then keep their note in leader_concerns.solution,
    which nothing rewrites."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE leader_concern_comments "
                        "ADD COLUMN IF NOT EXISTS kind VARCHAR(12)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader_concern_comments kind migration skipped: {exc}")
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


def add_action_log_undo_column() -> None:
    """`action_logs.undo_of` — the row a reversal takes back (idempotent).

    The register is append-only, so an undo is a NEW action that happens to be
    the inverse of an old one, never an edit of the row it reverses. This is the
    link between the two, and it is indexed because the «Jurnal» tab asks "was
    this one taken back" for every row of every page it renders: the same answer
    derived from a JSONB scan would get slower every day the table worked.
    Rows written before the column exists stay NULL and read as "not undone",
    which is what they are."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS undo_of BIGINT"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_action_logs_undo_of "
                        "ON action_logs (undo_of)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] action_logs undo_of migration skipped: {exc}")
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


def migrate_idle_interval_status() -> None:
    """2026-08-21: an ojidaniya filed by a LEADER is a REQUEST until the cell's
    brigadir or an admin confirms it — ``cell_ojidaniya_intervals`` gains
    ``status`` plus who decided it, when, and why it was refused.

    Every row that already exists is ``approved``: it was filed under the
    direct-write rule this replaces, and back-dating it to "pending" would take
    a day's downtime off the register and hand a brigadir a queue of entries
    nobody ever meant to ask them about. The backfill therefore targets NULLs
    only — it must never revisit a row an operator has since decided.

    The table itself comes from ``create_all``, so only the columns are added
    here. Idempotent; safe on a box that has already run it."""
    db = SessionLocal()
    try:
        for ddl in (
            "ALTER TABLE cell_ojidaniya_intervals ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'approved'",
            "ALTER TABLE cell_ojidaniya_intervals ADD COLUMN IF NOT EXISTS decided_by_profile VARCHAR",
            "ALTER TABLE cell_ojidaniya_intervals ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ",
            "ALTER TABLE cell_ojidaniya_intervals ADD COLUMN IF NOT EXISTS decision_note TEXT",
        ):
            db.execute(text(ddl))
        db.execute(text(
            "UPDATE cell_ojidaniya_intervals SET status = 'approved' WHERE status IS NULL"))
        db.execute(text(
            "ALTER TABLE cell_ojidaniya_intervals ALTER COLUMN status SET NOT NULL"))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_cellojint_date_status "
            "ON cell_ojidaniya_intervals (date, status)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] idle-interval status migration skipped: {exc}")
    finally:
        db.close()


IDLE_REQUESTS_AUTO_APPROVED_FLAG = "idle_requests_auto_approved_2026_08_22_v1"


def approve_pending_idle_requests() -> None:
    """2026-08-22: the approval step on /idle-cell is REMOVED — a leader's
    ojidaniya counts the moment it is saved, and the unit's brigadir is told of
    it instead of asked about it.

    The request regime lived exactly one day (2026-08-21), and whatever it left
    ``pending`` would now sit in a state nothing reads and nothing can decide:
    the decide endpoints are gone, so those rows would be invisible to every
    listing, absent from every total, and un-fixable by anyone. They were
    honest entries that a brigadir simply had not got to, so they become
    ``approved`` — the same answer «tasdiqlash hammasini» would have given.
    ``rejected`` rows are NOT touched: a refusal somebody actually made stays a
    refusal, visible with its reason.

    Flag-guarded so it runs exactly once; the count is logged so the boot line
    says what moved. Running it twice would be harmless (nothing writes
    ``pending`` any more), but a flag keyed to the date records WHEN the rule
    changed, which is what an auditor reading the table later needs."""
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=IDLE_REQUESTS_AUTO_APPROVED_FLAG).first():
            return
        res = db.execute(text(
            "UPDATE cell_ojidaniya_intervals SET status = 'approved' WHERE status = 'pending'"))
        moved = res.rowcount if res.rowcount is not None and res.rowcount >= 0 else 0
        db.add(AppSetting(key=IDLE_REQUESTS_AUTO_APPROVED_FLAG, value="1"))
        db.commit()
        print(f"[startup] idle-cell approval removed: {moved} pending request(s) approved")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] idle-cell pending auto-approve skipped: {exc}")
    finally:
        db.close()


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


def add_late_proof_provenance() -> None:
    """2026-08-30: a late proof's photos say WHICH DOOR they came through.

    Three nullable columns on `leader_late_proof_media` — `source`
    ("camera" | "upload"), `captured_at` and `stamp`. `create_all` builds the
    table on a fresh box but never ALTERs an existing one, and this feature's
    first cut shipped the table without them.

    They exist because the reviewer has to SEE the difference. A shot taken in
    the app carries a clock the leader could not author; a file they chose
    carries nothing this platform can vouch for. Rendering the two identically
    on the brigadir's card would teach reviewers that the stamp is decorative —
    the one way offering both doors could weaken the camera feature.

    NULL reads as "uploaded", which is what every row written before the camera
    door existed actually was. Idempotent, so it needs no one-shot flag; the
    draft-roll table `leader_late_proof_shots` comes from create_all.
    """
    db = SessionLocal()
    try:
        for col, typ in (("source", "VARCHAR(10)"),
                         ("captured_at", "TIMESTAMP WITH TIME ZONE"),
                         ("stamp", "VARCHAR(40)")):
            db.execute(text("ALTER TABLE leader_late_proof_media "
                            f"ADD COLUMN IF NOT EXISTS {col} {typ}"))
        db.commit()
        print("[startup] late-proof media: provenance columns present")
    except Exception as exc:
        db.rollback()
        print(f"[startup] late-proof provenance migration skipped: {exc}")
    finally:
        db.close()


DISPUTE_STAGES_FLAG = "leader_dispute_stages_2026_08_30_v1"


def migrate_dispute_stages() -> None:
    """2026-08-30: an objection to an AI rejection became a THREE-stage chain —
    leader files → the unit's brigadir rejects or uplifts with their own case →
    an admin rules with both notes in front of them (`services/leader_dispute`).

    Two jobs, and the second one is the whole point of the flag.

    1. The five stage-1 columns. `create_all` builds the table on a fresh box
       but never ALTERs an existing one, so without this the brigadir's ruling
       has nowhere to be written. Idempotent on its own.

    2. Every row filed under the OLD one-stage flow is placed in the new
       vocabulary. Those rows were ALL filed by a brigadir and were ALL waiting
       on an admin, which in the new chain is exactly "entered at the admin
       stage" — so a `pending` row becomes `admin`, its text becomes the uplift
       note it always was, and the brigadir who typed it is stamped as the
       person who passed it up. Nothing is invented and nothing is lost: the
       filer stays in `requested_by_*`, so a card can still say whose words
       these are rather than printing a brigadir's paraphrase as a leader's.

       `reason` is deliberately left in place as well. It is "the text this row
       was filed with", every earlier reader knows it under that name, and
       blanking it to make room for a leader note nobody ever wrote would turn
       a readable history into an empty column.

    Settled rows (`approved` / `rejected` / `cancelled`) already mean in the new
    vocabulary exactly what they meant in the old one and are not touched.

    Flag-guarded because step 2 must not run twice: a second pass would find
    rows legitimately sitting at `supervisor` — a leader's objection waiting on
    their brigadir — and there is nothing to distinguish them from the ones it
    placed. Changing what this does needs a NEW flag key, or the old "already
    ran" mark makes it a no-op on every box that has booted once.
    """
    db = SessionLocal()
    try:
        for col, typ in (("sup_action", "VARCHAR(10)"),
                         ("sup_note", "TEXT"),
                         ("sup_by_name", "VARCHAR(160)"),
                         ("sup_by_telegram", "BIGINT"),
                         ("sup_at", "TIMESTAMP WITH TIME ZONE")):
            db.execute(text("ALTER TABLE leader_ai_disputes "
                            f"ADD COLUMN IF NOT EXISTS {col} {typ}"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] dispute stage columns skipped: {exc}")
        db.close()
        return
    try:
        if db.query(AppSetting).filter_by(key=DISPUTE_STAGES_FLAG).first():
            db.close()
            return
        moved = db.execute(text(
            "UPDATE leader_ai_disputes SET "
            "  status = 'admin', "
            "  sup_action = 'uplifted', "
            "  sup_note = reason, "
            "  sup_by_name = requested_by_name, "
            "  sup_by_telegram = requested_by_telegram, "
            "  sup_at = requested_at "
            "WHERE status = 'pending'"
        )).rowcount
        db.add(AppSetting(key=DISPUTE_STAGES_FLAG, value="1"))
        db.commit()
        print(f"[startup] dispute stages: {moved} pending objection(s) placed "
              f"at the admin stage")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] dispute stage migration skipped: {exc}")
    finally:
        db.close()


def add_attendance_split_columns() -> None:
    """2026-08-30: one worker-day may be SPLIT across two of the unit's own
    cells, so an attendance row has to be able to say it is a FRACTION of a
    person (`hc_weight`) and which row it is the second half of (`split_of`).

    Neither column is NOT NULL and neither carries a DEFAULT, because NULL is
    what carries the meaning: NULL `hc_weight` is one whole person — every row
    that predates this and every unsplit row forever — and NULL `split_of` is
    "not the secondary half", which is true of a normal row and of the PRIMARY
    row of a split alike. A DEFAULT of 1.0 would make "unsplit" and "split whose
    other half went missing" the same stored value.

    DOUBLE PRECISION and not NUMERIC: every headcount accumulator downstream is
    a float, and psycopg hands NUMERIC back as Decimal, which cannot be summed
    into one. The index is what the /staff cell editor walks a pair on."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "
            "hc_weight DOUBLE PRECISION"
        ))
        db.execute(text(
            "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "
            "split_of INTEGER"
        ))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_attendance_split_of "
            "ON attendance (split_of)"
        ))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] attendance split columns migration skipped: {exc}")
    finally:
        db.close()


CELL_EXCHANGE_PURGE_FLAG = "cell_exchange_sandbox_purge_2026_08_30_v1"


def purge_cell_exchange_sandbox() -> None:
    """2026-08-30: /staff-cells and its sandbox are gone — the cell-level
    exchange became an ordinary /staff placement, so the pretend documents it
    filed have nothing left to describe.

    Those documents were TEST data by construction: `services/cell_exchange`
    filed them under their own doc types precisely so that no attendance row
    would ever be written from one, and the operator has confirmed they can go.
    What they leave behind is not inert, which is why this deletes more than the
    documents:

    - an `approval_notices` row is a LIVE BUTTON sitting in an admin's Telegram
      chat. Orphan it and the next tap resolves a document that no longer
      exists — so the notices go FIRST, while their refs still name something.
    - a `notifications` row renders through a template registered at IMPORT time
      by the deleted router, so from this deploy the bell has no text for these
      keys at all and would show a blank line in somebody's list.
    - `hr_document_history` hangs off a real ON DELETE CASCADE FK and needs no
      statement of its own.

    The doc types are spelled here as LITERALS on purpose: importing
    `app.services.cell_exchange` for its constants would make boot depend on a
    module this same deploy deletes.

    Flag-guarded because it is a one-shot destructive pass — a rerun would be a
    no-op today but a NEW flag key is required to change what it does, or the
    old "already ran" mark makes the change invisible on every box that has
    booted once. Every statement is wrapped on its own: a table or column that
    is already gone must not stop the rest, and must never block boot."""
    from app.models import ApprovalNotice, Notification

    TEST_DOC_TYPES = ["people_exchange_test", "role_change_test"]
    TEST_NKEYS = ["worker_exchange_test_created",
                  "worker_exchange_test_approved",
                  "worker_exchange_test_cancelled"]

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=CELL_EXCHANGE_PURGE_FLAG).first():
            return

        notices = notifs = docs = 0

        # `approval_notices.ref` is a plain STRING with no FK — it holds the
        # document id as text — so the ids are gathered while the documents are
        # still there and matched as strings.
        try:
            ids = [str(i) for (i,) in db.query(HrDocument.id).filter(
                HrDocument.doc_type.in_(TEST_DOC_TYPES)).all()]
            if ids:
                notices = (db.query(ApprovalNotice)
                             .filter(ApprovalNotice.kind == "hr_document",
                                     ApprovalNotice.ref.in_(ids))
                             .delete(synchronize_session=False))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[startup] cell-exchange sandbox notices skipped: {exc}")

        try:
            notifs = (db.query(Notification)
                        .filter(Notification.nkey.in_(TEST_NKEYS))
                        .delete(synchronize_session=False))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[startup] cell-exchange sandbox notifications skipped: {exc}")

        try:
            docs = (db.query(HrDocument)
                      .filter(HrDocument.doc_type.in_(TEST_DOC_TYPES))
                      .delete(synchronize_session=False))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[startup] cell-exchange sandbox documents skipped: {exc}")

        db.add(AppSetting(key=CELL_EXCHANGE_PURGE_FLAG, value="1"))
        db.commit()
        print(f"[startup] cell-exchange sandbox purged: {docs} document(s), "
              f"{notices} approval notice(s), {notifs} notification(s)")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] cell-exchange sandbox purge skipped: {exc}")
    finally:
        db.close()


def add_cell_shift_times() -> None:
    """2026-08-21: cells gain their working START and END clock («Smena
    vaqtlari» admin tab). Two nullable "HH:MM" columns — NULL on both means the
    cell inherits the default of its supervisor's shift — plus the two platform
    defaults themselves, stored as AppSetting rows "HH:MM-HH:MM".

    The seeded pair (shift 1 = 08:00-20:00, shift 2 = 20:00-08:00) is a
    PLACEHOLDER an admin is expected to confirm; it is inserted only when the
    key is absent, so an admin's own value is never overwritten. That
    insert-if-absent is naturally idempotent, so this needs no one-shot flag.
    Runs after migrate_cell_in_load_column."""
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE cells ADD COLUMN IF NOT EXISTS shift_start VARCHAR(5)"))
        db.execute(text("ALTER TABLE cells ADD COLUMN IF NOT EXISTS shift_end VARCHAR(5)"))
        for key, val in (("cell_hours_shift_1", "08:00-20:00"),
                         ("cell_hours_shift_2", "20:00-08:00")):
            row = db.execute(text("SELECT 1 FROM app_settings WHERE key = :k"),
                             {"k": key}).first()
            if row is None:
                db.execute(text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"),
                           {"k": key, "v": val})
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] cell shift times migration skipped: {exc}")
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


def add_leader_task_time_check() -> None:
    """2026-08-17: the DATE question splits in two — is the day asked at all
    (`date_check`), and if so must the CLOCK be proven too (`time_check`).

    Deliberately a second column rather than a widened `date_check`: the boolean
    is read by five surfaces and stored at three levels, and a type change would
    have to rewrite every one of them in the same deploy — while a rollback (the
    deploy script does roll back on an unhealthy /health) would leave the old
    code reading a column it cannot parse. Two booleans compose instead:
    `date_check` False still means "not asked", and `time_check` False is the new
    middle — the day is judged, the hour never is.

    Idempotent, and shaped exactly like the date-check migration above: nullable
    columns everywhere (all `ADD COLUMN IF NOT EXISTS` can do), then TRUE filled
    in at the GLOBAL level, which is the chain's floor and has nothing to inherit
    from. `leader_ai.resolve_time_check` reads NULL as "checked", so a box that
    never ran this keeps judging clocks exactly as before.
    """
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS time_check BOOLEAN"))
        db.execute(text(
            "UPDATE leader_task_defs SET time_check = TRUE WHERE time_check IS NULL"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task time-check migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_date_plus() -> None:
    """2026-08-19: a task may accept a proof dated up to N days AFTER the report
    day — 0 (only the report day) everywhere until an admin says otherwise.

    Some proofs are dated by what they are ABOUT rather than by when they were
    made: a work schedule filed on the 18th is the schedule FOR the 19th. Under
    the plain rule every honest filing of one is `date_mismatch`, and the only
    two escapes were exempting the date entirely or giving the task a fake
    overnight window — one throws the check away, the other hides it in a field
    that means something else.

    Idempotent, and shaped exactly like the date-check migration above: nullable
    columns everywhere (all `ADD COLUMN IF NOT EXISTS` can do without rewriting
    the table), then the GLOBAL level filled in, because that level is the
    chain's floor and a NULL there would mean "inherit" with nothing left to
    inherit from. `leader_ai.resolve_date_plus` reads NULL as 0 regardless, so a
    box that never ran this judges dates exactly as before.
    """
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS date_plus INTEGER"))
        db.execute(text(
            "UPDATE leader_task_defs SET date_plus = 0 WHERE date_plus IS NULL"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task date-plus migration skipped: {exc}")
    finally:
        db.close()


def add_leader_task_proof_kind() -> None:
    """2026-08-19: a task declares HOW its proof is collected — "screenshot"
    (sent to the bot chat, what every task has always done) or "camera" (taken
    in the mini-app, stamped with the server's clock).

    Idempotent, and shaped like the date-check migration above: nullable columns
    everywhere (all `ADD COLUMN IF NOT EXISTS` can do without rewriting the
    table), then the GLOBAL level filled in, because that level is the chain's
    floor and a NULL there would mean "inherit" with nothing left to inherit
    from. `leader_tasks.resolve_proof_kind` reads NULL as "screenshot"
    regardless, so a box that never ran this behaves exactly as before.
    """
    db = SessionLocal()
    try:
        for table in ("leader_task_defs", "leader_task_settings",
                      "leader_task_leader_settings"):
            db.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS proof_kind VARCHAR(12)"))
        db.execute(text(
            "UPDATE leader_task_defs SET proof_kind = 'screenshot' "
            "WHERE proof_kind IS NULL"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader task proof-kind migration skipped: {exc}")
    finally:
        db.close()


# Versioned like the AI purge flag below, and for the same reason: it records
# "this exact clean-up has been applied once". A future one needs a NEW key, or
# the old mark makes it a no-op on every box that has booted.
LEADER_CAMERA_RESET_FLAG = "leader_proof_camera_reset_v1"


def add_leader_entry_closed_at() -> None:
    """2026-08-19: per-TASK submission — a checklist entry can be closed on its
    own, not only as part of its day.

    NULL means "still a draft", which is what every existing row is and what
    every row on a unit outside this mode stays. Nothing is backfilled on
    purpose: an entry inside an already-closed DAY is immutable through the
    day's own `closed_at`, and `leader_close.locked()` reads both — so a
    backfill would write millions of rows to restate a fact already true.
    """
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_task_entries "
            "ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader entry closed_at migration skipped: {exc}")
    finally:
        db.close()


def add_leader_day_reopened() -> None:
    """2026-08-26: an admin can take ONE submitted task back.

    The list of task ids reopened on this day. It lives on the DAY rather than
    on the entry because the admin's «Tozalash» deletes the entry outright, and
    the grace has to outlive it — otherwise `autoclose_due` re-closes the
    emptied task on the deadline that already fired, as "not done", within five
    minutes, and the reopen undoes itself in front of the operator.

    NULL is "nothing was reopened", which is what every existing row is; there
    is nothing to backfill.
    """
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_task_days "
            "ADD COLUMN IF NOT EXISTS reopened JSONB"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader day reopened migration skipped: {exc}")
    finally:
        db.close()


def reset_leader_camera_pilot() -> None:
    """One-shot: take in-app camera capture back to OFF, everywhere.

    Why (user, 2026-08-19): the pilot's `proof_kind` was set at the GLOBAL level
    of the config chain, which is what every unit inherits — so five tasks of
    every leader on the platform started showing the camera prompt instead of
    accepting the photos they had always sent. A test feature reaching people
    who were never in the test is worse than the feature being off.

    Clears all three levels, not just the global one, because the spread's shape
    is not knowable from here: an admin may have written supervisor or leader
    rows through the same modal under a filter. Zero is the only state that is
    certainly right, and re-enrolling one unit is a couple of taps in the
    matrix — which, since `CAMERA_IS_PILOT`, is now the ONLY place it can be
    done.

    Destroys nothing else. Photos already shot keep their rows, their stamps and
    their verdicts; this touches configuration only, so a task switched back on
    finds its roll exactly where it was.
    """
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=LEADER_CAMERA_RESET_FLAG).first():
            return
        n = 0
        for table, blank in (("leader_task_defs", "'screenshot'"),
                             ("leader_task_settings", "NULL"),
                             ("leader_task_leader_settings", "NULL")):
            res = db.execute(text(
                f"UPDATE {table} SET proof_kind = {blank} "
                f"WHERE proof_kind = 'camera'"))
            n += res.rowcount or 0
        db.add(AppSetting(key=LEADER_CAMERA_RESET_FLAG, value="1"))
        db.commit()
        if n:
            print(f"[startup] leader camera pilot: reset {n} proof_kind row(s) to screenshot")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] leader camera reset skipped: {exc}")
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
    the stored copy the same thing. See services/leader_ai.sync_date_flags.

    Since 2026-08-22 the same pass also COMPLETES a stored clock whose day and
    month never made it out of the model while its `raw` transcription carried
    them plainly (`leader_ai.fill_clock_dates`) — those verdicts read
    `date_mismatch` against a date printed on the photo's own face, and they
    correct themselves here at the next boot, still with no Gemini call."""
    db = SessionLocal()
    try:
        from .services.leader_ai import sync_date_flags
        n = sync_date_flags(db)
        if n:
            print(f"[startup] leader-ai: {n} verdict(s) re-derived (window + clock dates)")
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


def add_leader_ai_reviewed_index() -> None:
    """2026-08-23: the progress strip started asking WHEN rows were judged.

    `/leader-ai/progress` is polled every four seconds for as long as a backfill
    takes, and two of its queries now sort or count on `reviewed_at`: the run's
    `done`, and the trailing sample the ETA is measured from (`_pace`). Without
    an index both walk the table on every poll — cheap today, and quietly worse
    every month the corpus grows, which is exactly the shape of cost nobody goes
    looking for. Idempotent."""
    db = SessionLocal()
    try:
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_leader_ai_reviews_reviewed_at "
            "ON leader_ai_reviews (reviewed_at)"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader-ai reviewed_at index skipped: {exc}")
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


ATT_TICK_SEED_FLAG = "att_tick_seed_from_last_day_2026_08_19"


def seed_att_included_from_last_day() -> None:
    """2026-08-19: the «Davomat» tick became a standing preference — every tick
    now writes `cells.att_included`, so a new day starts where the admin left
    it instead of at "does the cell have a supervisor".

    Ticks made BEFORE this change live only inside their own day's batch, so
    the first day after this deploy would still open on the old default and all
    ~139 boxes would have to be set once more. Seed the registry from the LAST
    batch that mentions each cell — the same answer the new rule would have
    given — and only where no permanent decision was ever recorded, so an
    admin's explicit «Doimiy qilish» is never overwritten. Guarded by an
    AppSetting flag so it runs exactly once; changing what it seeds needs a NEW
    flag key."""
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=ATT_TICK_SEED_FLAG).first():
            return
        res = db.execute(text(
            """
            UPDATE cells c
               SET att_included = s.included
              FROM (
                    SELECT DISTINCT ON (bc.cell_id) bc.cell_id, bc.included
                      FROM attendance_batch_cells bc
                      JOIN attendance_batches b ON b.id = bc.batch_id
                     WHERE bc.cell_id IS NOT NULL
                     ORDER BY bc.cell_id, b.date DESC, bc.id DESC
                   ) s
             WHERE c.id = s.cell_id
               AND c.att_included IS NULL
            """
        ))
        db.add(AppSetting(key=ATT_TICK_SEED_FLAG, value="1"))
        db.commit()
        print(f"[startup] att tick seed: {res.rowcount} cell(s) from their last day")
    except Exception as exc:
        db.rollback()
        print(f"[startup] att tick seed skipped: {exc}")
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


def add_concern_seq() -> None:
    """2026-08-22: the concerns «№» is a REGISTER NUMBER, not a row counter.

    It used to print the row's position in the table as it happened to be sorted
    and filtered, so with the default date-desc sort the NEWEST concern read as
    "1", and the same row changed its number the moment anybody touched a
    filter. A number that describes the view cannot name the concern.

    ``seq`` numbers the concerns once, in the order they were raised, and every
    new one takes max+1. The backfill only ever fills NULLs and continues after
    the highest number already handed out, so it is idempotent and can never
    renumber a concern somebody has already quoted.
    """
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS seq INTEGER"
        ))
        db.commit()
        # Read the high-water mark FIRST: an interrupted backfill (or rows
        # created by a process that already had the column) must keep their
        # numbers, and the rest continue after them.
        base = db.execute(text(
            "SELECT COALESCE(MAX(seq), 0) FROM leader_concerns")).scalar() or 0
        # created_at is stamped by the server at insert, so this IS the order the
        # concerns were raised in; id breaks ties and carries any row whose stamp
        # predates the column (sorted first — such a row is an early one).
        db.execute(text(
            "UPDATE leader_concerns c SET seq = r.rn + :base FROM ("
            "  SELECT id, row_number() OVER (ORDER BY created_at NULLS FIRST, id) AS rn"
            "  FROM leader_concerns WHERE seq IS NULL"
            ") r WHERE c.id = r.id"
        ), {"base": base})
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_leader_concerns_seq "
            "ON leader_concerns (seq)"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern seq migration skipped: {exc}")
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


def add_concern_level_since() -> None:
    """Concerns "прошло времени": the clock restarts every time a concern moves
    up or down the chain, so level_since carries the moment it reached the level
    it sits on now. Backfilled from the concern's LAST escalation — that trail
    row is exactly the instant of the move — and from created_at for rows that
    never moved, so no timer renders empty."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_concerns ADD COLUMN IF NOT EXISTS level_since TIMESTAMPTZ"
        ))
        db.execute(text(
            "UPDATE leader_concerns lc SET level_since = COALESCE("
            "  (SELECT MAX(e.created_at) FROM concern_escalations e "
            "     WHERE e.concern_id = lc.id), lc.created_at) "
            "WHERE lc.level_since IS NULL"
        ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern level_since migration skipped: {exc}")
    finally:
        db.close()


def add_concern_escalation_names() -> None:
    """Concern trail: store the handover as PEOPLE, not just levels. ``from_name``
    is whoever held the concern before a move; ``target_name`` (already there,
    but only ever filled on the top-manager step) now carries the receiver on
    every step.

    Legacy rows are backfilled only where the answer is actually on the concern
    and cannot have drifted — the leader and the unit brigadir are snapshot
    columns on ``leader_concerns``, so a past step to/from those two levels is
    recoverable exactly. Shift- and top-management rotate per concern, so a
    historic step to either is left NULL rather than stamped with today's
    holder: an empty name renders as a bare level chip, an invented one is a
    lie the trail exists to prevent."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE concern_escalations ADD COLUMN IF NOT EXISTS from_name VARCHAR"
        ))
        for col, lvl_col in (("from_name", "from_level"), ("target_name", "to_level")):
            db.execute(text(
                f"UPDATE concern_escalations e SET {col} = CASE "
                f"  WHEN e.{lvl_col} = 'supervisor' THEN lc.brigadir_name "
                f"  WHEN e.{lvl_col} = 'leader' THEN lc.leader_name END "
                "FROM leader_concerns lc "
                f"WHERE lc.id = e.concern_id AND e.{col} IS NULL "
                f"  AND e.{lvl_col} IN ('supervisor', 'leader')"
            ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] concern escalation names migration skipped: {exc}")
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


# Named after the shift and the day it was decided, and versioned, for the same
# reason every other one-shot here is: the flag records "this exact backfill has
# been applied once". Widening it later (another shift, an earlier floor) needs
# a NEW key, or the old mark makes the new backfill a no-op on every box that
# has booted.
LEADER_AI_SHIFT2_BACKLOG_FLAG = "leader_ai_shift2_backlog_2026_08_22_v1"


def queue_shift2_backlog() -> None:
    """Send shift 2's already-closed days to the AI, once.

    Lifting the pause (services/leader_ai.REVIEW_PAUSED_SHIFTS) opens the doors
    for days closed FROM NOW ON. It does nothing about the nights closed while
    the pause held, and nothing periodic will find them either: the recurring
    discovery pass is the sheet layer, and shift 2 files only in the bot. Those
    days would sit reviewed-by-nobody forever unless an admin happened to press
    «Tekshirish» — while shift 1 beside them is checked automatically.

    The user's ruling (2026-08-22) is full parity from `AUTO_FROM`, so the floor
    here is that same date and nothing earlier. Every bound that governs a live
    close still governs this: `queue_report` honours the review floor, refuses a
    rehearsal day, skips a ref already queued and only ever queues a task that
    is done AND carries media. So it is insert-only, it is idempotent, and a
    second run (a new flag key) would add exactly the rows the first could not.

    **The cost is real and is the point of the flag**: this is a one-off Gemini
    spend over every shift-2 night since 13 Aug, those nights re-score against
    the verified number, and their reports go out late (the drain's sweep sends
    newest-first, so today's report is never behind a fortnight-old one).
    """
    from app.models import LeaderTaskDay
    from app.services import leader_ai

    if leader_ai.review_paused(2):
        # The pause is back on for shift 2 — queueing its backlog now would be
        # the one thing the pause exists to stop. No flag written, so the guard
        # stays honest about never having run.
        return

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=LEADER_AI_SHIFT2_BACKLOG_FLAG).first():
            return
        units = [m.id for m in db.query(Manager).filter(Manager.shift == 2).all()]
        added = 0
        if units:
            days = (db.query(LeaderTaskDay)
                    .filter(LeaderTaskDay.closed_at.isnot(None),
                            LeaderTaskDay.manager_id.in_(units),
                            LeaderTaskDay.date >= leader_ai.AUTO_FROM)
                    .order_by(LeaderTaskDay.date).all())
            for day in days:
                added += leader_ai.queue_report(db, day=day)
        db.add(AppSetting(key=LEADER_AI_SHIFT2_BACKLOG_FLAG, value="1"))
        db.commit()
        if added:
            # The same record every other automatic hand-off writes, so the
            # admin strip shows this as a run with a bar and an ETA instead of a
            # queue that grew by a thousand rows overnight with no explanation.
            leader_ai.note_auto_run(db, added, "shift 2 backlog")
        print(f"[startup] leader-ai: shift 2 un-paused"
              + (f", {added} backlog proof(s) queued for review" if added
                 else ", no backlog to queue"))
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] leader-ai shift 2 backlog skipped: {exc}")
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


# The read-only internal-API key IT issued for /arc. It lives in the repo
# because this platform has no shell: nobody here can SSH to the box to write
# a .env line, so a key that is not in code is a key that never reaches
# production. The trade-off is deliberate and worth stating — the private
# gitea repo and its GitHub mirror both carry it, so rotating it means editing
# this constant (or, if a deploy is not wanted, setting the Gitea secret
# INTERNAL_API_KEY that deploy/sync-env.sh already syncs, which wins because
# this seed never overwrites a key the file already names). The key opens
# nothing but two read-only ticket lists on their side.
INTERNAL_API_KEY_SEED = "zyGn8UvaDNCvmvKSYJN3wWn366SR778t8jx1MHBhO4giOprxUn"


def ensure_internal_api_key() -> None:
    """Make sure backend/.env defines INTERNAL_API_KEY, and that THIS process
    already has it.

    INSERT-ONLY, like every other seed on this platform: a file that already
    names the key — with any value — is left exactly as it is, so a rotation
    done on the server survives the next deploy. Writing the file alone would
    not be enough either, because pydantic read .env long before this runs, so
    the value is pushed into the live settings object as well; without that the
    boot's own sync jobs would decline as «not connected» until a restart."""
    import os
    from app.config import _ENV_FILE

    path = os.path.abspath(_ENV_FILE)
    try:
        existing = ""
        if os.path.isfile(path):
            with open(path, encoding="utf-8-sig", errors="replace") as fh:
                existing = fh.read()
        named = False
        for line in existing.splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith("export "):
                s = s[len("export "):].lstrip()
            if s.startswith("INTERNAL_API_KEY="):
                named = True
                break
        if not named:
            # A file whose last line has no trailing newline would GLUE the new
            # key onto the previous value (`NOTION_TOKEN=abcINTERNAL_API_KEY=…`)
            # — visible in an editor, invisible to every parser. This is the
            # exact trap the /arc diagnostics panel exists to report.
            prefix = "" if (not existing or existing.endswith("\n")) else "\n"
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(f"{prefix}INTERNAL_API_KEY={INTERNAL_API_KEY_SEED}\n")
            print(f"[startup] INTERNAL_API_KEY written to {path}")
    except OSError as exc:
        # A read-only checkout is not a reason to run without the integration:
        # the in-process fallback below still connects this boot.
        print(f"[startup] could not write INTERNAL_API_KEY to .env: {exc}")

    if not (settings.internal_api_key or "").strip():
        settings.internal_api_key = INTERNAL_API_KEY_SEED
        os.environ.setdefault("INTERNAL_API_KEY", INTERNAL_API_KEY_SEED)


ARC_RESET_FLAG = "arc_internal_api_reset_2026_08_25_v1"


def reset_arc_mirror() -> None:
    """Drop and rebuild the /arc mirror for IT's internal API (2026-08-25).

    The source changed wholesale — a different host, a different auth model and
    a different ticket shape (integer ids and statuses where there were uuids
    and status words, a division where there was a branch, a brigade where
    there was a master, no deadline column at all). Nothing in the old table
    can be re-read under the new columns, so the history is DELETED rather
    than migrated: the first walk after this re-mirrors everything the API
    still holds, which is the whole register.

    Guarded by an AppSetting flag so it runs exactly once — doing it again
    needs a NEW flag key, or the old "already ran" mark makes it a no-op on
    every box that has booted since."""
    from app.database import engine
    from app.models import ArcRequest, ArcSyncMeta, Base

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=ARC_RESET_FLAG).first():
            return
        db.execute(text("DROP TABLE IF EXISTS arc_requests"))
        db.execute(text("DROP TABLE IF EXISTS arc_sync_meta"))
        db.commit()
        # create_all already ran at boot and never ALTERs, so the tables have
        # to be rebuilt HERE, from the new metadata, rather than waiting for
        # the next restart.
        Base.metadata.create_all(bind=engine,
                                 tables=[ArcRequest.__table__, ArcSyncMeta.__table__])
        db.add(AppSetting(key=ARC_RESET_FLAG, value="1"))
        db.commit()
        print("[startup] arc mirror dropped and rebuilt for the internal API")
    except Exception as exc:
        db.rollback()
        print(f"[startup] arc mirror reset skipped: {exc}")
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


def add_leader_photo_client_key() -> None:
    """2026-08-19: one camera shot may reach us twice, and only the PAGE can say
    the two are one shot.

    When the connection dies between the photo's bytes landing here and the
    reply reaching the phone, the page cannot tell "never arrived" from
    "arrived, answer lost" — both surface as a network error — so it keeps the
    shot and re-sends it from the offline queue. Without a key the second POST
    was an ordinary new photo: same picture, same burnt second, the next free
    slot, and the leader's roll carrying the same proof twice (reported from the
    pilot, 2026-08-19).

    The key is minted once per shot before its first attempt and stored with the
    blob, so every attempt carries the same one; the unique index is the
    backstop for two attempts racing. NULL everywhere until a page sends one,
    and Postgres ignores NULLs in a unique index, so old rows and any keyless
    request behave exactly as they did.
    """
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_task_photos "
            "ADD COLUMN IF NOT EXISTS client_key VARCHAR(64)"))
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_ltask_photo_client_key "
            "ON leader_task_photos (leader_id, client_key)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader photo client-key migration skipped: {exc}")
    finally:
        db.close()


def add_leader_unit_bot_from() -> None:
    """2026-08-20: a unit may rehearse in the bot before its filings count.

    A supervisor's unit is switched into in-app camera capture on the day
    somebody has time to teach it, and the leaders spend that day learning where
    the buttons are. Without a floor, that first fumbling day IS the record: the
    camera exception merges the unit's bot days from the moment it is enrolled,
    so the practice run replaces the Google-Form row the unit actually filled in
    properly, and the AI scores it.

    `leader_unit_settings.bot_from` is the day the bot layer takes over for that
    unit. NULL everywhere until an admin opens a window, and the merge rule
    clamps it against `leader_bot.MERGE_FROM`, so a box that never ran this — or
    a unit nobody set one on — behaves exactly as before. Idempotent.
    """
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE leader_unit_settings "
            "ADD COLUMN IF NOT EXISTS bot_from VARCHAR(10)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] leader unit bot-from migration skipped: {exc}")
    finally:
        db.close()


# The camera pilot's rehearsal floor, applied once (user, 2026-08-21).
#
# Enrolling a unit in in-app camera capture and declaring its first days a
# REHEARSAL are two separate acts, and only the first one happened: from the
# moment the pilot supervisor's tasks went to `camera`, `leader_bot.merges()`
# counted the unit's bot days from `MERGE_FROM` (2026-08-19) on. So 20 Aug read
# from the bot — the day the leaders were still learning where the buttons are —
# instead of the Google-Form row they filled in properly, and the AI scored the
# practice run (one leader at 10%). The unit's counted bot layer starts on
# 2026-08-21, which is what `LeaderUnitSetting.bot_from` says; nobody could set
# it retroactively from here without a shell, hence a one-shot.
#
# Versioned like every other one-shot in this file: the flag records "this exact
# floor has been applied once". Moving the date needs a NEW key, or the old
# "already ran" mark makes the new floor a no-op on every box that has booted.
CAMERA_BOT_FROM_FLAG = "leader_camera_bot_from_2026_08_21_v1"
CAMERA_BOT_FROM = "2026-08-21"


def set_camera_pilot_bot_from() -> None:
    """Declare the camera pilot's first days a rehearsal, once.

    **Bounded three ways**, because a floor written on the wrong unit hides days
    somebody's score depends on:

    * only units enrolled in camera capture (`leader_bot.camera_units`) — the
      pilot set, and the only shift-1 units whose bot days merge at all;
    * never shift 2, which files ONLY in the bot: there is no sheet row
      underneath it to fall back to, and the endpoint refuses a floor there for
      the same reason;
    * only a unit that actually HAS closed bot days inside the exposed window
      (`MERGE_FROM` ≤ date < the floor) — i.e. a register currently showing
      practice as the record. A unit enrolled later has none and is left alone,
      so this cannot stamp a stale window on somebody else's matrix.

    A floor already at or past the date is never lowered, and a GLOBAL camera
    default (which enrols every unit at once) aborts the pass outright: 19 units
    silently switched to the sheet is not a pilot fix.

    Nothing is destroyed. `bot_from` moves only which LAYER is read, so the bot
    days keep their photos, entries and verdicts and come back the moment an
    admin moves the window in «Brigada sozlamalari». The queued-but-never-judged
    AI rows for those days go the same way the endpoint sends them
    (`drop_rehearsal_pending`) — they would otherwise cost a Gemini call each and
    be displayed nowhere.
    """
    from app.models import LeaderTaskDay, LeaderTaskDef, LeaderUnitSetting
    from app.services import leader_ai, leader_bot
    from app.services.leader_tasks import set_unit_settings

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=CAMERA_BOT_FROM_FLAG).first():
            return
        if db.query(LeaderTaskDef).filter(LeaderTaskDef.proof_kind == "camera").first():
            # Camera at the GLOBAL level means every unit is "enrolled". Refuse,
            # and deliberately write no flag, so the guard stays honest about
            # never having run.
            print("[startup] camera rehearsal floor skipped: camera is set globally")
            return

        cams = leader_bot.camera_units(db)
        shifts = ({m.id: m.shift for m in
                   db.query(Manager).filter(Manager.id.in_(cams)).all()} if cams else {})
        touched: list[tuple[int, int]] = []
        for mid in sorted(cams):
            if shifts.get(mid) == leader_bot.MERGE_SHIFT:
                continue
            exposed = (db.query(LeaderTaskDay.id)
                       .filter(LeaderTaskDay.manager_id == mid,
                               LeaderTaskDay.closed_at.isnot(None),
                               LeaderTaskDay.date >= leader_bot.MERGE_FROM,
                               LeaderTaskDay.date < CAMERA_BOT_FROM)
                       .first())
            if not exposed:
                continue
            row = db.query(LeaderUnitSetting).filter_by(manager_id=mid).first()
            if row and (row.bot_from or "") >= CAMERA_BOT_FROM:
                continue
            set_unit_settings(db, manager_id=mid,
                              per_task_close=bool(row and row.per_task_close),
                              bot_from=CAMERA_BOT_FROM)
            touched.append((mid, leader_ai.drop_rehearsal_pending(
                db, mid, CAMERA_BOT_FROM)))

        db.add(AppSetting(key=CAMERA_BOT_FROM_FLAG, value="1"))
        db.commit()
        for mid, dropped in touched:
            print(f"[startup] leader bot layer: unit {mid} counts from "
                  f"{CAMERA_BOT_FROM}, earlier bot days are a rehearsal"
                  + (f", {dropped} queued proof(s) dropped" if dropped else ""))
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] camera rehearsal floor skipped: {exc}")
    finally:
        db.close()


# ── Ojidaniya source pilot: one unit reads its cells from 2026-08-21 ─────────
IDLE_SOURCE_PILOT_FLAG = "idle_source_pilot_2026_08_21_v1"
IDLE_SOURCE_PILOT_UNIT = 5
IDLE_SOURCE_PILOT_FROM = "2026-08-21"


def seed_idle_source_pilot() -> None:
    """2026-08-22: the fleet загрузка may now read a unit's ojidaniya off its
    own cells' interval model instead of the «Смена отчёт» row, per unit and
    from a date (`services/idle_source.py`). The pilot is ONE supervisor
    (manager 5, Suvonov Elshod OF, the same unit the per-cell test page is
    locked to) from 2026-08-21 — the owner's decision, and the first date on
    which that unit's leaders filed every ojidaniya as an interval.

    INSERT-ONLY: it writes the row only when the unit has none, so an admin's
    later edit on the «Kutish manbasi» tab (a different date, a switch back
    to the sheet) is never overwritten by a restart. Guarded by an AppSetting
    flag so it runs exactly once; moving the unit or the date needs a NEW
    flag key, or the old "already ran" flag makes the change a no-op on every
    box that has booted once."""
    from app.models import IdleSourceSetting
    from app.services.idle_source import SOURCE_CELLS

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=IDLE_SOURCE_PILOT_FLAG).first():
            return
        unit = db.query(Manager).filter_by(id=IDLE_SOURCE_PILOT_UNIT).first()
        if not unit:
            # A box without the unit (a fresh dev DB) writes no flag, so the
            # guard stays honest about never having run.
            print(f"[startup] idle source pilot: unit {IDLE_SOURCE_PILOT_UNIT} not found")
            return
        existing = (db.query(IdleSourceSetting)
                    .filter_by(manager_id=IDLE_SOURCE_PILOT_UNIT).first())
        if existing:
            print("[startup] idle source pilot: row already set by an admin, left alone")
        else:
            db.add(IdleSourceSetting(manager_id=IDLE_SOURCE_PILOT_UNIT,
                                     source=SOURCE_CELLS,
                                     from_date=IDLE_SOURCE_PILOT_FROM))
            print(f"[startup] idle source pilot: unit {IDLE_SOURCE_PILOT_UNIT} "
                  f"reads its cells from {IDLE_SOURCE_PILOT_FROM}")
        db.add(AppSetting(key=IDLE_SOURCE_PILOT_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] idle source pilot skipped: {exc}")
    finally:
        db.close()


CONCERN_SOLUTION_THREAD_FLAG = "concern_solutions_to_thread_2026_08_24_v1"


def migrate_concern_solutions_to_thread() -> None:
    """2026-08-24: the note a concern is CLOSED with became a message in the
    concern's own comment thread (routers/concerns.py). This moves the notes
    already sitting on `leader_concerns.solution` into the threads they belong
    to and clears the column, so a resolution is read in exactly ONE place —
    without it the register keeps a `✓ …` footnote for the older half of the
    table and a thread message for the newer, which is two answers to one
    question depending on when the concern happened to be closed.

    The message is written with NO author. Nothing on this platform ever
    recorded WHO closed a concern — the row stamps `done_at` and nothing else —
    so a name here would be a guess printed as a fact. `author_telegram_id = 0`
    matches no account, which keeps `is_own` false for every viewer and leaves
    the note uneditable by anyone; the thread renders the author as «—». Its
    `created_at` is the moment the concern was closed, so the message lands in
    the thread where it belongs in time rather than at the bottom.

    Insert-only per concern and flag-guarded: a concern that already carries a
    resolution message (closed since the change) keeps it and only has its
    legacy column cleared. Re-running under a NEW flag key would add exactly
    the notes a first pass could not — the old key makes it a no-op on every
    box that has booted once."""
    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=CONCERN_SOLUTION_THREAD_FLAG).first():
            return
        rows = (
            db.query(LeaderConcern)
            .filter(LeaderConcern.solution.isnot(None), LeaderConcern.solution != "")
            .all()
        )
        already = {
            cid for (cid,) in db.query(LeaderConcernComment.concern_id)
            .filter(LeaderConcernComment.kind == "resolution").all()
        }
        moved = 0
        for c in rows:
            if c.id not in already:
                db.add(LeaderConcernComment(
                    concern_id=c.id,
                    author_telegram_id=0,
                    author_role_ref=None,
                    author_profile=None,
                    author_name=None,
                    text=c.solution.strip(),
                    kind="resolution",
                    created_at=c.done_at or c.updated_at or c.created_at,
                ))
                moved += 1
            c.solution = None
        db.add(AppSetting(key=CONCERN_SOLUTION_THREAD_FLAG, value="1"))
        db.commit()
        print(f"[startup] concern notes → threads: {moved} posted, "
              f"{len(rows)} rows cleared")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] concern notes → threads skipped: {exc}")
    finally:
        db.close()


def create_action_log() -> None:
    """2026-08-23: the ONE action register («Jurnal» admin tab).

    `Base.metadata.create_all` already creates `action_logs` on a fresh box;
    this adds the columns and indexes to a database that predates the table, and
    is the place any later column goes. Append-only by design: nothing here — and
    no endpoint anywhere — ever deletes a row.

    The three composite indexes are the register's own reading order and the two
    filters that always ride with it (a day of one category; everything one
    person ever did). Without them the tab table-scans the whole history to
    render its first page.
    """
    db = SessionLocal()
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS action_logs (
                id BIGSERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ DEFAULT now(),
                category VARCHAR NOT NULL,
                action VARCHAR NOT NULL,
                outcome VARCHAR NOT NULL,
                source VARCHAR NOT NULL,
                actor_profile_key VARCHAR,
                actor_telegram_id BIGINT,
                actor_name VARCHAR,
                actor_role VARCHAR,
                via_capability VARCHAR,
                ghost BOOLEAN NOT NULL DEFAULT false,
                target_kind VARCHAR,
                target_id VARCHAR,
                target_name VARCHAR,
                unit_id INTEGER,
                unit_name VARCHAR,
                day DATE,
                details JSONB,
                changes JSONB,
                reason TEXT,
                enriched BOOLEAN NOT NULL DEFAULT false,
                method VARCHAR,
                path VARCHAR,
                status INTEGER,
                duration_ms INTEGER,
                ip VARCHAR,
                app_version VARCHAR
            )
        """))
        for stmt in (
            "CREATE INDEX IF NOT EXISTS ix_action_logs_at_desc ON action_logs (created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_cat_at ON action_logs (category, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_actor_at ON action_logs (actor_profile_key, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_action ON action_logs (action)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_outcome ON action_logs (outcome)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_source ON action_logs (source)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_unit ON action_logs (unit_id)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_day ON action_logs (day)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_target ON action_logs (target_kind, target_id)",
            "CREATE INDEX IF NOT EXISTS ix_action_logs_tid ON action_logs (actor_telegram_id)",
        ):
            db.execute(text(stmt))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] action log migration skipped: {exc}")
    finally:
        db.close()


def report_unclassified_routes(app) -> None:
    """Name every mutating route the action-log table does not classify.

    The register's coverage rests on ONE list (``action_log.ROUTES``), and the
    only thing that keeps one list complete is the app saying out loud when a
    route has fallen out of it. Such a route is still RECORDED — under
    «other» — so nothing is ever lost silently; this is what makes it visible.
    """
    try:
        from app.services.action_log import unmatched_routes
        missing = unmatched_routes(app)
        if missing:
            print(f"[startup] ACTION-LOG: {len(missing)} unclassified mutating route(s): "
                  + ", ".join(missing[:20]) + ("…" if len(missing) > 20 else ""))
    except Exception as exc:
        print(f"[startup] action log route check skipped: {exc}")


def report_leader_deadline_rules() -> None:
    """Check the task-closing arithmetic at boot, and say so out loud when it
    is wrong.

    The scar this is cut from: on 2026-08-26 a per-task shift-2 unit had its
    whole checklist closed and AI-failed hours before its windows opened, and
    nobody found out from the platform — a leader complained. The follow-up
    audit found a second, quieter version of the same defect still live. Neither
    raised, logged or failed anything; both simply cost people points.

    So the rules now assert themselves (`leader_close.self_check`), on a repo
    with no test suite where a push to `main` is a deploy. A violation is
    printed with the deploy output AND sent to the support chat / every admin,
    because this platform has no shell: a log nobody can open is not a warning.
    Never raises — a broken CHECK must not be able to take the app down.
    """
    try:
        from app.services.leader_close import self_check
        bad = self_check()
    except Exception as exc:
        print(f"[startup] leader deadline self-check skipped: {exc}")
        return
    if not bad:
        print("[startup] leader deadline rules: OK")
        return

    head = (f"{len(bad)} violation(s) of the task-closing rules — leaders may "
            f"be locked out at the wrong hour")
    print("[startup] LEADER DEADLINE RULES: " + head)
    for line in bad[:20]:
        print(f"[startup]   · {line}")
    try:
        import html
        from app.routers.boot import _recipients
        from app.telegram_bot import bot
        text = ("🛑 <b>Leader checklist deadline rules broken</b>\n"
                f"{html.escape(head)}.\n\n<pre>"
                + html.escape("\n".join(bad[:12])) + "</pre>\n"
                "Tasks may close at an hour the leader was never shown.")
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text, parse_mode="HTML")
            except Exception:
                pass
    except Exception as exc:
        print(f"[startup] deadline-rule alert not delivered: {exc}")


PP_AUTOFILL_DEFAULT_FLAG = "pp_autofill_default_2026_08_31_v1"
PP_AUTOFILL_DEFAULT_UNITS = ("Suvonov Elshod OF", "Aripova Manzura", "Talipova Mamura")


def _fold_name(s: str) -> str:
    """Casefolded, whitespace-collapsed — the only normalisation applied when
    matching a unit by name. Deliberately nothing more: a looser rule here would
    silently switch off the wrong brigadir."""
    return " ".join((s or "").split()).casefold()


def seed_pp_autofill_default() -> None:
    """2026-08-31 (the operator's call): the plant-wide SAP фаза/заголовок upload
    fills ONLY these three units by default — Suvonov Elshod OF, Aripova Manzura
    and Talipova Mamura. Every other brigadir's ПЛАН/ФАКТ is entered by hand, so
    every other unit gets `pp_manager_settings.auto_fill = False`.

    Config only: no pp_daily row, override or catalog is touched, so this moves
    no number by itself — it only decides who the NEXT unattended upload reaches.
    An upload naming its targets explicitly still reaches a switched-off unit.

    Three guards, each closing a way this could quietly do the wrong thing:

    * ALL THREE names must resolve, or NOTHING is written and no flag is set.
      Switching everyone off while failing to switch the three on would leave the
      next upload with nobody to write to — the endpoint answers 400, so it is
      loud rather than lossy, but it is still not a state to boot into. A name
      that did not match is printed, and 4 presses on the «SAP avto-to'ldirish»
      register do the same job by hand.
    * It states an END STATE and writes it, rather than declining when the
      register already holds rows. The three units were named by the operator
      AFTER the register shipped, so a row toggled in the meantime is not an
      opinion this must yield to — it is the very thing being answered. The
      flag is what protects every LATER edit: this runs exactly once, and from
      the next boot on the register is entirely the admin's.
    * Every non-archived unit is switched off, not just the CONFIGURED ones, so a
      brigadir who is given a catalog later starts off manual too — which is what
      "only these three" means. Absent row still reads as ON, so a unit created
      after this ran is on until an admin says otherwise.

    Guarded by an AppSetting flag so it runs exactly once. Changing the three
    units needs a NEW flag key, or the old "already ran" mark makes the change a
    no-op on every box that has booted once.
    """
    from app.models import PPManagerSetting

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PP_AUTOFILL_DEFAULT_FLAG).first():
            return

        units = db.query(Manager).filter(Manager.archived.is_(False)).all()
        by_fold: dict[str, list] = {}
        for m in units:
            by_fold.setdefault(_fold_name(m.name), []).append(m)

        keep, unresolved = set(), []
        for want in PP_AUTOFILL_DEFAULT_UNITS:
            w = _fold_name(want)
            # Exact first. The prefix fallback runs BOTH ways because the unit
            # suffix drifts between the register and how people write the name
            # («Suvonov Elshod» vs «Suvonov Elshod OF»), and it is accepted only
            # when exactly ONE unit matches — an ambiguous prefix names nobody.
            hit = by_fold.get(w) or [
                m for m in units
                if _fold_name(m.name).startswith(w) or w.startswith(_fold_name(m.name))
            ]
            if len(hit) == 1:
                keep.add(hit[0].id)
            else:
                unresolved.append(f"{want} ({'ambiguous' if hit else 'not found'})")

        if unresolved:
            # No flag: the guard stays honest about never having run, so fixing
            # a spelling and redeploying still applies it. The roster is printed
            # because the whole fix is one corrected string, and without it the
            # operator has to go and look the spellings up.
            print("[startup] pp autofill default: NOT applied — "
                  + "; ".join(unresolved)
                  + " | units on this box: "
                  + ", ".join(sorted(m.name or f"#{m.id}" for m in units)))
            return

        rows = {r.manager_id: r for r in db.query(PPManagerSetting).all()}
        for m in units:
            want_on = m.id in keep
            row = rows.get(m.id)
            if row is None:
                # An absent row already reads as ON, so only the OFF half needs
                # writing — and writing the ON half anyway would be a row that
                # says exactly what its absence says.
                if not want_on:
                    db.add(PPManagerSetting(manager_id=m.id, auto_fill=False))
            elif bool(row.auto_fill) != want_on:
                row.auto_fill = want_on
        print(f"[startup] pp autofill default: auto-fill ON for "
              f"{', '.join(sorted(m.name for m in units if m.id in keep))}; "
              f"{len(units) - len(keep)} other unit(s) manual")
        db.add(AppSetting(key=PP_AUTOFILL_DEFAULT_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] pp autofill default skipped: {exc}")
    finally:
        db.close()


PP_COLS_PLAN_FIRST_FLAG = "pp_positions_plan_before_fact_2026_09_01_v1"
PP_COLS_PREF_KEY = "production.positions.cols"


def reorder_positions_plan_before_fact() -> None:
    """2026-09-01 (the operator's call): on the Production «Позиции» table ПЛАН
    comes before Факт. `COLS` in `Production.jsx` is the default and answers for
    everybody who has never touched the column picker — but the picker persists
    an ORDER per profile (`ui_prefs`, key `production.positions.cols`), and the
    page's reconciler deliberately keeps a saved order for every key it already
    knows. So a supervisor who once hid a column — i.e. exactly the people who
    use the table hardest — would go on reading Факт first forever.

    This moves `plan` to sit directly BEFORE `fact` in each saved order, and
    changes nothing else: the rest of that profile's arrangement, and its
    `hidden` list, are untouched, so a hidden column stays hidden and a column
    somebody moved stays where they put it. A profile that already reads
    plan-then-fact is left alone.

    Config only — no production figure is read or written, and the picker is
    still the operator's: anyone who wants the old order back drags it back on
    their own row, and this never runs again.

    Guarded by an AppSetting flag so it runs exactly once. Changing what it does
    needs a NEW flag key, or the old "already ran" mark makes the change a no-op
    on every box that has booted once.
    """
    import json

    from app.models import UiPref

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PP_COLS_PLAN_FIRST_FLAG).first():
            return

        moved = 0
        for row in db.query(UiPref).filter(UiPref.pref_key == PP_COLS_PREF_KEY).all():
            try:
                cfg = json.loads(row.value or "")
            except Exception:
                continue  # an unreadable blob is one the page already ignores
            if not isinstance(cfg, dict):
                continue
            order = cfg.get("order")
            if not isinstance(order, list):
                continue
            try:
                fi, pi = order.index("fact"), order.index("plan")
            except ValueError:
                continue  # a pref written before both columns existed
            if pi < fi:
                continue
            order.pop(pi)
            order.insert(order.index("fact"), "plan")
            cfg["order"] = order
            row.value = json.dumps(cfg)
            moved += 1

        print(f"[startup] positions columns: ПЛАН moved ahead of Факт on {moved} saved layout(s)")
        db.add(AppSetting(key=PP_COLS_PLAN_FIRST_FLAG, value="1"))
        db.commit()
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] positions column reorder skipped: {exc}")
    finally:
        db.close()
