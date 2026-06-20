"""One-time startup tasks (idempotent)."""
from collections import defaultdict
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from app.config import settings
from app.database import SessionLocal
from app.models import (
    Admin, AppSetting, Attendance, DayApproval, EditRequest, ExchangeTask,
    HrDocument, Language, Manager, SheetSource, TelegramUser, TelegramUserRole,
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


def seed_admins() -> None:
    """Seed the admins table from ADMIN_TELEGRAM_ID (comma-separated) the
    first time — i.e. only while the table is empty. Once seeded, admins are
    managed in the DB and .env changes are ignored. Emptying the table
    deliberately re-seeds from .env on next startup (lockout recovery)."""
    db = SessionLocal()
    try:
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
PP_CATALOG_VERSION = "2"
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
        for w in seed.get("work_centers", []):
            wc = existing.get(w["code"])
            if wc:
                wc.shtatka = w.get("shtatka") or 0
                wc.capacity = w.get("capacity")
            else:
                db.add(PPWorkCenter(
                    manager_id=mid, code=w["code"], shtatka=w.get("shtatka") or 0,
                    capacity=w.get("capacity"), sort_order=w.get("sort_order", 0),
                ))

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
        db.commit()
        print(f"[startup] seeded production pilot for manager {mid}: "
              f"{len(seed.get('products', []))} products, {len(seed.get('work_centers', []))} WCs")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] production pilot seed skipped: {exc}")
    finally:
        db.close()


def seed_managers_and_sources() -> None:
    """Ensure supervisors (managers) and sheet sources exist (idempotent)."""
    db = SessionLocal()
    try:
        for mgr_id, name, shift in MANAGERS:
            existing = db.query(Manager).filter(Manager.id == mgr_id).first()
            if not existing:
                db.add(Manager(id=mgr_id, name=name, shift=shift))
                print(f"[startup] Added manager {mgr_id}: {name}")

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
