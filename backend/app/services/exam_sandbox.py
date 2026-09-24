"""The exam sandbox — the fictional unit every examinee works in, and the
one table its records live in (``exam_sandbox_rows``, models.ExamSandboxRow).

Nothing here touches a real resource table. ``routers/exam_sandbox.py``
re-implements the leader-facing subset of each page's API over these rows,
answering the SAME shapes the pages read (see docs/plan-dashboard-exam.md and
the contract maps it was built from); this module owns the fixtures, the row
helpers and the serializers, so the router stays a thin translation of HTTP
into calls here.

The unit is identical for everybody (ruling 12): brigadir Imtihonov Alisher,
unit «Imtihon brigadasi», cells 9901 and 9902 whose leader is the examinee,
three workers. Fixture rows keep RELATIVE dates (``entry_days`` = days ago) and
are rendered against the clock at read time, so a task that says «yesterday»
or a board scoped to the last seven days reads right on every sitting;
records the leader creates carry absolute timestamps.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import ExamAttempt, ExamSandboxRow, LeaderTaskDef, RoleProfile
from app.services.idle_intervals import span, summarize
from app.services.ojidaniya_matrix import today_local

# The request-path prefixes the client rewrites to /api/exam/sandbox/… while
# the mode is on. Server-owned, published on GET /api/exam/me. Matched on a
# path boundary (prefix + end, "/" or "?"), so /api/tasks never catches
# /api/tasks-something and /api/leaders (Monitoring, real) stays untouched.
SANDBOX_PREFIXES = [
    "/api/tasks",
    "/api/concerns",
    "/api/cell-concerns",
    "/api/idle-cell",
    "/api/leaders/report/",
    "/api/leaders/disputes",
    "/api/leaders/late-proofs",
    "/api/notifications",
    "/api/ui-prefs",
]

# localStorage keys the client parks on entering the mode and restores on
# leaving it — the pages' persisted filters, which would otherwise blank a
# sandbox register with no error. Served with the prefixes.
PARKED_KEYS = [
    "tasks_", "concerns_", "cellConcerns.", "idle_cell_", "leaders_",
    "zagruzka_heatmap_mode", "notif_read_ids", "education_",
]

UNIT_ID = 999901
UNIT_NAME = "Imtihon brigadasi"
BRIGADIR = "Imtihonov Alisher"
BRIGADIR_PROFILE = f"supervisor:{UNIT_ID}"
CELLS = [
    {"cell_id": 999901, "code": "9901"},
    {"cell_id": 999902, "code": "9902"},
]
WORKERS = ["Karimov Bobur", "Saidova Nilufar", "To'xtayev Rustam"]
LANGS = ("uz", "uz_cyrl", "ru", "en")

CONCERN_CATEGORIES = [
    "ars", "inventory", "warehouse", "fridge", "procurement", "logistics", "it",
    "washing", "plan", "hr", "technologist", "raw_material", "security", "kitchen", "other",
]
CONCERN_STATUSES = ("todo", "doing", "done")
LEVELS = ["leader", "supervisor", "shift-manager", "top-manager"]
MAX_DEADLINE_DAYS = 365
IDLE_CATEGORIES = ["Cat A", "Cat A2", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
                   "Cat E", "Cat F", "Cat G", "Cat H", "Cat I"]
ALWAYS_STOPPED = {"Cat H"}

# The fixture day report's checklist weights — chosen so the numbers the tasks
# ask about hold exactly: submitted 85 (task 9 never filed, 15 points) and
# verified 62 (task 5 refused, 23 points).
REPORT_WEIGHTS = {1: 6, 2: 6, 3: 6, 4: 6, 5: 23, 6: 6, 7: 6, 8: 6, 9: 15, 10: 6, 11: 6, 12: 4, 13: 4}
REPORT_REJECTED_TASK = 5
REPORT_MISSED_TASK = 9
REPORT_SCORE = 62
REPORT_RAW = 85
DISPUTE_FX_TASK = 3       # the approved objection filed three days ago
LATE_PROOF_TASK = 7       # waiting on the brigadir


@dataclass
class Ctx:
    """Who is sitting the exam — what the fixtures are personalised with."""
    attempt_id: int
    profile_key: str
    leader_name: str
    leader_profile_id: Optional[int]
    shift: int


def ctx_for(db: Session, attempt: ExamAttempt, full_name: str = "") -> Ctx:
    role, _, ref = (attempt.profile_key or "").partition(":")
    prof = None
    if role == "leader" and ref.isdigit():
        prof = db.query(RoleProfile).filter_by(id=int(ref)).first()
    shift = 1
    if prof is not None and prof.manager_id:
        from app.models import Manager
        m = db.query(Manager).filter_by(id=prof.manager_id).first()
        if m is not None and m.shift in (1, 2):
            shift = m.shift
    return Ctx(
        attempt_id=attempt.id,
        profile_key=attempt.profile_key,
        leader_name=(prof.name if prof is not None else "") or full_name or "Lider",
        leader_profile_id=prof.id if prof is not None else None,
        shift=shift,
    )


# ── time helpers ──────────────────────────────────────────────────────────────

def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def rel_dt(data: dict, key: str) -> Optional[datetime]:
    """An absolute ``<key>`` or a relative ``<key>_days`` (float days ago)."""
    v = data.get(key)
    if v:
        try:
            return datetime.fromisoformat(v)
        except ValueError:
            return None
    d = data.get(f"{key}_days")
    if d is None:
        return None
    return now() - timedelta(days=float(d))


def rel_date(data: dict, key: str) -> Optional[date]:
    v = data.get(key)
    if v:
        try:
            return date.fromisoformat(v)
        except ValueError:
            return None
    d = data.get(f"{key}_days")
    if d is None:
        return None
    return today_local() - timedelta(days=int(d))


# ── rows ──────────────────────────────────────────────────────────────────────

def rows(db: Session, attempt_id: int, kind: str) -> list[ExamSandboxRow]:
    return (db.query(ExamSandboxRow)
            .filter(ExamSandboxRow.attempt_id == attempt_id, ExamSandboxRow.kind == kind)
            .order_by(ExamSandboxRow.id).all())


def get_row(db: Session, attempt_id: int, kind: str, rid: int) -> Optional[ExamSandboxRow]:
    return (db.query(ExamSandboxRow)
            .filter(ExamSandboxRow.attempt_id == attempt_id, ExamSandboxRow.kind == kind,
                    ExamSandboxRow.id == rid).first())


def fx_row(db: Session, attempt_id: int, kind: str, fx: str) -> Optional[ExamSandboxRow]:
    for r in rows(db, attempt_id, kind):
        if r.data.get("fx") == fx:
            return r
    return None


def add(db: Session, attempt_id: int, kind: str, data: dict) -> ExamSandboxRow:
    r = ExamSandboxRow(attempt_id=attempt_id, kind=kind, data=dict(data), created_at=now())
    db.add(r)
    db.flush()
    return r


def put(r: ExamSandboxRow, **changes) -> None:
    """JSONB is compared by identity: replace the dict so the ORM sees it."""
    d = dict(r.data)
    d.update(changes)
    r.data = d
    r.updated_at = now()


def wipe(db: Session, attempt_id: int) -> int:
    n = db.query(ExamSandboxRow).filter(ExamSandboxRow.attempt_id == attempt_id).delete()
    return n


# ── fixtures ──────────────────────────────────────────────────────────────────

def seed(db: Session, ctx: Ctx) -> None:
    """The fictional unit's records, written once per attempt start."""
    a = ctx.attempt_id
    L = ctx.leader_name
    # Tasks from the brigadir. `due_days` = days from today (negative = past).
    tasks = [
        ("T1", "Pech zichlagichlarini tekshirish",          None, "todo",  1,  2.0, None),
        ("T2", "SOP bo'yicha smena topshirish",              1,    "todo",  0,  1.5, None),
        ("T3", "Xamir aralashtirgichni tozalash",            None, "todo",  3,  3.0, None),
        ("T4", "Sovutgich haroratini yozib borish",          None, "todo", -2,  5.0, None),
        ("T5", "Yangi ishchiga yo'riqnoma o'tkazish",        None, "done", -1,  4.0, 1.0),
        ("T6", "Ombor bilan qadoq materialini kelishish",    None, "todo",  5,  2.5, None),
    ]
    for fx, text, prio, status, due_days, created_days, completed_days in tasks:
        r = add(db, a, "task", {
            "fx": fx, "task_text": text, "priority": prio, "status": status,
            "due_days": due_days, "created_at_days": created_days,
            "completed_at_days": completed_days,
            "created_by_name": BRIGADIR, "created_by_profile": BRIGADIR_PROFILE,
        })
        if fx == "T6":
            for i, txt in enumerate(["Qadoq plyonkasi qachon keladi?", "Omborga bugun ayting"]):
                add(db, a, "task_comment", {
                    "task_id": r.id, "author_name": BRIGADIR, "author_profile": BRIGADIR_PROFILE,
                    "text": txt, "created_at_days": 2.0 - i * 0.3,
                })
    # Concerns. C rows: the leader's own, to the brigadir (C1/C2 sent BACK to
    # the leader, so they hold them). W rows: workers → the leader, cell 9901.
    concerns = [
        # fx, text, status, level, category, cell, worker, entry_days, deadline_days, deadline_from_days, completion_days
        ("C1", "Un elagi shovqin qilmoqda",          "todo",  "leader",     "inventory", "9901", None, 5, None, None, None),
        ("C2", "Sovutgich eshigi yopilmaydi",        "doing", "leader",     "fridge",    "9901", None, 3, 3, 1, None),
        ("C3", "Qadoq plyonkasi tugagan",            "done",  "supervisor", "warehouse", "9902", None, 6, 2, 5, 4),
        ("C4", "Ishchilarga qo'lqop yetishmaydi",    "todo",  "supervisor", "procurement", "9901", None, 1, None, None, None),
        ("W1", "Konveyer tasmasi sirpanmoqda",       "todo",  "leader",     "ars",       "9901", WORKERS[0], 0, None, None, None),
        ("W2", "Shovqin juda baland",                "todo",  "leader",     "other",     "9901", WORKERS[1], 1, None, None, None),
        ("W3", "Tarozi noto'g'ri ko'rsatmoqda",      "doing", "leader",     "ars",       "9901", WORKERS[2], 2, 2, 1, None),
        ("W4", "Ish kiyimi berilmadi",               "done",  "leader",     "hr",        "9901", WORKERS[0], 4, 1, 3, 2),
    ]
    seq = 0
    for (fx, text, status, level, cat, cell, worker, entry_days, dl, dl_from, comp) in concerns:
        seq += 1
        data = {
            "fx": fx, "seq": seq, "concern_text": text, "status": status, "level": level,
            "category": cat, "cell_code": cell, "worker_name": worker,
            "entry_date_days": entry_days, "created_at_days": entry_days + 0.3,
            "level_since_days": (1.0 if fx in ("C1", "C2") else entry_days + 0.3),
            "deadline_days": dl, "deadline_from_days": dl_from,
            "completion_date_days": comp, "done_at_days": (comp + 0.2 if comp is not None else None),
            "escalation_count": 0, "solution": None,
        }
        r = add(db, a, "concern", data)
        if fx == "C3":
            add(db, a, "concern_comment", {
                "concern_id": r.id, "author_name": BRIGADIR, "author_profile": BRIGADIR_PROFILE,
                "text": "Ombordan keldi", "kind": "resolution", "created_at_days": comp + 0.2,
            })
        if fx == "C4":
            add(db, a, "concern_comment", {
                "concern_id": r.id, "author_name": BRIGADIR, "author_profile": BRIGADIR_PROFILE,
                "text": "Nechta odamga kerak?", "kind": None, "created_at_days": 0.6,
            })
        if fx in ("C1", "C2"):
            # The brigadir sent it back: a move DOWN with a reason, one day ago.
            put(r, escalation_count=1)
            add(db, a, "concern_move", {
                "concern_id": r.id, "direction": "down", "from_level": "supervisor",
                "to_level": "leader", "from_name": BRIGADIR, "target_name": L,
                "reason": ("Elakni o'zingiz tekshiring, keyin yoping" if fx == "C1"
                           else "Eshik ilgagini o'zingiz to'g'irlab ko'ring"),
                "actor_name": BRIGADIR, "actor_role": "supervisor", "created_at_days": 1.0,
            })
    # Ojidaniya: one interval on 9901, today (rendered against the clock).
    add(db, a, "idle", {
        "fx": "I1", "cell_id": CELLS[0]["cell_id"], "date_days": 0, "category": "Cat D3",
        "start": "10:20", "end": "10:35", "stopped": True, "note": "xamir kutildi",
        "created_at_days": 0.1, "entered_by": ctx.profile_key, "entered_by_name": L,
    })
    # The approved objection filed three days ago (task 3 of the checklist).
    add(db, a, "dispute", {
        "fx": "D1", "task_id": DISPUTE_FX_TASK, "status": "approved",
        "reason": "Rasmda soat ko'rinib turibdi, sana to'g'ri",
        "created_at_days": 3.0, "date_days": 4,
        "sup": {"action": "uplifted", "note": "Lider haq — smenada bor edim",
                "by": BRIGADIR, "at_days": 2.8},
        "decidedBy": "Administrator", "decidedAt_days": 2.5, "note": "",
        "byRole": "leader",
    })
    # The bell: three rows, negative ids on the wire.
    bell = [
        ({"uz": "Yangi vazifa", "uz_cyrl": "Янги вазифа", "ru": "Новая задача", "en": "New task"},
         {"uz": f"📌 Vazifa: Pech zichlagichlarini tekshirish\n👤 Berdi: {BRIGADIR}",
          "uz_cyrl": f"📌 Вазифа: Печ зичлагичларини текшириш\n👤 Берди: {BRIGADIR}",
          "ru": f"📌 Задача: Проверить уплотнители печи\n👤 Поставил: {BRIGADIR}",
          "en": f"📌 Task: Check the oven seals\n👤 Set by: {BRIGADIR}"}, "info", 2.0),
        ({"uz": "Xavotirga javob", "uz_cyrl": "Хавотирга жавоб", "ru": "Ответ на замечание", "en": "Reply to your concern"},
         {"uz": f"№4 · Ishchilarga qo'lqop yetishmaydi\n💬 {BRIGADIR}: «Nechta odamga kerak?»",
          "uz_cyrl": f"№4 · Ишчиларга қўлқоп етишмайди\n💬 {BRIGADIR}: «Нечта одамга керак?»",
          "ru": f"№4 · Рабочим не хватает перчаток\n💬 {BRIGADIR}: «На сколько человек нужно?»",
          "en": f"№4 · Workers lack gloves\n💬 {BRIGADIR}: «For how many people?»"}, "info", 0.6),
        ({"uz": "Kun tasdiqlandi — 62%", "uz_cyrl": "Кун тасдиқланди — 62%", "ru": "День подтверждён — 62%", "en": "Day verified — 62%"},
         {"uz": "Kechagi hisobotingiz tekshirildi: topshirilgan 85% → tasdiqlangan 62%",
          "uz_cyrl": "Кечаги ҳисоботингиз текширилди: топширилган 85% → тасдиқланган 62%",
          "ru": "Вчерашний отчёт проверен: сдано 85% → подтверждено 62%",
          "en": "Yesterday's report was checked: submitted 85% → verified 62%"}, "success", 0.4),
    ]
    for title, body, typ, days in bell:
        add(db, a, "notification", {"title": title, "body": body, "type": typ, "created_at_days": days})


