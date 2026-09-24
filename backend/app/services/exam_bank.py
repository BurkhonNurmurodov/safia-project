"""The dashboard exam's task bank — THE fifty tasks (services/exam_check.py
evaluates them, routers/exam.py serves them).

The bank lives in code (the operator's ruling, 2026-09-18): adding a task is a
deploy, an admin only switches one off or on (AppSetting ``exam_disabled_tasks``,
a JSON list of keys). The TEXTS live in the frontend bundle under
``exam.t.<key>`` in all four languages, rendered in the viewer's language, so
the DB translation overrides reach them like any other UI string; this module
holds only what the checker needs.

A task never names the page or the control (ruling 6) — finding it IS the
test. ``page`` is the page key the task needs; a leader who cannot open it gets
the task marked ``unavailable`` and scored over the rest.

Kinds: ``sandbox`` (a predicate over the attempt's sandbox rows), ``answer``
(the leader types or picks; compared with a value computed at check time),
``ui`` (the client's report of persisted page state, localStorage), ``visit``
(a route the client reported). ``visit_answer`` is 44: both.
"""
from __future__ import annotations

# area key → (letter, colour). Colours follow CATEGORY_COLORS order: red,
# green, blue, yellow, orange, purple, teal, pink — one hue per area on every
# surface (the strip, the leader page, the admin bank).
AREAS = [
    ("tasks",         "A", "#ef4444"),
    ("concerns",      "B", "#22c55e"),
    ("cell_concerns", "C", "#3b82f6"),
    ("idle",          "D", "#eab308"),
    ("leaders",       "E", "#f97316"),
    ("analysis",      "F", "#a855f7"),
    ("education",     "G", "#14b8a6"),
    ("profile",       "H", "#ec4899"),
]
AREA_KEYS = [a[0] for a in AREAS]


def _t(n, area, level, kind, page=None, answer=None, check=None):
    return {
        "key": f"t{n:02d}", "n": n, "area": area, "level": level, "kind": kind,
        "page": page, "answer": answer, "check": check or {},
    }


