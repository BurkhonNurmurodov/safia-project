"""One-time startup tasks (idempotent)."""
from collections import defaultdict
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from app.config import settings
from app.database import SessionLocal
from app.models import (
    Admin, AppSetting, Attendance, DayApproval, EditRequest, ExchangeTask,
    HrDocument, Language, LeaderConcern, Manager, RoleProfile, SheetSource,
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

SHEET_SOURCES = [
    ("source", "1q-4PTcnGNNsGzXmXAIa5HE2Ze0f6hQ-7dKagvHSH2eI"),
    ("shift_report", "1qCntFNUhy5GdSHhByK5gtVd9T8hqp6Dn4oPbrCujZQ8"),
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