# ── checklist names for the leaders fixtures ─────────────────────────────────

def checklist_names(db: Session) -> dict[int, dict]:
    names: dict[int, dict] = {}
    try:
        for td in db.query(LeaderTaskDef).filter(LeaderTaskDef.id <= 13).all():
            names[td.id] = {l: getattr(td, f"name_{l}", None) or td.name_uz for l in LANGS}
    except Exception:  # noqa: BLE001 — a bare DB answers with the fallback below
        names = {}
    for i in range(1, 14):
        names.setdefault(i, {"uz": f"Vazifa {i}", "uz_cyrl": f"Вазифа {i}", "ru": f"Задача {i}", "en": f"Task {i}"})
    return names


def pick(names: dict, lang: str) -> str:
    return names.get(lang) or names.get("uz") or ""


# ── serializers: tasks board ─────────────────────────────────────────────────

def task_row(ctx: Ctx, r: ExamSandboxRow, comment_count: int) -> dict:
    d = r.data
    created = rel_dt(d, "created_at")
    completed = rel_dt(d, "completed_at")
    due = rel_date(d, "due") if "due_days" in d or "due" in d else None
    return {
        "id": r.id, "assignee_kind": "leader", "assignee_name": ctx.leader_name,
        "leader_profile_id": ctx.leader_profile_id, "leader_name": ctx.leader_name,
        "supervisor_manager_id": None, "supervisor_name": BRIGADIR, "supervisor_shift": ctx.shift,
        "task_text": d.get("task_text"), "priority": d.get("priority"), "status": d.get("status"),
        "due_date": due.isoformat() if due else None,
        "completed_at": iso(completed), "created_at": iso(created),
        "created_by": None, "created_by_name": d.get("created_by_name"),
        "created_by_profile": d.get("created_by_profile"), "creator_role": "supervisor",
        "comment_count": comment_count,
        "can_edit": False, "can_status": True, "can_reorder": False, "can_comment": True,
    }


