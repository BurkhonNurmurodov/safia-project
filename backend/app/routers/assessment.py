"""«Nomzodlarni baholash» (/assessment) — the supervisor-candidate panel.

Page key `assessment` (Laboratory): admin-only until the operator opens it on
the Access tab. Two kinds of right live here, and the server decides both:

  * the BANK, creating / closing / redrawing / deleting a sitting — admins only;
  * a SEAT (one of five departments) — anybody who may open the page claims one
    and grades on it. A seat belongs to the claiming PROFILE; only its judge
    grades on it, ONLY the questions of its own department (the operator,
    2026-10-31), and a submitted scorecard is final.

The panel stays independent: whoever holds an UNSUBMITTED seat sees no other
judge's verdicts (`results_hidden: "own_pending"`), only how far each seat is.
The per-question and feedback autosaves sit under `/api/assessment/draft/`,
which the action register skips — the submit is the act it records.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_profile_key
from app.models import (
    Assessment, AssessmentCandidate, AssessmentGrade, AssessmentItem,
    AssessmentQuestion, JudgeEvaluation, TurnoverPerson, TurnoverRead,
)
from app.translit import transliterate
from app.permissions import require_page
from app.services import action_log
from app.services import assessment as rules

router = APIRouter(prefix="/api/assessment", tags=["assessment"])
PAGE = require_page("assessment")
TZ = ZoneInfo("Asia/Tashkent")


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    """A date as is; an instant on the plant's wall clock (Tashkent) — the
    page prints it as sent and never converts it into the browser's zone."""
    if not v:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(TZ).isoformat()
    return v.isoformat()


def _who(payload: dict) -> str:
    return payload.get("full_name") or str(payload.get("sub") or "")


def _is_admin(payload: dict) -> bool:
    return payload.get("role") == "admin"


def _require_admin(payload: dict) -> None:
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail={"code": "admin_only", "message": "Only an admin can do this."})


def _judge_key(db: Session, payload: dict) -> str:
    """The seat's owner: the viewer's ACTIVE profile, so two people sharing an
    account never share a scorecard; an identity the platform cannot resolve
    falls back to the account."""
    return viewer_profile_key(db, payload) or f"tg:{payload.get('sub')}"


def _refuse(status: int, code: str, message: str, **params) -> None:
    raise HTTPException(status_code=status, detail={"code": code, "message": message, **params})


def _clean(s: Optional[str], limit: int) -> str:
    s = (s or "").replace("\r\n", "\n").strip()
    return s[:limit]


def _fold(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _get(db: Session, aid: int, lock: bool = False) -> Assessment:
    q = db.query(Assessment).filter(Assessment.id == aid)
    if lock:
        q = q.with_for_update()
    a = q.first()
    if not a:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Assessment not found."})
    return a


def _items(db: Session, aid: int) -> list[AssessmentItem]:
    return (db.query(AssessmentItem).filter(AssessmentItem.assessment_id == aid)
            .order_by(AssessmentItem.position).all())


def _item_dict(it: AssessmentItem) -> dict:
    return {"id": it.id, "position": it.position, "department": it.department,
            "qtype": it.qtype, "text": it.text, "answer": it.answer}


def _grades_of(db: Session, eval_ids: list[int]) -> dict[int, dict[int, dict]]:
    out: dict[int, dict[int, dict]] = {}
    if not eval_ids:
        return out
    for g in db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id.in_(eval_ids)).all():
        out.setdefault(g.evaluation_id, {})[g.item_id] = {"verdict": g.verdict, "note": g.note}
    return out


def _graded(grades: dict[int, dict], own: Optional[set] = None) -> int:
    """Verdicts given — on the scorecard's own questions only when `own` (item
    ids) is passed: a grade on another department's question never counts."""
    return sum(1 for k, v in grades.items()
               if v.get("verdict") in rules.VERDICTS and (own is None or k in own))


def _own_ids(item_dept: dict[int, str], department: str) -> set:
    return {i for i, d in item_dept.items() if d == department}


def _active_pool(db: Session) -> list[dict]:
    rows = db.query(AssessmentQuestion).filter(AssessmentQuestion.archived_at.is_(None)).all()
    return [{"id": q.id, "department": q.department, "qtype": q.qtype, "text": q.text,
             "answer": q.answer} for q in rows]


def _seen_by(db: Session, candidate_id: int, but: Optional[int] = None) -> set[int]:
    """Questions this candidate was already asked in another sitting."""
    q = (db.query(AssessmentItem.question_id)
         .join(Assessment, Assessment.id == AssessmentItem.assessment_id)
         .filter(Assessment.candidate_id == candidate_id, AssessmentItem.question_id.isnot(None)))
    if but:
        q = q.filter(Assessment.id != but)
    return {r[0] for r in q.all()}


