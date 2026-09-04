"""ONE-SHOT: erase a TEST brigadir unit, its leaders and their whole history.

    ⚠ TEMPORARY. DELETE THIS FILE — and its two call sites, in `app/main.py`
      and `passenger_wsgi.py` — IN THE VERSION AFTER IT HAS RUN. It is a
      one-shot erase of pretend data, not a feature; left in the tree it is a
      loaded destructive pass sitting in every future deploy.

It lives in a module of its own rather than in `app/startup.py` for exactly
that reason: removing it later is deleting one file and two lines, not surgery
inside four thousand lines of migrations that must all stay.

Why it exists at all — the Profiles tab cannot do this. `admin_delete_profile`
ARCHIVES a unit that holds any history row (attendance, a day approval, a
production figure, a filed checklist) instead of deleting it. That is the right
default for a real unit and the wrong answer for one created to try the
platform out, which is precisely the unit that will have collected a few of
each. This is the hard delete, run once, by name.

NOTHING HERE IS REVERSIBLE. There is no undo, no snapshot and no soft-delete:
the rows are gone. The «Backup» admin tab is the only way back, and only if a
dump was taken first.
"""

from sqlalchemy import text

from app.database import SessionLocal
from app.models import AppSetting, Manager, RoleProfile

PURGE_TEST_UNITS_FLAG = "purge_test_units_2026_09_04_v1"

# ── THE ONE THING TO FILL IN ─────────────────────────────────────────────────
# The brigadir unit names to erase, spelled as `managers.name` spells them.
# Every leader profile under a named unit goes with it, and so does everything
# either of them ever filed.
#
# An EMPTY list makes this do NOTHING — no query, no delete, and no flag, so
# filling it in later still runs. It ships empty on purpose: a destructive pass
# whose targets nobody has named must not be able to fire by being deployed.
PURGE_TEST_UNITS: list[str] = []

# The Jurnal (`action_logs`) is documented as append-only forever — no delete
# route, no purge tool, no retention job. Erasing rows from it reverses that
# invariant, so it is opt-in and kept separate from the data purge above. Set
# True only if the operator has asked the register to forget these units too.
PURGE_TEST_UNIT_ACTION_LOGS = False


# Every column in the schema that names a MANAGER, ordered so that a table whose
# rows are pointed at comes after the rows pointing at it. All of these FKs are
# NO ACTION, never CASCADE, so a wrong order is an IntegrityError rather than a
# silent extra delete.
_UNIT_TABLES = [
    ("pp_line_daily",               "manager_id"),
    ("pp_work_center_daily",        "manager_id"),
    ("pp_reconciliation",           "manager_id"),
    ("pp_daily",                    "manager_id"),
    ("pp_day_settings",             "manager_id"),
    ("pp_uploads",                  "manager_id"),
    ("pp_products",                 "manager_id"),
    ("pp_work_centers",             "manager_id"),
    ("pp_manager_settings",         "manager_id"),
    ("attendance",                  "manager_id"),
    ("day_approvals",               "manager_id"),
    ("daily_submissions",           "manager_id"),
    ("edit_requests",               "manager_id"),
    ("comments",                    "manager_id"),
    ("forecast_call_notices",       "manager_id"),
    ("leader_task_config_audit",    "manager_id"),
    ("leader_task_pending_changes", "manager_id"),
    ("leader_task_settings",        "manager_id"),
    ("leader_task_examples",        "manager_id"),
    ("leader_unit_settings",        "manager_id"),
    ("leader_cutoffs",              "manager_id"),
    ("leader_day_exclusions",       "manager_id"),
    ("leader_late_requests",        "manager_id"),
    ("leader_concerns",             "brigadir_manager_id"),
    ("leader_tasks",                "supervisor_manager_id"),
    ("setup_times",                 "manager_id"),
    ("idle_source_settings",        "manager_id"),
]

# Rows keyed by a LEADER profile that `routers.profiles._purge_leader_profile`
# does not know about — each one a feature added after that function was written
# (cutoffs, day exclusions, the day-source override, per-level example photos).
# None of them carries an FK, so none BLOCKS the delete: they would simply be
# left pointing at a profile that no longer exists.
_LEADER_LEFTOVERS = [
    ("leader_cutoffs",        "leader_profile_id"),
    ("leader_day_exclusions", "leader_profile_id"),
    ("leader_day_sources",    "leader_profile_id"),
    ("leader_task_examples",  "leader_id"),
]