def task_narrow(ctx: Ctx, r: ExamSandboxRow, comment_count: int) -> dict:
    full = task_row(ctx, r, comment_count)
    keys = ("id", "leader_profile_id", "leader_name", "supervisor_manager_id", "supervisor_name",
            "task_text", "priority", "status", "due_date", "completed_at", "created_by",
            "created_by_name", "created_at", "comment_count", "can_edit")
    out = {k: full[k] for k in keys}
    out["leader_role_ref"] = None
    return out


def comment_json(ctx: Ctx, r: ExamSandboxRow, parent_key: str) -> dict:
    d = r.data
    return {
        "id": r.id, parent_key: d.get("task_id") if parent_key == "task_id" else d.get("concern_id"),
        "author_telegram_id": None, "author_role_ref": None,
        "author_profile": d.get("author_profile"), "author_name": d.get("author_name"),
        "text": d.get("text"), "kind": d.get("kind"),
        "created_at": iso(rel_dt(d, "created_at")), "edited_at": d.get("edited_at"),
        "is_own": d.get("author_profile") == ctx.profile_key,
    }


# ── serializers: concerns ────────────────────────────────────────────────────

def concern_due(d: dict) -> Optional[date]:
    days = d.get("deadline_days")
    if days is None:
        return None
    start = rel_date(d, "deadline_from") or rel_date(d, "entry_date")
    if start is None:
        return None
    try:
        return start + timedelta(days=int(days))
    except (OverflowError, ValueError):
        return None