def _draw_into(db: Session, a: Assessment) -> int:
    try:
        picked = rules.draw(_active_pool(db), seen=_seen_by(db, a.candidate_id, but=a.id))
    except rules.PoolShort as e:
        _refuse(409, "pool_short", "The question bank cannot fill the draw.",
                shorts=[s.as_dict() for s in e.shorts])
    for i, q in enumerate(picked, start=1):
        db.add(AssessmentItem(assessment_id=a.id, position=i, question_id=q["id"],
                              department=q["department"], qtype=q["qtype"], text=q["text"],
                              answer=q.get("answer")))
    return len(picked)


def _has_work(db: Session, aid: int) -> bool:
    """Has any judge entered anything on this sitting — a verdict, a note, a
    word of feedback, a submission? Redrawing or deleting would destroy it."""
    evs = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid).all()
    if any(e.submitted_at or (e.overall_feedback or "").strip() for e in evs):
        return True
    ids = [e.id for e in evs]
    if not ids:
        return False
    return db.query(AssessmentGrade.id).filter(
        AssessmentGrade.evaluation_id.in_(ids),
        (AssessmentGrade.verdict.isnot(None)) | (func.coalesce(func.trim(AssessmentGrade.note), "") != ""),
    ).first() is not None


# ── meta ──────────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(payload: dict = Depends(PAGE)):
    return {**rules.meta(), "is_admin": _is_admin(payload)}


# ── the question bank (admins) ───────────────────────────────────────────────

def _q_dict(q: AssessmentQuestion, used: dict[int, int]) -> dict:
    return {"id": q.id, "department": q.department, "qtype": q.qtype, "text": q.text,
            "answer": q.answer, "archived_at": _iso(q.archived_at), "archived_by": q.archived_by,
            "created_at": _iso(q.created_at), "created_by": q.created_by,
            "updated_at": _iso(q.updated_at), "updated_by": q.updated_by,
            "used": used.get(q.id, 0), "sample": q.created_by == rules.SAMPLE_SOURCE}