# answer types: number · text · time · choice · multi
TASKS = [
    # ── A · Vazifalar (the task board) ─────────────────────────────────────
    _t(1,  "tasks", 1, "sandbox", "tasks", check={"op": "task_status", "fx": "T1", "status": "done"}),
    _t(2,  "tasks", 1, "sandbox", "tasks", check={"op": "task_status", "fx": "T3", "status": "doing"}),
    _t(3,  "tasks", 1, "answer",  "tasks", {"type": "choice"}, {"op": "fx_task_title", "fx": "T2"}),
    _t(4,  "tasks", 2, "answer",  "tasks", {"type": "choice"}, {"op": "fx_task_title", "fx": "T4"}),
    _t(5,  "tasks", 1, "answer",  "tasks", {"type": "number"}, {"op": "const_number", "value": 2}),
    _t(6,  "tasks", 2, "sandbox", "tasks", check={"op": "task_comment", "fx": "T6", "contains": ["kelishildi", "келишилди"]}),
    _t(7,  "tasks", 2, "ui",      "tasks", check={"op": "ui_equals", "key": "tasks_status_sel", "value": ["todo"]}),
    _t(8,  "tasks", 2, "ui",      "tasks", check={"op": "ui_equals", "key": "tasks_view", "value": "analytics"}),
    _t(9,  "tasks", 3, "ui",      "tasks", check={"op": "ui_sort", "key": "tasks_sort", "sort_key": "due", "dir": "asc"}),
    # ── B · Xavotirlar (/concerns) ─────────────────────────────────────────
    _t(10, "concerns", 1, "sandbox", "concerns", check={"op": "concern_created", "level": "supervisor"}),
    _t(11, "concerns", 1, "sandbox", "concerns", check={"op": "concern_closed", "fx": "C1"}),
    _t(12, "concerns", 2, "sandbox", "concerns", check={"op": "concern_comment", "fx": "C4", "contains": ["12"]}),
    _t(13, "concerns", 1, "answer",  "concerns", {"type": "number"}, {"op": "concerns_open_count"}),
    _t(14, "concerns", 2, "sandbox", "concerns", check={"op": "concern_status", "fx": "C2", "status": "todo"}),
    _t(15, "concerns", 2, "sandbox", "concerns", check={"op": "concern_text_token", "fx": "C4", "tokens": ["L", "l", "Л", "л"]}),
    _t(16, "concerns", 2, "answer",  "concerns", {"type": "choice"}, {"op": "fx_concern_text", "fx": "C3"}),
    _t(17, "concerns", 2, "ui",      "concerns", check={"op": "ui_equals", "key": "concerns_status_sel", "value": ["done"]}),
    # ── C · Yacheyka xavotirlari (/cell-concerns) ──────────────────────────
    _t(18, "cell_concerns", 1, "sandbox", "cell-concerns", check={"op": "concern_status", "fx": "W1", "status": "doing"}),
    _t(19, "cell_concerns", 2, "sandbox", "cell-concerns", check={"op": "concern_escalated", "fx": "W3"}),
    _t(20, "cell_concerns", 2, "sandbox", "cell-concerns", check={"op": "concern_closed", "fx": "W2"}),
    _t(21, "cell_concerns", 1, "answer",  "cell-concerns", {"type": "number"}, {"op": "worker_todo_count"}),
    _t(22, "cell_concerns", 2, "sandbox", "cell-concerns", check={"op": "concern_created", "level": "leader"}),
    # ── D · Ojidaniya (/idle-cell) ─────────────────────────────────────────
    _t(23, "idle", 1, "sandbox", "idle-cell", check={"op": "idle_entry", "cell": "9901", "start": "11:00", "end": "11:25", "cats": ["Cat D3"]}),
    _t(24, "idle", 2, "sandbox", "idle-cell", check={"op": "idle_entry", "cell": "9901", "start": "14:05", "end": "14:20", "cats": ["Cat E", "Cat D"]}),
    _t(25, "idle", 2, "sandbox", "idle-cell", check={"op": "idle_entry", "cell": "9901", "start": "09:30", "end": "09:38", "cats": ["Cat I"]}),
    _t(26, "idle", 1, "answer",  "idle-cell", {"type": "number"}, {"op": "idle_union_today", "cell": "9901"}),
    _t(27, "idle", 2, "sandbox", "idle-cell", check={"op": "idle_entry", "cell": "9902", "start": "16:10", "end": "16:22", "note": ["ombor", "омбор"]}),
    _t(28, "idle", 2, "answer",  "idle-cell", {"type": "choice"}, {"op": "idle_top_category_today", "cell": "9901"}),
    # ── E · Liderlar (rules · day report · objections · late proofs) ───────
    _t(29, "leaders", 1, "visit",  "leaders", check={"op": "visit_tab", "path": "/leaders", "key": "leaders_tab", "value": "tasks"}),
    _t(30, "leaders", 2, "answer", "leaders", {"type": "number"}, {"op": "req_min_media", "task_id": 3}),
    _t(31, "leaders", 2, "answer", "leaders", {"type": "time"},   {"op": "req_closes", "task_id": 13}),
    _t(32, "leaders", 1, "answer", "leaders", {"type": "choice"}, {"op": "fx_report_rejected"}),
    _t(33, "leaders", 2, "sandbox", "leaders", check={"op": "dispute_filed", "task_id": 5, "min_len": 10}),
    _t(34, "leaders", 2, "answer", "leaders", {"type": "choice"}, {"op": "fx_dispute_outcome"}),
    _t(35, "leaders", 1, "answer", "leaders", {"type": "number"}, {"op": "const_number", "value": 62}),
    _t(36, "leaders", 2, "answer", "leaders", {"type": "choice"}, {"op": "fx_late_proof_holder"}),
    _t(37, "leaders", 2, "answer", "leaders", {"type": "choice"}, {"op": "req_max_weight"}),
    # ── F · Tahlil (zagruzka · worker concerns) ────────────────────────────
    _t(38, "analysis", 2, "answer", "zagruzka",        {"type": "number", "tolerance": 1}, {"op": "unit_zagruzka_yesterday"}),
    _t(39, "analysis", 2, "ui",     "zagruzka",        check={"op": "ui_equals", "key": "zagruzka_heatmap_mode", "value": "planned"}),
    _t(40, "analysis", 2, "answer", "worker-concerns", {"type": "number"}, {"op": "wc_month_total"}),
    _t(41, "analysis", 3, "answer", "worker-concerns", {"type": "choice"}, {"op": "wc_month_top_cell"}),
    # ── G · Ta'lim (/education) ────────────────────────────────────────────
    _t(42, "education", 1, "answer", "education", {"type": "number"}, {"op": "edu_count"}),
    _t(43, "education", 2, "answer", "education", {"type": "choice"}, {"op": "edu_longest"}),
    _t(44, "education", 2, "visit_answer", "education", {"type": "number", "tolerance": 1}, {"op": "edu_newest_minutes"}),
    # ── H · Profil va sozlamalar ───────────────────────────────────────────
    _t(45, "profile", 1, "answer", None, {"type": "multi"},  {"op": "my_cells"}),
    _t(46, "profile", 1, "answer", None, {"type": "choice"}, {"op": "my_shift"}),
    _t(47, "profile", 1, "ui",     None, check={"op": "ui_round_trip", "key": "lang"}),
    _t(48, "profile", 1, "ui",     None, check={"op": "ui_round_trip", "key": "theme"}),
    _t(49, "profile", 2, "ui",     None, check={"op": "notif_all_read"}),
    _t(50, "profile", 1, "answer", None, {"type": "text"},   {"op": "app_version"}),
]

BY_KEY = {t["key"]: t for t in TASKS}

# Tasks whose expected value is per leader (real data). Every other answer
# task is over the fixtures, identical for everybody (ruling 12).
REAL_DATA_OPS = frozenset({
    "req_min_media", "req_closes", "req_max_weight", "unit_zagruzka_yesterday",
    "wc_month_total", "wc_month_top_cell", "edu_count", "edu_longest",
    "edu_newest_minutes", "my_cells", "my_shift",
})


def area_of(key: str) -> str:
    return BY_KEY[key]["area"]


def enabled_tasks(disabled: set[str] | None = None) -> list[dict]:
    off = disabled or set()
    return [t for t in TASKS if t["key"] not in off]


def public(task: dict) -> dict:
    """What the client is told about a task — never the predicate."""
    return {
        "key": task["key"], "n": task["n"], "area": task["area"],
        "level": task["level"], "kind": task["kind"], "page": task["page"],
        "answer": task["answer"],
    }