def concern_rights(d: dict) -> dict:
    status = d.get("status")
    level = d.get("level") or "supervisor"
    can_edit = status != "done"
    can_status = level == "leader" and status != "done"
    return {
        "can_edit": can_edit, "can_set_status": can_status, "can_resolve": can_status,
        "can_delete": False, "can_escalate": can_edit and level == "leader",
        "can_deescalate": False,
    }


def concern_row(ctx: Ctx, r: ExamSandboxRow, comment_count: int, with_rights: bool = True) -> dict:
    d = r.data
    entry = rel_date(d, "entry_date")
    completion = rel_date(d, "completion_date")
    created = rel_dt(d, "created_at")
    level_since = rel_dt(d, "level_since") or created
    done_at = rel_dt(d, "done_at")
    worker = d.get("worker_name")
    level = d.get("level") or "supervisor"
    resolution_days = (completion - entry).days if (completion and entry) else None
    resolution_minutes = None
    if done_at is not None and level_since is not None:
        resolution_minutes = max(0, int((done_at - level_since).total_seconds() // 60))
    due = concern_due(d)
    dl_from = rel_date(d, "deadline_from")
    out = {
        "id": r.id, "seq": d.get("seq"),
        "leader_profile_id": ctx.leader_profile_id, "leader_role_ref": None, "leader_name": ctx.leader_name,
        "brigadir_manager_id": UNIT_ID, "brigadir_name": BRIGADIR,
        "cell_code": d.get("cell_code"), "cell_id": None,
        "cell_leader_name": ctx.leader_name, "cell_supervisor_name": BRIGADIR,
        "category": d.get("category"),
        "concern_owner": worker or ctx.leader_name,
        "owner_name": worker or ctx.leader_name, "owner_role": None if worker else "leader",
        "worker_name": worker, "concern_text": d.get("concern_text"), "status": d.get("status"),
        "deadline_days": d.get("deadline_days"),
        "deadline_from": dl_from.isoformat() if dl_from else None,
        "due_date": due.isoformat() if due else None,
        "entry_date": entry.isoformat() if entry else None,
        "completion_date": completion.isoformat() if completion else None,
        "solution": d.get("solution"),
        "resolution_days": resolution_days, "resolution_minutes": resolution_minutes,
        "level": level, "top_manager_profile_id": None, "top_manager_name": None,
        "shift_manager_profile_id": None, "shift_manager_name": None,
        "responsible_name": ctx.leader_name if level == "leader" else BRIGADIR,
        "level_since": iso(level_since), "escalation_count": int(d.get("escalation_count") or 0),
        "comment_count": comment_count, "created_at": iso(created),
    }
    if with_rights:
        out.update(concern_rights(d))
    return out


def concern_counts(db: Session, attempt_id: int) -> dict[int, int]:
    counts: dict[int, int] = {}
    for c in rows(db, attempt_id, "concern_comment"):
        cid = c.data.get("concern_id")
        counts[cid] = counts.get(cid, 0) + 1
    return counts


def task_comment_counts(db: Session, attempt_id: int) -> dict[int, int]:
    counts: dict[int, int] = {}
    for c in rows(db, attempt_id, "task_comment"):
        tid = c.data.get("task_id")
        counts[tid] = counts.get(tid, 0) + 1
    return counts


def is_worker_row(d: dict) -> bool:
    return bool(d.get("worker_name")) and (d.get("level") or "supervisor") == "leader"


def concern_history(ctx: Ctx, db: Session, r: ExamSandboxRow) -> list[dict]:
    d = r.data
    created = rel_dt(d, "created_at")
    worker = d.get("worker_name")
    first_level = "leader" if worker else "supervisor"
    out = [{
        "key": "created", "kind": "created", "created_at": iso(created),
        "to_level": first_level,
        "target_name": ctx.leader_name if first_level == "leader" else BRIGADIR,
        "actor_name": worker or ctx.leader_name, "actor_role": None if worker else "leader",
    }]
    prev = created
    moves = [m for m in rows(db, ctx.attempt_id, "concern_move") if m.data.get("concern_id") == r.id]
    for m in moves:
        md = m.data
        at = rel_dt(md, "created_at")
        held = int((at - prev).total_seconds()) if (at and prev) else None
        out.append({
            "key": f"esc-{m.id}", "kind": "move", "id": m.id, "direction": md.get("direction"),
            "from_level": md.get("from_level"), "to_level": md.get("to_level"),
            "from_name": md.get("from_name"), "target_name": md.get("target_name"),
            "reason": md.get("reason"), "actor_name": md.get("actor_name"),
            "actor_role": md.get("actor_role"), "created_at": iso(at), "held_seconds": held,
        })
        prev = at or prev
    done_at = rel_dt(d, "done_at")
    if done_at is not None:
        note = None
        for c in rows(db, ctx.attempt_id, "concern_comment"):
            if c.data.get("concern_id") == r.id and c.data.get("kind") == "resolution":
                note = c.data.get("text")
        level = d.get("level") or "supervisor"
        out.append({
            "key": "resolved", "kind": "resolved", "created_at": iso(done_at), "to_level": level,
            "target_name": ctx.leader_name if level == "leader" else BRIGADIR,
            "solution": note or d.get("solution"),
            "held_seconds": int((done_at - prev).total_seconds()) if prev else None,
        })
    return out


# ── serializers: idle-cell ───────────────────────────────────────────────────

def interval_json(r: ExamSandboxRow) -> dict:
    d = r.data
    sp = span(d.get("start"), d.get("end"))
    minutes = (sp[1] - sp[0]) if sp else 0
    s_min, e_min = _to_min(d.get("start")), _to_min(d.get("end"))
    return {
        "id": r.id, "category": d.get("category"), "start": d.get("start"), "end": d.get("end"),
        "stopped": bool(d.get("stopped", True)), "note": d.get("note"), "minutes": minutes,
        "next_day": (s_min is not None and e_min is not None and e_min <= s_min),
        "live": False, "created_at": iso(rel_dt(d, "created_at")),
        "entered_by": d.get("entered_by"), "entered_by_name": d.get("entered_by_name"),
        "updated_at": None, "status": "approved", "decision_note": None,
        "decided_by": None, "decided_by_name": None, "decided_at": None,
        "can_edit": False, "can_delete": False, "can_decide": False,
    }


def _to_min(hhmm: Optional[str]) -> Optional[int]:
    if not hhmm or not re.fullmatch(r"\d{1,2}:\d{2}", hhmm):
        return None
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def idle_rows_for(db: Session, attempt_id: int, cell_id: int, day: date) -> list[ExamSandboxRow]:
    out = []
    for r in rows(db, attempt_id, "idle"):
        if r.data.get("cell_id") != cell_id:
            continue
        if rel_date(r.data, "date") != day:
            continue
        out.append(r)
    out.sort(key=lambda r: ((_to_min(r.data.get("start")) or 0), r.data.get("end") or ""))
    return out


def cell_json(ctx: Ctx, db: Session, cell: dict, day: date) -> dict:
    ivs = idle_rows_for(db, ctx.attempt_id, cell["cell_id"], day)
    flat = [{"id": r.id, "start": r.data.get("start"), "end": r.data.get("end"),
             "stopped": bool(r.data.get("stopped", True)), "category": r.data.get("category")} for r in ivs]
    return {
        "cell_id": cell["cell_id"], "verifix_code": cell["code"], "sap_code": None, "wc_group": None,
        "name_uz": None, "name_uz_cyrl": None, "name_ru": None, "name_en": None,
        "leader_id": ctx.leader_profile_id, "leader": ctx.leader_name,
        "intervals": [interval_json(r) for r in ivs], "requests": [], "legacy_entries": [],
        "can_manage": False, "can_add": True,
        "summary": summarize(flat),
    }


def idle_summary(db: Session, attempt_id: int, cell_code: str, day: date) -> dict:
    cell = next((c for c in CELLS if c["code"] == cell_code), None)
    if cell is None:
        return summarize([])
    ivs = idle_rows_for(db, attempt_id, cell["cell_id"], day)
    flat = [{"id": r.id, "start": r.data.get("start"), "end": r.data.get("end"),
             "stopped": bool(r.data.get("stopped", True)), "category": r.data.get("category")} for r in ivs]
    return summarize(flat)


# ── serializers: leaders (report · disputes · late proofs) ───────────────────

def _verdict(status: str, flags: list[str], reason: dict, day: date, resolution: Optional[str] = None) -> dict:
    d = day.strftime("%d.%m")
    return {
        "status": status, "flags": flags, "imageDate": f"{d} 11:40" if status == "flagged" else f"{d} 09:12",
        "clocks": [], "expected": f"{d} 07:00 — {d} 20:00",
        "dateCheck": True, "dayCheck": True, "timeCheck": True,
        "reason": reason, "dateReason": {l: "" for l in LANGS},
        "photos": 1, "error": None, "attempts": 1, "exhausted": False,
        "reviewedAt": iso(now() - timedelta(days=1)),
        "resolution": resolution, "resolvedBy": "Administrator" if resolution else None,
        "resolvedAt": iso(now() - timedelta(days=2)) if resolution else None, "resolutionNote": None,
    }


REJECT_REASON = {
    "uz": "Rasmda jurnal sahifasi bo'sh ko'rinadi — to'ldirilgani isbotlanmagan",
    "uz_cyrl": "Расмда журнал саҳифаси бўш кўринади — тўлдирилгани исботланмаган",
    "ru": "На фото страница журнала пустая — заполнение не доказано",
    "en": "The photo shows an empty journal page — filling it is not proven",
}
OK_REASON = {"uz": "Isbot talabga mos", "uz_cyrl": "Исбот талабга мос", "ru": "Доказательство соответствует", "en": "The proof meets the requirement"}
NODATE_REASON = {"uz": "Rasmda sana ko'rinmaydi", "uz_cyrl": "Расмда сана кўринмайди", "ru": "На фото не видно даты", "en": "No date is visible on the photo"}


def report_uid(ctx: Ctx) -> str:
    return f"exam-{ctx.attempt_id}"


def leader_dispute_rows(db: Session, attempt_id: int) -> list[ExamSandboxRow]:
    return [r for r in rows(db, attempt_id, "dispute") if not r.data.get("fx")]


def dispute_out(ctx: Ctx, r: ExamSandboxRow) -> dict:
    d = r.data
    sup = d.get("sup")
    sup_out = None
    if sup:
        sup_out = {"action": sup.get("action"), "note": sup.get("note"), "by": sup.get("by"),
                   "at": iso(rel_dt(sup, "at"))}
    return {
        "id": r.id, "status": d.get("status"), "reason": d.get("reason"), "managerId": UNIT_ID,
        "by": ctx.leader_name, "byRole": d.get("byRole") or "leader",
        "at": iso(rel_dt(d, "created_at")), "sup": sup_out,
        "decidedBy": d.get("decidedBy"), "decidedAt": iso(rel_dt(d, "decidedAt")),
        "note": d.get("note") or "", "canAct": False,
    }


def day_report(ctx: Ctx, db: Session) -> dict:
    yday = today_local() - timedelta(days=1)
    names = checklist_names(db)
    disputes = {r.data.get("task_id"): r for r in leader_dispute_rows(db, ctx.attempt_id)}
    tasks = []
    for i in range(1, 14):
        w = REPORT_WEIGHTS[i]
        t = {
            "id": i, "name": names[i], "note": {l: "" for l in LANGS}, "weight": w,
            "answered": True, "done": True, "reason": "", "photo": "", "media": [],
            "ai_rejected": False, "admin_done": None, "admin_by": None, "admin_at": None,
            "auto": False, "queued": False, "dispute": None, "review": None,
        }
        if i == REPORT_MISSED_TASK:
            t.update({"done": False, "reason": "__missed__|18:00"})
        elif i == REPORT_REJECTED_TASK:
            t.update({"ai_rejected": True,
                      "review": _verdict("flagged", ["not_proven"], REJECT_REASON, yday)})
            if i in disputes:
                t["dispute"] = dispute_out(ctx, disputes[i])
        else:
            t["review"] = _verdict("ok", [], OK_REASON, yday)
        tasks.append(t)
    return {
        "uid": report_uid(ctx), "date": yday.isoformat(), "cell": CELLS[0]["code"], "cellId": None,
        "shift": ctx.shift, "source": "bot",
        "submittedAt": iso(datetime.combine(yday, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=14)),
        "leader": ctx.leader_name, "leaderId": ctx.leader_profile_id,
        "supervisor": BRIGADIR, "managerId": UNIT_ID,
        "voided": False, "excluded": None, "lateState": None, "lateBy": None, "lateReason": None,
        "auto": True, "autoFrom": "2026-08-13",
        "score": REPORT_SCORE, "completion": float(REPORT_SCORE), "rawScore": REPORT_RAW,
        "counts": {"total": 13, "checked": 12, "rejected": 1, "errors": 0, "pending": 0},
        "canDispute": True, "canSupervise": False, "canDecide": False, "viewerRole": "leader",
        "tasks": tasks,
    }


def disputes_payload(ctx: Ctx, db: Session) -> dict:
    names = checklist_names(db)
    items = []
    for r in reversed(rows(db, ctx.attempt_id, "dispute")):
        d = r.data
        day = rel_date(d, "date") or (today_local() - timedelta(days=1))
        base = dispute_out(ctx, r)
        tid = d.get("task_id")
        verdict = (_verdict("flagged", ["no_date"], NODATE_REASON, day, resolution="approved")
                   if d.get("fx") else _verdict("flagged", ["not_proven"], REJECT_REASON, day))
        items.append({
            **base, "date": day.isoformat(), "taskId": tid, "taskName": names.get(tid, names[1]),
            "leader": ctx.leader_name, "leaderId": ctx.leader_profile_id,
            "supervisor": BRIGADIR, "shift": ctx.shift, "uid": report_uid(ctx), "verdict": verdict,
        })
    return {"canDecide": False, "canSupervise": False, "canApprove": False, "todo": 0, "items": items}


def late_proofs_payload(ctx: Ctx, db: Session) -> dict:
    names = checklist_names(db)
    day = today_local() - timedelta(days=3)
    tz = timezone(timedelta(hours=5))
    due = datetime.combine(day, datetime.min.time(), tzinfo=tz) + timedelta(hours=12)
    at = due + timedelta(minutes=47)
    return {
        "canSupervise": False, "canApprove": False, "todo": 0,
        "items": [{
            "id": 100000 + ctx.attempt_id, "status": "supervisor", "canAct": False,
            "date": day.isoformat(), "shift": ctx.shift, "taskId": LATE_PROOF_TASK,
            "taskName": names[LATE_PROOF_TASK], "leader": ctx.leader_name,
            "leaderId": ctx.leader_profile_id, "supervisor": BRIGADIR, "managerId": UNIT_ID,
            "deadline": "12:00", "reason": "Telefon o'chib qoldi, rasmni keyin yubordim",
            "uid": report_uid(ctx), "at": at.isoformat(), "dueAt": due.isoformat(), "lateMin": 47,
            "photos": [], "sup": None, "adm": None,
        }],
    }


# ── serializers: the bell ────────────────────────────────────────────────────

def notification_id(r: ExamSandboxRow) -> int:
    return -r.id


def notification_json(r: ExamSandboxRow, lang: str) -> dict:
    d = r.data
    return {
        "id": notification_id(r), "title": pick(d.get("title") or {}, lang),
        "body": pick(d.get("body") or {}, lang), "type": d.get("type") or "info",
        "created_at": iso(rel_dt(d, "created_at")),
    }
