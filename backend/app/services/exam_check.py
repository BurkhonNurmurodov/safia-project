"""The exam checkers — how the platform decides a task was done.

One entry point per question:

* :func:`availability` — can this leader be asked this task at all (the page
  it needs, the data its answer needs)?
* :func:`expected` — for an ``answer`` task, the value (and the choice list)
  computed NOW, from the sandbox, from real read-only data or from the request.
* :func:`evaluate` — did the leader do it? A sandbox predicate over the
  attempt's rows, a ui/visit predicate over the events the client reported, or
  the answer compared with :func:`expected`.

Evidence only counts after ``opened_at`` — the moment the task became the
current one — so one concern cannot pass two tasks. A failed check says
nothing but «not yet» (ruling 10); the reasons here are for the admin's
per-task view, never for the leader.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (Cell, EducationLesson, EducationLessonTarget, ExamAttempt, ExamEvent,
                        ExamTaskResult, Manager, RoleProfile)
from app.services import exam_bank, exam_sandbox as sb
from app.services.ojidaniya_matrix import today_local


class NoData(Exception):
    """The expected value cannot be computed for this leader."""


@dataclass
class Expected:
    value: Any                      # the right answer (a list for `multi`)
    options: Optional[list] = None  # choice lists, served to the client
    tolerance: float = 0


# ── helpers ───────────────────────────────────────────────────────────────────

def _prof(db: Session, attempt: ExamAttempt) -> Optional[RoleProfile]:
    role, _, ref = (attempt.profile_key or "").partition(":")
    if role != "leader" or not ref.isdigit():
        return None
    return db.query(RoleProfile).filter_by(id=int(ref)).first()


def _unit(db: Session, prof: Optional[RoleProfile]) -> Optional[Manager]:
    if prof is None or not prof.manager_id:
        return None
    return db.query(Manager).filter_by(id=prof.manager_id).first()


def _norm(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def _contains_any(text: str, needles: list[str]) -> bool:
    t = _norm(text)
    return any(_norm(n) in t for n in needles)


def _after(row_dt: Optional[datetime], opened: Optional[datetime]) -> bool:
    if row_dt is None:
        return False
    if opened is None:
        return True
    return row_dt >= opened - timedelta(seconds=2)


def events(db: Session, attempt_id: int, since: Optional[datetime]) -> list[ExamEvent]:
    q = db.query(ExamEvent).filter(ExamEvent.attempt_id == attempt_id)
    if since is not None:
        q = q.filter(ExamEvent.at >= since - timedelta(seconds=2))
    return q.order_by(ExamEvent.id).all()


def _ui(ev: ExamEvent) -> dict:
    p = ev.payload or {}
    return p.get("ui") or {}


# ── availability ──────────────────────────────────────────────────────────────

def availability(db: Session, payload: dict, attempt: ExamAttempt, task: dict,
                 app_version: str = "") -> tuple[str, Optional[str]]:
    """('open', None) or ('unavailable', 'page' | 'no_data')."""
    page = task.get("page")
    if page:
        from app.permissions import page_allowed
        try:
            if not page_allowed(db, payload, page):
                return "unavailable", "page"
        except Exception:  # noqa: BLE001 — a failed lookup must not strand the start
            return "unavailable", "page"
    op = (task.get("check") or {}).get("op")
    if task["kind"] in ("answer", "visit_answer") and op in exam_bank.REAL_DATA_OPS:
        try:
            expected(db, attempt, task, app_version=app_version)
        except NoData:
            return "unavailable", "no_data"
    return "open", None


# ── expected values ───────────────────────────────────────────────────────────

def _opt(value: str, label_key: str, code: Optional[str] = None) -> dict:
    """A choice whose words live in the client bundle: the VALUE is what the
    check compares, the label key what the sheet prints (AnswerSheet.jsx). A
    raw status key («approved», «supervisor») is not a word any page shows."""
    out = {"value": value, "labelKey": label_key}
    if code:
        out["code"] = code
    return out


def _cat_code(cat: str) -> str:
    return re.sub(r"^Cat\s*", "", cat or "")


def expected(db: Session, attempt: ExamAttempt, task: dict, app_version: str = "",
             lang: str = "uz") -> Expected:
    chk = task.get("check") or {}
    op = chk.get("op")
    a = attempt.id
    ctx = sb.ctx_for(db, attempt)
    fn = _EXPECTED.get(op)
    if fn is None:
        raise NoData(op)
    return fn(db, attempt, ctx, chk, app_version, lang)


def _fx_task_title(db, attempt, ctx, chk, *_):
    titles = [r.data.get("task_text") for r in sb.rows(db, attempt.id, "task") if r.data.get("fx")]
    row = sb.fx_row(db, attempt.id, "task", chk["fx"])
    if row is None:
        raise NoData("fixture")
    return Expected(value=row.data.get("task_text"), options=titles)


def _const_number(db, attempt, ctx, chk, *_):
    return Expected(value=chk["value"])


def _fx_concern_text(db, attempt, ctx, chk, *_):
    opts = [r.data.get("concern_text") for r in sb.rows(db, attempt.id, "concern")
            if r.data.get("fx", "").startswith("C")]
    row = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    if row is None:
        raise NoData("fixture")
    return Expected(value=row.data.get("concern_text"), options=opts)


def _concerns_open_count(db, attempt, ctx, chk, *_):
    # The leader's OWN concerns (C1–C4 plus any they file), not the worker rows
    # the register also lists: «your concerns» read as «the ones you wrote» —
    # the wording t16 uses — and counting the workers' too made the answer
    # depend on a reading nobody could guess.
    n = sum(1 for r in sb.rows(db, attempt.id, "concern")
            if not r.data.get("worker_name") and r.data.get("status") != "done")
    return Expected(value=n)


def _worker_todo_count(db, attempt, ctx, chk, *_):
    n = sum(1 for r in sb.rows(db, attempt.id, "concern")
            if sb.is_worker_row(r.data) and r.data.get("status") == "todo")
    return Expected(value=n)


def _idle_union_today(db, attempt, ctx, chk, *_):
    s = sb.idle_summary(db, attempt.id, chk["cell"], today_local())
    return Expected(value=int(s["stopped_union_min"]))


def _idle_top_category_today(db, attempt, ctx, chk, *_):
    s = sb.idle_summary(db, attempt.id, chk["cell"], today_local())
    by = s.get("by_category") or {}
    if not by:
        raise NoData("no intervals")
    best = max(v.get("union_min", 0) for v in by.values())
    if best <= 0:
        raise NoData("nothing stopped")
    winners = [c for c, v in by.items() if v.get("union_min", 0) == best]
    # Labelled by the page's own words («D3 · Otdellardan mahsulot kutish»):
    # the register never prints «Cat D3», and a leader is asked for a CAUSE.
    return Expected(value=winners, options=[_opt(c, f"downtime.cat.{_cat_code(c)}.label", _cat_code(c))
                                            for c in sb.IDLE_CATEGORIES])


def _fx_report_rejected(db, attempt, ctx, chk, app_version, lang):
    names = sb.checklist_names(db)
    opts = [sb.pick(names[i], lang) for i in range(1, 14)]
    return Expected(value=sb.pick(names[sb.REPORT_REJECTED_TASK], lang), options=opts)


def _fx_dispute_outcome(db, attempt, ctx, chk, *_):
    return Expected(value="approved", options=[
        _opt(v, f"exam.opt.dispute.{v}") for v in ("supervisor", "admin", "approved", "rejected", "cancelled")])


def _fx_late_proof_holder(db, attempt, ctx, chk, *_):
    return Expected(value="supervisor", options=[
        _opt(v, f"exam.opt.holder.{v}") for v in ("supervisor", "admin", "leader", "nobody")])


def _requirements(db, attempt):
    prof = _prof(db, attempt)
    if prof is None:
        raise NoData("not a leader")
    from app.services.leader_tasks import requirements_for
    try:
        return requirements_for(db, prof=prof)
    except Exception as e:  # noqa: BLE001
        raise NoData(f"requirements: {e}")


def _req_min_media(db, attempt, ctx, chk, *_):
    req = _requirements(db, attempt)
    t = next((t for t in req.get("tasks", []) if t.get("id") == chk["task_id"]), None)
    if t is None:
        raise NoData("task not enabled")
    return Expected(value=int(t.get("min_media") or 0))


def _req_closes(db, attempt, ctx, chk, *_):
    req = _requirements(db, attempt)
    t = next((t for t in req.get("tasks", []) if t.get("id") == chk["task_id"]), None)
    if t is None:
        raise NoData("task not enabled")
    # The tab's own precedence: the per-task close → the deadline → the day's
    # filing window end (components/leaders/TaskRequirements.jsx).
    hhmm = (t.get("closes_at") if req.get("per_task") else None) or t.get("deadline") \
        or (req.get("filing") or {}).get("to")
    if not hhmm:
        raise NoData("no closing time")
    return Expected(value=hhmm)


def _req_max_weight(db, attempt, ctx, chk, app_version, lang):
    req = _requirements(db, attempt)
    tasks = req.get("tasks", [])
    if not tasks:
        raise NoData("no tasks")
    best = max(int(t.get("weight") or 0) for t in tasks)
    winners = [t for t in tasks if int(t.get("weight") or 0) == best]
    if len(winners) != 1:
        raise NoData("tie")
    opts = [sb.pick(t.get("names") or {}, lang) for t in tasks]
    return Expected(value=sb.pick(winners[0].get("names") or {}, lang), options=opts)


def _unit_zagruzka_yesterday(db, attempt, ctx, chk, *_):
    unit = _unit(db, _prof(db, attempt))
    if unit is None:
        raise NoData("no unit")
    from app.routers.brigadirs import build_metrics_list
    yday = today_local() - timedelta(days=1)
    try:
        metrics = build_metrics_list(db, yday, yday, None, [unit.id])
    except Exception as e:  # noqa: BLE001
        raise NoData(f"metrics: {e}")
    m = next((m for m in metrics if getattr(m, "manager_id", None) == unit.id
              or getattr(m, "manager_name", None) == unit.name), None)
    if m is None or m.net_util is None:
        raise NoData("no figure")
    return Expected(value=int(round(m.net_util * 100)), tolerance=1)


def _wc_query(db, attempt):
    prof = _prof(db, attempt)
    if prof is None:
        raise NoData("not a leader")
    from app.routers.worker_concerns import _apply_scope_and_filters
    today = today_local()
    payload = {"role": "leader", "role_id": prof.manager_id, "full_name": prof.name,
               "profile_key": f"leader:{prof.id}"}
    try:
        q, _sup = _apply_scope_and_filters(
            db, payload, date_from=today.replace(day=1).isoformat(), date_to=today.isoformat(),
            factory=None, manager_id=[], leader=[], cell=[], status=[])
    except Exception as e:  # noqa: BLE001
        raise NoData(f"worker concerns: {e}")
    from app.models import WorkerConcern
    return q.filter(WorkerConcern.date.isnot(None))


def _wc_month_total(db, attempt, ctx, chk, *_):
    return Expected(value=int(_wc_query(db, attempt).count()))


def _wc_month_top_cell(db, attempt, ctx, chk, *_):
    from app.models import WorkerConcern
    rows = _wc_query(db, attempt).with_entities(WorkerConcern.reg_cell, WorkerConcern.status).all()
    if not rows:
        raise NoData("no rows")
    per: dict[str, int] = {}
    for code, st in rows:
        if st == "done":
            continue
        per[code or "—"] = per.get(code or "—", 0) + 1
    if not per:
        raise NoData("nothing open")
    best = max(per.values())
    winners = [c for c, n in per.items() if n == best]
    if len(winners) != 1:
        raise NoData("tie")
    opts = sorted({c or "—" for c, _ in rows})
    return Expected(value=winners[0], options=opts)


def _lessons(db, attempt):
    key = attempt.profile_key
    mine = [t.lesson_id for t in db.query(EducationLessonTarget).filter_by(profile_key=key).all()]
    if not mine:
        return []
    return (db.query(EducationLesson)
            .filter(EducationLesson.id.in_(mine), EducationLesson.archived.is_(False))
            .order_by(EducationLesson.created_at.desc().nullslast(), EducationLesson.id.desc()).all())


def _edu_count(db, attempt, ctx, chk, *_):
    return Expected(value=len(_lessons(db, attempt)))


def _edu_longest(db, attempt, ctx, chk, *_):
    ls = [l for l in _lessons(db, attempt) if l.duration_s]
    if not ls:
        raise NoData("no durations")
    best = max(l.duration_s for l in ls)
    winners = [l for l in ls if l.duration_s == best]
    if len(winners) != 1:
        raise NoData("tie")
    return Expected(value=winners[0].title, options=[l.title for l in _lessons(db, attempt)])


def _edu_newest_minutes(db, attempt, ctx, chk, *_):
    ls = _lessons(db, attempt)
    if not ls or not ls[0].duration_s:
        raise NoData("no newest lesson with a duration")
    return Expected(value=int(round(ls[0].duration_s / 60)), tolerance=1)


def edu_newest_id(db, attempt) -> Optional[int]:
    ls = _lessons(db, attempt)
    return ls[0].id if ls else None


def _my_cells(db, attempt, ctx, chk, *_):
    prof = _prof(db, attempt)
    if prof is None:
        raise NoData("not a leader")
    own = [c.verifix_code for c in db.query(Cell).filter(Cell.leader_id == prof.id)
           .order_by(Cell.verifix_code).all()]
    if not own:
        raise NoData("no cells")
    others = [c.verifix_code for c in db.query(Cell).filter(Cell.leader_id != prof.id)
              .order_by(Cell.verifix_code).limit(40).all() if c.verifix_code not in own]
    # Three distractors, stable per attempt so the list does not shuffle
    # between the sheet opening and the check.
    seed = attempt.id % max(1, len(others)) if others else 0
    pick = (others[seed:] + others[:seed])[:3]
    opts = sorted(set(own) | set(pick))
    return Expected(value=sorted(own), options=opts)


def _my_shift(db, attempt, ctx, chk, *_):
    unit = _unit(db, _prof(db, attempt))
    if unit is None or unit.shift not in (1, 2):
        raise NoData("no shift")
    return Expected(value=str(unit.shift), options=["1", "2"])


def _app_version(db, attempt, ctx, chk, app_version, lang):
    from app.version import APP_VERSION
    return Expected(value=APP_VERSION)


_EXPECTED = {
    "fx_task_title": _fx_task_title,
    "const_number": _const_number,
    "fx_concern_text": _fx_concern_text,
    "concerns_open_count": _concerns_open_count,
    "worker_todo_count": _worker_todo_count,
    "idle_union_today": _idle_union_today,
    "idle_top_category_today": _idle_top_category_today,
    "fx_report_rejected": _fx_report_rejected,
    "fx_dispute_outcome": _fx_dispute_outcome,
    "fx_late_proof_holder": _fx_late_proof_holder,
    "req_min_media": _req_min_media,
    "req_closes": _req_closes,
    "req_max_weight": _req_max_weight,
    "unit_zagruzka_yesterday": _unit_zagruzka_yesterday,
    "wc_month_total": _wc_month_total,
    "wc_month_top_cell": _wc_month_top_cell,
    "edu_count": _edu_count,
    "edu_longest": _edu_longest,
    "edu_newest_minutes": _edu_newest_minutes,
    "my_cells": _my_cells,
    "my_shift": _my_shift,
    "app_version": _app_version,
}


# ── answer comparison ─────────────────────────────────────────────────────────

def _num(v) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace(",", ".").replace("%", "")
    try:
        return float(s)
    except ValueError:
        return None


def answer_matches(task: dict, exp: Expected, answer: Any) -> bool:
    typ = (task.get("answer") or {}).get("type")
    if typ == "number":
        a, e = _num(answer), _num(exp.value)
        if a is None or e is None:
            return False
        tol = float((task.get("answer") or {}).get("tolerance") or exp.tolerance or 0)
        return abs(a - e) <= tol
    if typ == "time":
        a = re.sub(r"[^\d:]", "", str(answer or ""))
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", a)
        if not m:
            return False
        return f"{int(m.group(1)):02d}:{m.group(2)}" == str(exp.value)
    if typ == "text":
        return _norm(answer).lstrip("v") == _norm(exp.value).lstrip("v")
    if typ == "choice":
        vals = exp.value if isinstance(exp.value, list) else [exp.value]
        return _norm(answer) in {_norm(v) for v in vals}
    if typ == "multi":
        if not isinstance(answer, list):
            return False
        return {_norm(x) for x in answer} == {_norm(v) for v in (exp.value or [])}
    return False


# ── evaluation ────────────────────────────────────────────────────────────────

def evaluate(db: Session, attempt: ExamAttempt, task: dict, result: ExamTaskResult,
             answer: Any = None, app_version: str = "", lang: str = "uz") -> tuple[bool, str]:
    """(passed, note). Raises NoData when a real-data expectation vanished."""
    kind = task["kind"]
    chk = task.get("check") or {}
    op = chk.get("op")
    opened = result.opened_at
    if kind == "sandbox":
        # A sandbox record counts from the moment the sandbox was SEEDED, not
        # from when this task was opened. Every sandbox predicate names its own
        # fixture (T1, C2, W3…) or a signature no other task shares (a cell +
        # clock pair, a leader-level vs a brigadir-level concern), so one record
        # can never pass two tasks — while the leader CAN read every task on
        # /exam and do three of them in one visit to a page. Gated on
        # opened_at, a concern closed or lifted early could never be redone
        # (a closed concern is read-only) and the task stayed «not yet» for the
        # rest of the attempt.
        since = attempt.seeded_at or attempt.started_at or opened
        return _SANDBOX[op](db, attempt, chk, since), op
    if kind == "ui":
        return _UI[op](db, attempt, chk, opened), op
    if kind == "visit":
        return _visit_tab(db, attempt, chk, opened), op
    if kind in ("answer", "visit_answer"):
        if answer is None or answer == "" or answer == []:
            return False, "no answer"
        exp = expected(db, attempt, task, app_version=app_version, lang=lang)
        ok = answer_matches(task, exp, answer)
        if ok and kind == "visit_answer":
            lid = edu_newest_id(db, attempt)
            ok = lid is not None and any(
                (e.path or "").rstrip("/") == f"/education/{lid}" for e in events(db, attempt.id, opened))
            if not ok:
                return False, "answer right, page not visited"
        return ok, ("ok" if ok else "wrong answer")
    return False, "unknown kind"


# sandbox predicates ----------------------------------------------------------

def _task_status(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "task", chk["fx"])
    return bool(r) and r.data.get("status") == chk["status"] and _after(r.updated_at, opened)


def _task_comment(db, attempt, chk, opened):
    t = sb.fx_row(db, attempt.id, "task", chk["fx"])
    if t is None:
        return False
    for c in sb.rows(db, attempt.id, "task_comment"):
        d = c.data
        if d.get("task_id") == t.id and d.get("author_profile") == attempt.profile_key \
                and _after(c.created_at, opened) and _contains_any(d.get("text"), chk["contains"]):
            return True
    return False


def _concern_created(db, attempt, chk, opened):
    for r in sb.rows(db, attempt.id, "concern"):
        d = r.data
        if d.get("fx") or not _after(r.created_at, opened):
            continue
        if chk["level"] == "leader" and sb.is_worker_row(d):
            return True
        if chk["level"] == "supervisor" and not d.get("worker_name"):
            return True
    return False


def _concern_status(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    return bool(r) and r.data.get("status") == chk["status"] and _after(r.updated_at, opened)


def _concern_closed(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    if not r or r.data.get("status") != "done" or not _after(r.updated_at, opened):
        return False
    return any(c.data.get("concern_id") == r.id and c.data.get("kind") == "resolution"
               and _after(c.created_at, opened) and _norm(c.data.get("text"))
               for c in sb.rows(db, attempt.id, "concern_comment"))


def _concern_comment(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    if r is None:
        return False
    return any(c.data.get("concern_id") == r.id and c.data.get("author_profile") == attempt.profile_key
               and _after(c.created_at, opened) and _contains_any(c.data.get("text"), chk["contains"])
               for c in sb.rows(db, attempt.id, "concern_comment"))


def _concern_text_token(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    if not r or not _after(r.updated_at, opened):
        return False
    text = r.data.get("concern_text") or ""
    return any(re.search(rf"(^|[^\w]){re.escape(tok)}([^\w]|$)", text) for tok in chk["tokens"])


def _concern_escalated(db, attempt, chk, opened):
    r = sb.fx_row(db, attempt.id, "concern", chk["fx"])
    if not r or (r.data.get("level") or "supervisor") != "supervisor":
        return False
    return any(m.data.get("concern_id") == r.id and m.data.get("direction") == "up"
               and _norm(m.data.get("reason")) and _after(m.created_at, opened)
               for m in sb.rows(db, attempt.id, "concern_move"))


def _idle_entry(db, attempt, chk, opened):
    cell = next((c for c in sb.CELLS if c["code"] == chk["cell"]), None)
    if cell is None:
        return False
    for r in sb.rows(db, attempt.id, "idle"):
        d = r.data
        if d.get("fx") or d.get("cell_id") != cell["cell_id"] or not _after(r.created_at, opened):
            continue
        if d.get("start") != chk["start"] or d.get("end") != chk["end"]:
            continue
        if chk.get("cats") and d.get("category") not in chk["cats"]:
            continue
        if chk.get("note") and not _contains_any(d.get("note"), chk["note"]):
            continue
        return True
    return False


def _dispute_filed(db, attempt, chk, opened):
    return any(r.data.get("task_id") == chk["task_id"] and len(_norm(r.data.get("reason"))) >= chk["min_len"]
               and _after(r.created_at, opened)
               for r in sb.leader_dispute_rows(db, attempt.id))


_SANDBOX = {
    "task_status": _task_status, "task_comment": _task_comment,
    "concern_created": _concern_created, "concern_status": _concern_status,
    "concern_closed": _concern_closed, "concern_comment": _concern_comment,
    "concern_text_token": _concern_text_token, "concern_escalated": _concern_escalated,
    "idle_entry": _idle_entry, "dispute_filed": _dispute_filed,
}


# ui / visit predicates ------------------------------------------------------

def _same(a, b) -> bool:
    # A multi-pick filter is a SET: OptsFilter stores the picks in click
    # order, so ["todo"] reached through ["doing","todo"] must not depend on it.
    if isinstance(a, list) and isinstance(b, list):
        return sorted(json.dumps(x, sort_keys=True) for x in a) == \
            sorted(json.dumps(x, sort_keys=True) for x in b)
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def _ui_equals(db, attempt, chk, opened):
    return any(_same(_ui(e).get(chk["key"]), chk["value"]) for e in events(db, attempt.id, opened))


def _ui_sort(db, attempt, chk, opened):
    for e in events(db, attempt.id, opened):
        v = _ui(e).get(chk["key"])
        if isinstance(v, dict) and v.get("key") == chk["sort_key"] and v.get("dir") == chk["dir"]:
            return True
    return False


def _ui_round_trip(db, attempt, chk, opened):
    """Away from the starting value and back — `lang`, `theme`."""
    vals = [_ui(e).get(chk["key"]) for e in events(db, attempt.id, opened)]
    vals = [v for v in vals if v]
    if len(vals) < 3:
        return False
    start = vals[0]
    seen_other = False
    for v in vals[1:]:
        if v != start:
            seen_other = True
        elif seen_other:
            return True
    return False


def _notif_all_read(db, attempt, chk, opened):
    ids = {sb.notification_id(r) for r in sb.rows(db, attempt.id, "notification")}
    if not ids:
        return False
    for e in events(db, attempt.id, opened):
        v = _ui(e).get("notif_read_ids")
        if isinstance(v, list) and ids <= {int(x) for x in v if str(x).lstrip("-").isdigit()}:
            return True
    return False


def _visit_tab(db, attempt, chk, opened):
    for e in events(db, attempt.id, opened):
        if not (e.path or "").startswith(chk["path"]):
            continue
        if _ui(e).get(chk["key"]) == chk["value"]:
            return True
    return False


_UI = {
    "ui_equals": _ui_equals, "ui_sort": _ui_sort, "ui_round_trip": _ui_round_trip,
    "notif_all_read": _notif_all_read,
}