def _have(db, table: str) -> bool:
    """Is this table on THIS box? The purge is one transaction, so a statement
    against a table the schema does not have would abort every delete beside it
    rather than only itself."""
    return bool(db.execute(text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = :t"), {"t": table}).first())


def _resolve(db, name: str) -> list[tuple[int, str]]:
    """One name → the units it can mean. Exact match first; failing that a
    both-ways prefix, accepted only when it lands on exactly one unit — the rule
    `startup.seed_pp_autofill_default` already applies. `startup.MANAGERS` is a
    stale seed whose ids no longer describe production, which is why this
    matches on NAME and never on an id typed into this file."""
    wanted = (name or "").strip().casefold()
    if not wanted:
        return []
    rows = [(i, n, (n or "").strip().casefold()) for i, n in
            db.query(Manager.id, Manager.name).all()]
    exact = [(i, n) for i, n, f in rows if f == wanted]
    if exact:
        return exact
    return [(i, n) for i, n, f in rows
            if f and (f.startswith(wanted) or wanted.startswith(f))]


def purge_test_units() -> None:
    """Erase the units named in `PURGE_TEST_UNITS`, whole.

    Refuses as a BLOCK. If any one name fails to resolve to exactly one unit,
    nothing is deleted and no flag is written — the roster is printed instead,
    so the fix is one corrected string and the next boot runs it. Deleting the
    three units whose names happened to match while silently skipping the fourth
    is the one outcome a purge like this must never produce.

    ONE transaction. A unit's tables are a dependency chain, not a set of
    independent purges, so a failure halfway through has to leave the unit whole
    rather than half-erased; every statement rolls back together.

    Flag-guarded because a redeploy restarts the process: without it the
    resolution and the roster print would run on every boot forever. Changing
    what this does needs a NEW flag key — the old "already ran" mark makes an
    edit invisible on every box that has booted once.
    """
    if not PURGE_TEST_UNITS:
        return  # ships inert: nobody has named a target

    from app.models import ApprovalNotice
    from app.routers.profiles import (
        _bound_role_rows, _purge_leader_profile, _purge_profile_key, _remove_role_row,
    )

    db = SessionLocal()
    try:
        if db.query(AppSetting).filter_by(key=PURGE_TEST_UNITS_FLAG).first():
            return

        # ── Resolve every name, or refuse the lot ────────────────────────────
        targets: dict[int, str] = {}
        problems: list[str] = []
        for wanted in PURGE_TEST_UNITS:
            hits = _resolve(db, wanted)
            if len(hits) == 1:
                targets[hits[0][0]] = hits[0][1]
            elif not hits:
                problems.append(f"{wanted!r}: no unit matches")
            else:
                problems.append(f"{wanted!r}: {len(hits)} units match "
                                f"({', '.join(n for _, n in hits)})")
        if problems:
            roster = ", ".join(f"{n} (#{i})" for i, n in
                               db.query(Manager.id, Manager.name)
                                 .order_by(Manager.name).all())
            print("[startup] test-unit purge REFUSED, nothing deleted:")
            for p in problems:
                print(f"[startup]   - {p}")
            print(f"[startup]   units on this box: {roster}")
            return  # deliberately no flag — a corrected name must still run

        unit_ids = list(targets)
        counts: dict[str, int] = {}

        def wipe(table: str, col: str, ids: list, key: str | None = None) -> None:
            if not ids or not _have(db, table):
                return
            n = db.execute(text(f"DELETE FROM {table} WHERE {col} = ANY(:ids)"),
                           {"ids": list(ids)}).rowcount or 0
            if n:
                counts[key or table] = counts.get(key or table, 0) + n

        # ── 1. The leader profiles under these units ─────────────────────────
        leader_ids = [i for (i,) in db.query(RoleProfile.id)
                      .filter(RoleProfile.role == "leader",
                              RoleProfile.manager_id.in_(unit_ids)).all()]

        # Late proofs hang off `leader_task_days.id` through a NO ACTION FK that
        # `_purge_leader_profile` predates and does not clear, so they must go
        # BEFORE it runs or its own DELETE of the days raises.
        if leader_ids and _have(db, "leader_late_proofs"):
            wipe("leader_late_proof_media", "late_proof_id",
                 [i for (i,) in db.execute(text(
                     "SELECT id FROM leader_late_proofs WHERE leader_id = ANY(:ids)"),
                     {"ids": leader_ids}).all()])
            wipe("leader_late_proofs", "leader_id", leader_ids)
        wipe("leader_late_proof_shots", "leader_id", leader_ids)

        for lid in leader_ids:
            _purge_leader_profile(db, lid)          # THE shared leader purge
            _purge_profile_key(db, "leader", lid)   # login, avatar, grants, prefs
            for r in _bound_role_rows(db, "leader", lid):
                _remove_role_row(db, r)
        for table, col in _LEADER_LEFTOVERS:        # what that purge cannot see
            wipe(table, col, leader_ids)
        if leader_ids:
            counts["leader profiles"] = db.execute(text(
                "DELETE FROM role_profiles WHERE id = ANY(:ids)"),
                {"ids": leader_ids}).rowcount or 0

        # ── 1b. Refuse rather than reach into ANOTHER unit's leader ──────────
        # These four carry `manager_id` with no FK, so a day filed while its
        # leader belonged to THIS unit still names it after that leader moved
        # elsewhere. Anything still standing here after the purge above belongs
        # to a leader we are not deleting: erasing it would destroy a real
        # unit's filed work, and leaving it orphans a row against a manager that
        # is about to vanish. Neither is ours to choose, so the whole pass backs
        # out and says which table and how many.
        stranded = []
        for table in ("leader_task_days", "leader_ai_reviews",
                      "leader_ai_disputes", "leader_day_reports"):
            if not _have(db, table):
                continue
            n = db.execute(text(
                f"SELECT count(*) FROM {table} WHERE manager_id = ANY(:ids)"),
                {"ids": unit_ids}).scalar() or 0
            if n:
                stranded.append(f"{table} {n}")
        if stranded:
            db.rollback()
            print("[startup] test-unit purge REFUSED, nothing deleted: rows name "
                  f"these units but belong to a leader outside them — {', '.join(stranded)}. "
                  "Move or delete those leaders first.")
            return  # deliberately no flag — a corrected state must still run

        # ── 2. A live Telegram button must not outlive its document ──────────
        # `approval_notices.ref` is a plain STRING with no FK, so the ids are
        # gathered while the documents are still there. Orphan one and the next
        # tap resolves a document that no longer exists.
        if _have(db, "hr_documents") and _have(db, "approval_notices"):
            doc_ids = [str(i) for (i,) in db.execute(text(
                "SELECT id FROM hr_documents WHERE manager_id = ANY(:ids)"),
                {"ids": unit_ids}).all()]
            if doc_ids:
                counts["approval_notices"] = (
                    db.query(ApprovalNotice)
                      .filter(ApprovalNotice.kind == "hr_document",
                              ApprovalNotice.ref.in_(doc_ids))
                      .delete(synchronize_session=False) or 0)
        # hr_document_history rides an ON DELETE CASCADE and needs no statement.
        wipe("hr_documents", "manager_id", unit_ids)

        # ── 3. The unit's cells, children first ──────────────────────────────
        cell_ids = [i for (i,) in db.execute(text(
            "SELECT id FROM cells WHERE manager_id = ANY(:ids)"),
            {"ids": unit_ids}).all()]
        # cell_ojidaniya, cell_ojidaniya_intervals and cell_perenaladka all
        # CASCADE off the cell; these two do not.
        wipe("cell_attendance", "cell_id", cell_ids)
        wipe("attendance_batch_cells", "cell_id", cell_ids)
        wipe("cells", "manager_id", unit_ids)

        # ── 4. Everything else the unit owns, then the unit itself ───────────
        for table, col in _UNIT_TABLES:
            wipe(table, col, unit_ids)
        for uid in unit_ids:
            for r in _bound_role_rows(db, "supervisor", uid):
                _remove_role_row(db, r)
            _purge_profile_key(db, "supervisor", uid)
        counts["units"] = db.execute(text(
            "DELETE FROM managers WHERE id = ANY(:ids)"),
            {"ids": unit_ids}).rowcount or 0

        # ── 5. The Jurnal, only if asked ─────────────────────────────────────
        if PURGE_TEST_UNIT_ACTION_LOGS and _have(db, "action_logs"):
            counts["action_logs"] = db.execute(text(
                "DELETE FROM action_logs WHERE unit_id = ANY(:ids)"),
                {"ids": unit_ids}).rowcount or 0

        db.add(AppSetting(key=PURGE_TEST_UNITS_FLAG, value="1"))
        db.commit()
        named = ", ".join(f"{n} (#{i})" for i, n in targets.items())
        detail = ", ".join(f"{k} {v}" for k, v in sorted(counts.items()) if v) or "nothing"
        print(f"[startup] test units erased: {named} — {detail}")
    except Exception as exc:  # pragma: no cover — never block startup
        db.rollback()
        print(f"[startup] test-unit purge skipped: {exc}")
    finally:
        db.close()