@router.get("/questions")
def list_questions(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The whole bank (archived included, marked) + whether the active part
    can fill a draw. Admins only — a judge never browses the bank."""
    _require_admin(payload)
    used = dict(db.query(AssessmentItem.question_id, func.count(AssessmentItem.id))
                .filter(AssessmentItem.question_id.isnot(None))
                .group_by(AssessmentItem.question_id).all())
    rows = db.query(AssessmentQuestion).order_by(AssessmentQuestion.id.desc()).all()
    return {"rows": [_q_dict(q, used) for q in rows],
            "pool": rules.pool_status(_active_pool(db)), "meta": rules.meta()}


def _valid_dept_type(department, qtype) -> tuple[str, str]:
    if department not in rules.DEPARTMENTS:
        _refuse(400, "bad_department", "Unknown department.")
    if qtype not in rules.TYPES:
        _refuse(400, "bad_type", "Unknown question type.")
    return department, qtype


@router.post("/questions")
def add_questions(body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Add questions — every non-empty line of `text` is one question. A line
    identical to an active question of the same department is skipped. An
    `answer` (the expected answer) is taken only when exactly ONE question is
    added — it could belong to no line in particular otherwise."""
    _require_admin(payload)
    dept, qtype = _valid_dept_type(body.get("department"), body.get("qtype"))
    lines = [ln.strip() for ln in str(body.get("text") or "").replace("\r\n", "\n").split("\n")]
    lines = [ln[:rules.MAX_TEXT] for ln in lines if ln]
    if not lines:
        _refuse(400, "text_required", "Write at least one question.")
    if len(lines) > 200:
        _refuse(400, "too_many", "At most 200 questions at once.")
    answer = _clean(body.get("answer"), rules.MAX_ANSWER) or None
    if answer and len(lines) > 1:
        _refuse(400, "answer_one", "An expected answer goes with one question at a time.")
    have = {_fold(q.text) for q in db.query(AssessmentQuestion).filter(
        AssessmentQuestion.department == dept, AssessmentQuestion.archived_at.is_(None)).all()}
    added, skipped = 0, 0
    for ln in lines:
        k = _fold(ln)
        if k in have:
            skipped += 1
            continue
        have.add(k)
        db.add(AssessmentQuestion(department=dept, qtype=qtype, text=ln, answer=answer,
                                  created_by=_who(payload)))
        added += 1
    db.commit()
    action_log.enrich(target_kind="assessment_question",
                      details=[("department", dept), ("type", qtype), ("added", added), ("skipped", skipped)])
    return {"added": added, "skipped_duplicate": skipped, "pool": rules.pool_status(_active_pool(db))}


@router.put("/questions/{qid}")
def edit_question(qid: int, body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    _require_admin(payload)
    q = db.query(AssessmentQuestion).filter(AssessmentQuestion.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Question not found."})
    dept, qtype = _valid_dept_type(body.get("department", q.department), body.get("qtype", q.qtype))
    text = _clean(body.get("text", q.text), rules.MAX_TEXT)
    if not text:
        _refuse(400, "text_required", "The question cannot be empty.")
    answer = (_clean(body["answer"], rules.MAX_ANSWER) or None) if "answer" in body else q.answer
    changes = [(f, o, n) for f, o, n in (("department", q.department, dept), ("type", q.qtype, qtype),
                                         ("text", q.text, text), ("answer", q.answer, answer)) if o != n]
    q.department, q.qtype, q.text, q.answer = dept, qtype, text, answer
    if changes:
        q.updated_at, q.updated_by = _now(), _who(payload)
    db.commit()
    action_log.enrich(target_kind="assessment_question", target_id=str(q.id), changes=changes)
    return {"ok": True, "pool": rules.pool_status(_active_pool(db))}


@router.post("/questions/{qid}/archive")
def archive_question(qid: int, body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Take a question out of the draw (or put it back). Never deleted: the
    sittings it was drawn into keep their own copy anyway."""
    _require_admin(payload)
    q = db.query(AssessmentQuestion).filter(AssessmentQuestion.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Question not found."})
    archived = bool(body.get("archived", True))
    if archived and not q.archived_at:
        q.archived_at, q.archived_by = _now(), _who(payload)
    elif not archived and q.archived_at:
        same = {_fold(t) for (t,) in db.query(AssessmentQuestion.text).filter(
            AssessmentQuestion.department == q.department, AssessmentQuestion.archived_at.is_(None),
            AssessmentQuestion.id != q.id).all()}
        if _fold(q.text) in same:
            _refuse(409, "duplicate", "The same question is already in the bank.")
        q.archived_at, q.archived_by = None, None
    db.commit()
    action_log.enrich(target_kind="assessment_question", target_id=str(q.id),
                      details=[("archived", archived)])
    return {"ok": True, "pool": rules.pool_status(_active_pool(db))}


# ── sample questions (for trying the page out) ───────────────────────────────

def _sample_scope(db: Session) -> tuple[list[int], list[Assessment]]:
    """The sample questions, and every sitting that drew one of them."""
    qids = [i for (i,) in db.query(AssessmentQuestion.id).filter(
        AssessmentQuestion.created_by == rules.SAMPLE_SOURCE).all()]
    if not qids:
        return [], []
    aids = {a for (a,) in db.query(AssessmentItem.assessment_id).filter(
        AssessmentItem.question_id.in_(qids)).distinct().all()}
    sittings = db.query(Assessment).filter(Assessment.id.in_(aids)).order_by(Assessment.id).all() if aids else []
    return qids, sittings


@router.get("/samples")
def sample_state(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """What «Namunalarni o'chirish» would remove — said before it does."""
    _require_admin(payload)
    qids, sittings = _sample_scope(db)
    cands = {c.id: c.full_name for c in db.query(AssessmentCandidate).filter(
        AssessmentCandidate.id.in_({a.candidate_id for a in sittings})).all()} if sittings else {}
    return {"questions": len(qids),
            "assessments": [{"id": a.id, "candidate": cands.get(a.candidate_id), "held_on": _iso(a.held_on),
                             "status": a.status} for a in sittings]}


@router.delete("/samples")
def delete_samples(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Remove every SAMPLE question and every sitting drawn from one (its
    scorecards and grades with it), plus a candidate left with no sitting.
    Real questions are untouched. Admins only; no undo — the page asks first."""
    _require_admin(payload)
    qids, sittings = _sample_scope(db)
    aids = [a.id for a in sittings]
    cand_ids = {a.candidate_id for a in sittings}
    grades = evals = items = 0
    if aids:
        eids = [i for (i,) in db.query(JudgeEvaluation.id).filter(JudgeEvaluation.assessment_id.in_(aids)).all()]
        if eids:
            grades = db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id.in_(eids)).delete(synchronize_session=False)
            evals = db.query(JudgeEvaluation).filter(JudgeEvaluation.id.in_(eids)).delete(synchronize_session=False)
        items = db.query(AssessmentItem).filter(AssessmentItem.assessment_id.in_(aids)).delete(synchronize_session=False)
        db.query(Assessment).filter(Assessment.id.in_(aids)).delete(synchronize_session=False)
    # A sitting drawn before the samples went may still name one by id.
    if qids:
        db.query(AssessmentItem).filter(AssessmentItem.question_id.in_(qids)).update(
            {AssessmentItem.question_id: None}, synchronize_session=False)
    questions = db.query(AssessmentQuestion).filter(AssessmentQuestion.id.in_(qids)).delete(synchronize_session=False) if qids else 0
    candidates = 0
    if cand_ids:
        still = {c for (c,) in db.query(Assessment.candidate_id).filter(Assessment.candidate_id.in_(cand_ids)).all()}
        gone = [c for c in cand_ids if c not in still]
        if gone:
            candidates = db.query(AssessmentCandidate).filter(AssessmentCandidate.id.in_(gone)).delete(synchronize_session=False)
    db.commit()
    out = {"questions": questions, "assessments": len(aids), "evaluations": evals, "grades": grades,
           "items": items, "candidates": candidates}
    action_log.enrich(target_kind="assessment_question", details=list(out.items()))
    return out


# ── candidates & sittings ─────────────────────────────────────────────────────

# A candidate is one of the plant's CURRENT WORKERS (the operator, 2026-10-31):
# picked from the Verifix directory the turnover KPI reads every night
# (`turnover_people`, status W), never typed in. The directory is ~3,000
# people, so it is searched here, folded once and kept in memory a few minutes.
_WORKERS: dict = {"at": 0.0, "rows": []}
_WORKERS_TTL_S = 300


def _fold_name(s: str) -> str:
    s = transliterate(s or "", "uz") or ""
    s = re.sub(r"[ʻʼ’'`‘]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _workers(db: Session) -> list[tuple]:
    import time
    now = time.monotonic()
    if _WORKERS["rows"] and now - _WORKERS["at"] < _WORKERS_TTL_S:
        return _WORKERS["rows"]
    rows = []
    for p in db.query(TurnoverPerson).filter(TurnoverPerson.status == "W").all():
        rows.append((p.employee_id, p.name, _fold_name(p.name), p.job, p.unit_name, p.code))
    rows.sort(key=lambda r: r[2])
    _WORKERS.update(at=now, rows=rows)
    return rows


def _directory_state(db: Session) -> dict:
    last = (db.query(TurnoverRead).filter(TurnoverRead.ok.is_(True))
            .order_by(TurnoverRead.id.desc()).first())
    return {"count": db.query(func.count(TurnoverPerson.employee_id)).filter(TurnoverPerson.status == "W").scalar() or 0,
            "read_at": _iso(last.finished_at) if last else None}


@router.get("/workers")
def search_workers(q: str = Query(default=""), limit: int = Query(default=30, ge=1, le=60),
                   db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Current workers matching `q` (every word of it, in Latin or Cyrillic,
    apostrophes ignored), for the new-assessment form. Admins only — it is the
    door to a sitting. With fewer than 2 letters it answers nothing but the
    directory's size, so the dropdown never paints thousands of rows."""
    _require_admin(payload)
    words = [w for w in _fold_name(q).split(" ") if w]
    out = []
    if sum(len(w) for w in words) >= 2:
        for eid, name, folded, job, unit, code in _workers(db):
            if all(w in folded for w in words):
                out.append((0 if folded.startswith(words[0]) else 1, eid, name, job, unit, code))
        out.sort(key=lambda r: r[0])
    hits = out[:limit]
    counts = {}
    if hits:
        counts = dict(db.query(AssessmentCandidate.employee_id, func.count(Assessment.id))
                      .join(Assessment, Assessment.candidate_id == AssessmentCandidate.id)
                      .filter(AssessmentCandidate.employee_id.in_([h[1] for h in hits]))
                      .group_by(AssessmentCandidate.employee_id).all())
    return {
        "rows": [{"employee_id": eid, "name": name, "job": job, "unit": unit, "code": code,
                  "assessments": counts.get(eid, 0)} for _, eid, name, job, unit, code in hits],
        "more": len(out) > limit,
        "directory": _directory_state(db),
    }


def _cand_dict(c: Optional[AssessmentCandidate]) -> Optional[dict]:
    if not c:
        return None
    return {"id": c.id, "full_name": c.full_name, "note": c.note, "employee_id": c.employee_id,
            "job": c.job, "unit": c.unit_name, "code": c.cell_code}


@router.get("/candidates")
def list_candidates(db: Session = Depends(get_db), _: dict = Depends(PAGE)):
    counts = dict(db.query(Assessment.candidate_id, func.count(Assessment.id))
                  .group_by(Assessment.candidate_id).all())
    rows = db.query(AssessmentCandidate).order_by(AssessmentCandidate.full_name).all()
    return [{"id": c.id, "full_name": c.full_name, "note": c.note, "assessments": counts.get(c.id, 0)}
            for c in rows]


def _seats(evs: list[JudgeEvaluation], grades: dict[int, dict[int, dict]], me: str,
           item_dept: dict[int, str]) -> list[dict]:
    by = {e.department: e for e in evs}
    out = []
    for d in rules.SEAT_ORDER:
        e = by.get(d)
        own = _own_ids(item_dept, d)
        out.append({
            "department": d,
            "judge_name": e.judge_name if e else None,
            "total": len(own),     # how many of the sitting's questions this seat grades
            "graded": _graded(grades.get(e.id, {}), own) if e else 0,
            "submitted": bool(e and e.submitted_at),
            "submitted_at": _iso(e.submitted_at) if e else None,
            "mine": bool(e and _is_mine(e, me)),
        })
    return out


def _is_mine(e: JudgeEvaluation, me: str) -> bool:
    """Is this scorecard the viewer's? Their own key, or — in TEST MODE — one of
    the per-seat keys an admin takes («<key>#<department>»)."""
    return e.judge_key == me or e.judge_key.startswith(me + "#")


def _mine_all(evs: list[JudgeEvaluation], me: str) -> list[JudgeEvaluation]:
    order = {d: i for i, d in enumerate(rules.SEAT_ORDER)}
    return sorted((e for e in evs if _is_mine(e, me)), key=lambda e: order.get(e.department, 99))


def _pick_mine(evs: list[JudgeEvaluation], me: str, seat: Optional[str]) -> Optional[JudgeEvaluation]:
    """The scorecard the viewer is looking at: the one on `seat` when they hold
    it, else their first unsubmitted one, else their first. One person holds one
    seat everywhere but in test mode, where this is the seat being graded."""
    mine = _mine_all(evs, me)
    if seat:
        return next((e for e in mine if e.department == seat), None)
    return next((e for e in mine if not e.submitted_at), None) or (mine[0] if mine else None)


def _is_test(db: Session, aid: int) -> bool:
    """TEST MODE: a sitting drawn from at least one SAMPLE question
    (`rules.SAMPLE_SOURCE`). There an admin may hold every seat, to try the
    whole panel alone; such sittings are removed with the samples, so the mode
    disappears with them. Everywhere else one person holds one seat."""
    return db.query(AssessmentItem.id).join(
        AssessmentQuestion, AssessmentQuestion.id == AssessmentItem.question_id).filter(
        AssessmentItem.assessment_id == aid,
        AssessmentQuestion.created_by == rules.SAMPLE_SOURCE).first() is not None


def _hidden(evs: list[JudgeEvaluation], me: str, current: Optional[JudgeEvaluation] = None) -> Optional[str]:
    """Results stay closed to a judge whose scorecard is still open. With
    `current` (the seat on screen) the rule is that seat's — what its judge
    would see; without it (the list), any open seat of the viewer's closes it."""
    if current is not None:
        return "own_pending" if not current.submitted_at else None
    return "own_pending" if any(not e.submitted_at for e in _mine_all(evs, me)) else None


@router.get("/assessments")
def list_assessments(
    status: str = Query(default="all"),
    db: Session = Depends(get_db), payload: dict = Depends(PAGE),
):
    me = _judge_key(db, payload)
    q = db.query(Assessment)
    if status in ("open", "closed"):
        q = q.filter(Assessment.status == status)
    rows = q.order_by(Assessment.id.desc()).limit(500).all()
    if not rows:
        return {"rows": [], "is_admin": _is_admin(payload), "total": rules.TOTAL}
    ids = [a.id for a in rows]
    cands = {c.id: c for c in db.query(AssessmentCandidate).filter(
        AssessmentCandidate.id.in_({a.candidate_id for a in rows})).all()}
    evs_all = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id.in_(ids)).all()
    grades = _grades_of(db, [e.id for e in evs_all])
    depts: dict[int, dict[int, str]] = {}
    for aid_, iid, dep in db.query(AssessmentItem.assessment_id, AssessmentItem.id, AssessmentItem.department).filter(
            AssessmentItem.assessment_id.in_(ids)).all():
        depts.setdefault(aid_, {})[iid] = dep
    by_a: dict[int, list[JudgeEvaluation]] = {}
    for e in evs_all:
        by_a.setdefault(e.assessment_id, []).append(e)
    out = []
    for a in rows:
        evs = by_a.get(a.id, [])
        c = cands.get(a.candidate_id)
        hidden = _hidden(evs, me)
        sub = [e for e in evs if e.submitted_at]
        idep = depts.get(a.id, {})
        p = sum(1 for e in sub for k, v in grades.get(e.id, {}).items()
                if v.get("verdict") == "pass" and idep.get(k) == e.department)
        j = sum(_graded(grades.get(e.id, {}), _own_ids(idep, e.department)) for e in sub)
        out.append({
            "id": a.id, "status": a.status, "held_on": _iso(a.held_on),
            "created_at": _iso(a.created_at), "created_by": a.created_by,
            "closed_at": _iso(a.closed_at),
            "candidate": _cand_dict(c),
            "seats": _seats(evs, grades, me, idep),
            "submitted": len(sub),
            "results_hidden": hidden,
            "overall": None if hidden or not j else {"passed": p, "judged": j, "pct": round(p * 100.0 / j, 1)},
        })
    return {"rows": out, "is_admin": _is_admin(payload), "total": rules.TOTAL}


@router.post("/assessments")
def create_assessment(body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Open a sitting for a CURRENT WORKER (`employee_id`, from
    `GET /workers`) — or a candidate assessed before (`candidate_id`) — and draw
    its 20 questions at once. Nobody is typed in: a name that is not a working
    employee in the Verifix directory is refused (400 `pick_worker`), and one
    person is one candidate row however often they are assessed. A bank that
    cannot fill the draw refuses the whole thing (409 pool_short)."""
    _require_admin(payload)
    cid = body.get("candidate_id")
    eid = str(body.get("employee_id") or "").strip()
    if eid:
        person = db.query(TurnoverPerson).filter(TurnoverPerson.employee_id == eid,
                                                 TurnoverPerson.status == "W").first()
        if not person:
            _refuse(404, "worker_not_found", "This person is not a current worker.")
        cand = db.query(AssessmentCandidate).filter(AssessmentCandidate.employee_id == eid).first()
        if not cand:
            cand = AssessmentCandidate(employee_id=eid, full_name=person.name, created_by=_who(payload))
            db.add(cand)
        # the directory's latest word on who they are and where they work
        cand.full_name, cand.job, cand.unit_name, cand.cell_code = person.name, person.job, person.unit_name, person.code
        note = _clean(body.get("candidate_note"), 500)
        if note:
            cand.note = note
        db.flush()
    elif cid:
        cand = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == int(cid)).first()
        if not cand:
            _refuse(404, "candidate_not_found", "Candidate not found.")
    else:
        _refuse(400, "pick_worker", "Pick the candidate from the current workers.")
    held = body.get("held_on")
    try:
        held_on = date.fromisoformat(held) if held else datetime.now(TZ).date()
    except ValueError:
        _refuse(400, "bad_date", "The date is not a date.")
    a = Assessment(candidate_id=cand.id, held_on=held_on, created_by=_who(payload))
    db.add(a)
    db.flush()
    n = _draw_into(db, a)
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(a.id),
                      details=[("candidate", cand.full_name), ("day", held_on.isoformat()), ("questions", n)])
    return {"id": a.id}


@router.get("/assessments/{aid}")
def get_assessment(aid: int, seat: Optional[str] = Query(default=None),
                   db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The grading dashboard, whole: the candidate, the 20 questions, every
    seat's progress, the viewer's own scorecard, and — unless the viewer still
    holds an unsubmitted seat — the submitted results."""
    a = _get(db, aid)
    me = _judge_key(db, payload)
    admin = _is_admin(payload)
    c = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == a.candidate_id).first()
    items = _items(db, aid)
    evs = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid).all()
    grades = _grades_of(db, [e.id for e in evs])
    mine = _pick_mine(evs, me, seat)
    mine_all = _mine_all(evs, me)
    test = _is_test(db, aid)
    multi = test and admin           # an admin tries every seat of a test sitting
    hidden = _hidden(evs, me, mine)
    res = None
    if not hidden:
        res = rules.results([_item_dict(i) for i in items], [
            {"department": e.department, "judge_name": e.judge_name, "submitted_at": _iso(e.submitted_at),
             "overall_feedback": e.overall_feedback, "grades": grades.get(e.id, {})}
            for e in evs if e.submitted_at])
    is_open = a.status == "open"
    taken = {e.department for e in evs}
    work = _has_work(db, aid)
    return {
        "id": a.id, "status": a.status, "held_on": _iso(a.held_on),
        "created_at": _iso(a.created_at), "created_by": a.created_by,
        "closed_at": _iso(a.closed_at), "closed_by": a.closed_by,
        "candidate": _cand_dict(c),
        "items": [_item_dict(i) for i in items],
        "total": len(items),
        "seats": _seats(evs, grades, me, {i.id: i.department for i in items}),
        "mine": None if not mine else {
            "id": mine.id, "department": mine.department,
            "grades": {str(k): v for k, v in grades.get(mine.id, {}).items()},
            "overall_feedback": mine.overall_feedback or "",
            "submitted_at": _iso(mine.submitted_at),
        },
        "results": res,
        "results_hidden": hidden,
        "test_mode": test,
        "my_seats": [e.department for e in mine_all],
        "rights": {
            "admin": admin,
            "multi_seat": multi,
            # a free seat may be taken: by anybody without one, by a judge
            # moving an open scorecard, and in test mode by an admin always
            "claim": is_open and len(taken) < len(rules.DEPARTMENTS)
                     and (multi or mine is None or not mine.submitted_at),
            "grade": is_open and mine is not None and not mine.submitted_at,
            "release_any": admin and is_open,
            "close": admin and is_open,
            "reopen": admin and not is_open,
            "redraw": admin and is_open and not work,
            # a test sitting's grades are test grades: it may go at any time
            "delete": admin and (test or not work),
        },
    }


@router.post("/assessments/{aid}/seat")
def claim_seat(aid: int, body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Sit on a department's seat — or move an unsubmitted scorecard to
    another free one. A judge grades only their department's questions, so a
    move deletes what was given on the old department's (`dropped`)."""
    a = _get(db, aid, lock=True)
    if a.status != "open":
        _refuse(409, "closed", "This assessment is closed.")
    dept = body.get("department")
    if dept not in rules.DEPARTMENTS:
        _refuse(400, "bad_department", "Unknown department.")
    me = _judge_key(db, payload)
    evs = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid).all()
    holder = next((e for e in evs if e.department == dept), None)
    if holder and _is_mine(holder, me):
        return {"ok": True}
    if holder:
        _refuse(409, "seat_taken", "Another judge already holds this seat.", judge=holder.judge_name)
    # TEST MODE: an admin takes the seat as ONE MORE scorecard of theirs
    # (a per-seat key), never moving the ones already held.
    multi = _is_admin(payload) and _is_test(db, aid)
    mine = None if multi else _pick_mine(evs, me, body.get("from"))
    if mine and mine.submitted_at:
        _refuse(409, "submitted", "Your scorecard is already submitted.")
    key = f"{me}#{dept}" if multi and _mine_all(evs, me) else me
    dropped = 0
    try:
        if mine:
            old = mine.department
            # A judge grades their own department's questions only, so the
            # verdicts and notes given as the old department go with it.
            other = [i for (i,) in db.query(AssessmentItem.id).filter(
                AssessmentItem.assessment_id == aid, AssessmentItem.department != dept).all()]
            if other:
                dropped = db.query(AssessmentGrade).filter(
                    AssessmentGrade.evaluation_id == mine.id,
                    AssessmentGrade.item_id.in_(other)).delete(synchronize_session=False)
            mine.department, mine.updated_at = dept, _now()
        else:
            old = None
            db.add(JudgeEvaluation(assessment_id=aid, department=dept, judge_key=key,
                                   judge_name=payload.get("full_name"), judge_tg=_tg(payload)))
        db.commit()
    except IntegrityError:
        db.rollback()
        _refuse(409, "seat_taken", "Another judge took this seat a moment ago.")
    action_log.enrich(target_kind="assessment", target_id=str(aid),
                      changes=[("seat", old, dept)] if old else None,
                      details=[("seat", dept), ("dropped", dropped), ("test_mode", multi)])
    return {"ok": True, "dropped": dropped, "seat": dept}


def _tg(payload: dict) -> Optional[int]:
    try:
        return int(payload.get("sub"))
    except (TypeError, ValueError):
        return None


@router.delete("/assessments/{aid}/seats/{department}")
def release_seat(aid: int, department: str, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Free a seat — its own judge, or an admin. Its unsubmitted verdicts and
    notes go with it; a submitted scorecard can never be released."""
    a = _get(db, aid, lock=True)
    if a.status != "open":
        _refuse(409, "closed", "This assessment is closed.")
    ev = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid,
                                          JudgeEvaluation.department == department).first()
    if not ev:
        return {"ok": True}
    if not _is_mine(ev, _judge_key(db, payload)) and not _is_admin(payload):
        _refuse(403, "not_yours", "Only the seat's own judge or an admin can free it.")
    if ev.submitted_at:
        _refuse(409, "submitted", "A submitted scorecard cannot be released.")
    db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id == ev.id).delete(synchronize_session=False)
    judge = ev.judge_name
    db.delete(ev)
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(aid),
                      details=[("seat", department), ("judge", judge)])
    return {"ok": True}


def _my_open_eval(db: Session, aid: int, payload: dict, seat: Optional[str] = None) -> JudgeEvaluation:
    """The viewer's scorecard to write to — on `seat` when given (test mode,
    where an admin holds several), else the one they hold."""
    a = _get(db, aid)
    if a.status != "open":
        _refuse(409, "closed", "This assessment is closed.")
    me = _judge_key(db, payload)
    evs = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid).all()
    pick = _pick_mine(evs, me, seat)
    ev = (db.query(JudgeEvaluation).filter(JudgeEvaluation.id == pick.id).with_for_update().first()
          if pick else None)
    if not ev:
        _refuse(409, "no_seat", "Take a department seat first.")
    if ev.submitted_at:
        _refuse(409, "submitted", "Your scorecard is already submitted.")
    return ev


@router.put("/draft/{aid}/grades/{item_id}")
def save_grade(aid: int, item_id: int, body: dict = Body(...), seat: Optional[str] = Query(default=None),
               db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """One question of the viewer's own scorecard: `verdict` (pass · fail ·
    null) and/or `note` — a key left out is left alone. Saved per tap."""
    ev = _my_open_eval(db, aid, payload, seat)
    it = db.query(AssessmentItem).filter(AssessmentItem.id == item_id,
                                         AssessmentItem.assessment_id == aid).first()
    if not it:
        _refuse(404, "no_item", "This question is not part of the assessment.")
    if it.department != ev.department:
        _refuse(409, "not_your_question", "You grade only your own department's questions.")
    if "verdict" in body and body["verdict"] not in (None, *rules.VERDICTS):
        _refuse(400, "bad_verdict", "A verdict is pass or fail.")
    g = db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id == ev.id,
                                         AssessmentGrade.item_id == item_id).first()
    if not g:
        g = AssessmentGrade(evaluation_id=ev.id, item_id=item_id)
        db.add(g)
    if "verdict" in body:
        g.verdict = body["verdict"]
    if "note" in body:
        g.note = _clean(body["note"], rules.MAX_NOTE) or None
    g.updated_at = ev.updated_at = _now()
    try:
        db.commit()
    except IntegrityError:          # two saves of a first verdict racing: re-apply on the winner
        db.rollback()
        g = db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id == ev.id,
                                             AssessmentGrade.item_id == item_id).first()
        if "verdict" in body:
            g.verdict = body["verdict"]
        if "note" in body:
            g.note = _clean(body["note"], rules.MAX_NOTE) or None
        g.updated_at = _now()
        db.commit()
    own = {i for (i,) in db.query(AssessmentItem.id).filter(
        AssessmentItem.assessment_id == aid, AssessmentItem.department == ev.department).all()}
    graded = _graded(_grades_of(db, [ev.id]).get(ev.id, {}), own)
    return {"item_id": item_id, "verdict": g.verdict, "note": g.note, "graded": graded}


@router.put("/draft/{aid}/feedback")
def save_feedback(aid: int, body: dict = Body(...), seat: Optional[str] = Query(default=None),
                  db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The overall feedback, saved as a draft while it is typed."""
    ev = _my_open_eval(db, aid, payload, seat)
    ev.overall_feedback = _clean(body.get("overall_feedback"), rules.MAX_FEEDBACK) or None
    ev.updated_at = _now()
    db.commit()
    return {"ok": True}


@router.post("/assessments/{aid}/submit")
def submit(aid: int, body: dict = Body(...), seat: Optional[str] = Query(default=None),
           db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Submit the viewer's scorecard — final. Every question of THEIR
    department graded (a seat whose department drew none needs only the
    feedback) and the overall feedback written, or it is refused naming what
    is missing. The fifth submission closes the sitting."""
    # Lock order everywhere: the sitting, then a scorecard (claim, release and
    # submit agree; a grade save takes the scorecard alone).
    a = _get(db, aid, lock=True)
    ev = _my_open_eval(db, aid, payload, seat)
    fb = _clean(body.get("overall_feedback", ev.overall_feedback), rules.MAX_FEEDBACK)
    items = [it for it in _items(db, aid) if it.department == ev.department]   # own questions only
    grades = _grades_of(db, [ev.id]).get(ev.id, {})
    missing = [it.position for it in items if (grades.get(it.id) or {}).get("verdict") not in rules.VERDICTS]
    if missing:
        _refuse(400, "ungraded", "Grade every one of your questions first.", positions=missing, count=len(missing))
    if not fb:
        _refuse(400, "feedback_required", "Write the overall feedback first.")
    ev.overall_feedback, ev.submitted_at, ev.updated_at = fb, _now(), _now()
    db.flush()
    done = db.query(func.count(JudgeEvaluation.id)).filter(
        JudgeEvaluation.assessment_id == aid, JudgeEvaluation.submitted_at.isnot(None)).scalar()
    closed = False
    if done >= len(rules.DEPARTMENTS) and a.status == "open":
        a.status, a.closed_at, a.closed_by, closed = "closed", _now(), "auto", True
    db.commit()
    passed = sum(1 for it in items if (grades.get(it.id) or {}).get("verdict") == "pass")
    action_log.enrich(target_kind="assessment", target_id=str(aid),
                      details=[("seat", ev.department), ("passed", f"{passed}/{len(items)}"),
                               ("closed", closed)])
    return {"ok": True, "closed": closed}


@router.post("/assessments/{aid}/close")
def close_assessment(aid: int, body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Close a sitting early (a judge absent) or open it again. Closed = nobody
    grades; drafts stay drafts and never count."""
    _require_admin(payload)
    a = _get(db, aid, lock=True)
    want = bool(body.get("closed", True))
    old = a.status
    if want and a.status == "open":
        a.status, a.closed_at, a.closed_by = "closed", _now(), _who(payload)
    elif not want and a.status == "closed":
        a.status, a.closed_at, a.closed_by = "open", None, None
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(aid), changes=[("status", old, a.status)])
    return {"ok": True}


@router.post("/assessments/{aid}/redraw")
def redraw(aid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Draw the 20 questions again — only while no judge has entered anything."""
    _require_admin(payload)
    a = _get(db, aid, lock=True)
    if a.status != "open":
        _refuse(409, "closed", "This assessment is closed.")
    if _has_work(db, aid):
        _refuse(409, "has_grades", "Judges have already started grading.")
    db.query(AssessmentItem).filter(AssessmentItem.assessment_id == aid).delete(synchronize_session=False)
    db.flush()
    n = _draw_into(db, a)
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(aid), details=[("questions", n)])
    return {"ok": True}


@router.delete("/assessments/{aid}")
def delete_assessment(aid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Delete a sitting opened by mistake — only while nothing was graded,
    except a TEST sitting (drawn from sample questions), whose grades are test
    grades: it goes at any time, scorecards and grades with it (the operator,
    2026-10-31). A candidate left with no sitting goes too."""
    _require_admin(payload)
    a = _get(db, aid, lock=True)
    test = _is_test(db, aid)
    if not test and _has_work(db, aid):
        _refuse(409, "has_grades", "Judges have already graded this assessment.")
    cand_id = a.candidate_id
    eids = [i for (i,) in db.query(JudgeEvaluation.id).filter(JudgeEvaluation.assessment_id == aid).all()]
    grades = 0
    if eids:
        grades = db.query(AssessmentGrade).filter(AssessmentGrade.evaluation_id.in_(eids)).delete(synchronize_session=False)
        db.query(JudgeEvaluation).filter(JudgeEvaluation.id.in_(eids)).delete(synchronize_session=False)
    db.query(AssessmentItem).filter(AssessmentItem.assessment_id == aid).delete(synchronize_session=False)
    db.delete(a)
    db.flush()
    cand_gone = False
    if cand_id and not db.query(Assessment.id).filter(Assessment.candidate_id == cand_id).first():
        cand_gone = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == cand_id).delete(synchronize_session=False) > 0
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(aid),
                      details=[("test", test), ("scorecards", len(eids)), ("grades", grades),
                               ("candidate_removed", cand_gone)])
    return {"ok": True, "candidate_removed": cand_gone}
