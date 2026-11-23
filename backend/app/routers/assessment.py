"""«Nomzodlarni baholash» (/assessment) — the supervisor-candidate panel.

Page key `assessment` (Laboratory): admin-only until the operator opens it on
the Access tab. Two kinds of right live here, and the server decides both:

  * the BANK, the preparation MATERIALS, creating / closing / redrawing /
    deleting a sitting — admins only;
  * a SEAT (one of five departments) — anybody who may open the page claims one
    and grades on it. A seat belongs to the claiming PROFILE; only its judge
    grades on it, ONLY the questions of its own department (the operator,
    2026-10-31), and a submitted scorecard is final. ONE PERSON MAY HOLD
    SEVERAL SEATS of a sitting, up to all five (the operator, 2026-11-23:
    «one person should be able to grade in terms of all departments not just
    one») — each a scorecard of its own, graded and submitted separately.

The panel stays independent: whoever holds an UNSUBMITTED seat sees no other
judge's verdicts (`results_hidden: "own_pending"`), only how far each seat is.
The per-question and feedback autosaves sit under `/api/assessment/draft/`,
which the action register skips — the submit is the act it records.
"""
from __future__ import annotations

import mimetypes
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.capabilities import page_admin
from app.database import get_db
from app.identity import viewer_profile_key
from app.models import (
    Assessment, AssessmentCandidate, AssessmentGrade, AssessmentItem,
    AssessmentMaterial, AssessmentMaterialPart, AssessmentQuestion, JudgeEvaluation,
    TurnoverPerson, TurnoverRead,
)
from app.translit import transliterate
from app.permissions import require_page
from app.routers.leaders import appeal_body, relay_uploads
from app.services import action_log
from app.services import assessment as rules
from app.services import leader_appeal_chat
from app.services import people

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


def _is_admin(db: Session, payload: dict) -> bool:
    return page_admin(db, payload, "assessment")


def _require_admin(db: Session, payload: dict) -> None:
    if not _is_admin(db, payload):
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
    # The set is a numbered ticket («Bilet №N»), a new one at every draw —
    # taken only once the draw has succeeded, so a short bank burns no number.
    a.ticket_no = db.execute(text(f"SELECT nextval('{rules.TICKET_SEQ}')")).scalar()
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
def get_meta(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    return {**rules.meta(), "is_admin": _is_admin(db, payload)}


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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
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
# people, folded once and kept in memory by `services/people.directory` — the
# one fold «Xodim kartasi» searches too.
_fold_name = people.fold_name


def _workers(db: Session) -> list[tuple]:
    return [(r["employee_id"], r["name"], r["folded"], r["job"], r["unit"], r["code"])
            for r in people.directory(db)["rows"] if r["status"] == "W"]


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
    _require_admin(db, payload)
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


def _photo_emps(db: Session) -> dict:
    """{employee id: their Verifix record} — the one place a person's photo
    hash is kept (the «Xodim kartasi» photo; a candidate's is served by
    `candidate_photo` below). Read once per answer; a failure costs the faces,
    never the list."""
    try:
        from app.services import verifix_org
        org, _ = verifix_org.stored(db)
        return (org or {}).get("emps") or {}
    except Exception:  # noqa: BLE001
        return {}


def _cand_dict(c: Optional[AssessmentCandidate], emps: Optional[dict] = None) -> Optional[dict]:
    """`photo` (when `emps` is given): Verifix holds a photo of this candidate,
    so a list may draw the face and never asks for one that is not there."""
    if not c:
        return None
    out = {"id": c.id, "full_name": c.full_name, "note": c.note, "employee_id": c.employee_id,
           "job": c.job, "unit": c.unit_name, "code": c.cell_code}
    if emps is not None:
        out["photo"] = bool(c.employee_id and (emps.get(str(c.employee_id)) or {}).get("photo"))
    return out


@router.get("/candidates")
def list_candidates(db: Session = Depends(get_db), _: dict = Depends(PAGE)):
    counts = dict(db.query(Assessment.candidate_id, func.count(Assessment.id))
                  .group_by(Assessment.candidate_id).all())
    rows = db.query(AssessmentCandidate).order_by(AssessmentCandidate.full_name).all()
    return [{"id": c.id, "full_name": c.full_name, "note": c.note, "assessments": counts.get(c.id, 0)}
            for c in rows]


@router.get("/candidates/{cid}/photo")
def candidate_photo(cid: int, size: int = Query(default=96, ge=32, le=960),
                    db: Session = Depends(get_db), _: dict = Depends(PAGE)):
    """A candidate's face — their Verifix photo, the one «Xodim kartasi» shows
    — for ANYBODY who may open this page (the operator, 2026-11-23: a shift
    manager on the panel saw initials, because the photo sat behind the
    `people` page). Keyed by the CANDIDATE, never by an employee id: this door
    answers for the people of this page's sittings and for nobody else, and
    opens nothing else of the card."""
    c = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == cid).first()
    if not c or not c.employee_id:
        _refuse(404, "no_photo", "This candidate has no photo.")
    from app.routers.people import photo_response
    return photo_response(db, str(c.employee_id), size)


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
    """Is this scorecard the viewer's? Their own key (the first seat they took),
    or one of the per-seat keys every further seat takes («<key>#<department>»)."""
    return e.judge_key == me or e.judge_key.startswith(me + "#")


def _mine_all(evs: list[JudgeEvaluation], me: str) -> list[JudgeEvaluation]:
    order = {d: i for i, d in enumerate(rules.SEAT_ORDER)}
    return sorted((e for e in evs if _is_mine(e, me)), key=lambda e: order.get(e.department, 99))


def _pick_mine(evs: list[JudgeEvaluation], me: str, seat: Optional[str]) -> Optional[JudgeEvaluation]:
    """The scorecard the viewer is looking at: the one on `seat` when they hold
    it, else their first unsubmitted one, else their first. One person may hold
    several seats, so `seat` is the one being graded."""
    mine = _mine_all(evs, me)
    if seat:
        return next((e for e in mine if e.department == seat), None)
    return next((e for e in mine if not e.submitted_at), None) or (mine[0] if mine else None)


def _is_test(db: Session, aid: int) -> bool:
    """TEST MODE: a sitting drawn from at least one SAMPLE question
    (`rules.SAMPLE_SOURCE`). Its grades are test grades — it may be deleted at
    any time, and its results follow the seat on screen (`_hidden`); such
    sittings are removed with the samples, so the mode disappears with them.
    (Holding several seats was this mode's alone until 2026-11-23; it is
    everybody's on every sitting now.)"""
    return db.query(AssessmentItem.id).join(
        AssessmentQuestion, AssessmentQuestion.id == AssessmentItem.question_id).filter(
        AssessmentItem.assessment_id == aid,
        AssessmentQuestion.created_by == rules.SAMPLE_SOURCE).first() is not None


def _hidden(evs: list[JudgeEvaluation], me: str, current: Optional[JudgeEvaluation] = None) -> Optional[str]:
    """Results stay closed to a judge whose scorecard is still open: ANY open
    seat of the viewer's closes them — the list, and a real sitting's page, so
    somebody holding several seats reads no other judge's verdicts until every
    scorecard of theirs is in. With `current` (a TEST sitting's seat on
    screen) the rule is that seat's — what its judge would see."""
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
        return {"rows": [], "is_admin": _is_admin(db, payload), "total": rules.TOTAL}
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
    emps = _photo_emps(db)
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
            "id": a.id, "ticket_no": a.ticket_no, "status": a.status, "held_on": _iso(a.held_on),
            "created_at": _iso(a.created_at), "created_by": a.created_by,
            "closed_at": _iso(a.closed_at),
            "candidate": _cand_dict(c, emps),
            "seats": _seats(evs, grades, me, idep),
            "submitted": len(sub),
            "results_hidden": hidden,
            "overall": None if hidden or not j else {"passed": p, "judged": j, "pct": round(p * 100.0 / j, 1)},
        })
    return {"rows": out, "is_admin": _is_admin(db, payload), "total": rules.TOTAL}


@router.post("/assessments")
def create_assessment(body: dict = Body(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Open a sitting for a CURRENT WORKER (`employee_id`, from
    `GET /workers`) — or a candidate assessed before (`candidate_id`) — and draw
    its 20 questions at once. Nobody is typed in: a name that is not a working
    employee in the Verifix directory is refused (400 `pick_worker`), and one
    person is one candidate row however often they are assessed. A bank that
    cannot fill the draw refuses the whole thing (409 pool_short)."""
    _require_admin(db, payload)
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
                      details=[("candidate", cand.full_name), ("day", held_on.isoformat()),
                               ("ticket", a.ticket_no), ("questions", n)])
    return {"id": a.id, "ticket_no": a.ticket_no}


# ── «Biletlar» — every drawn set as a ticket of its own (admins) ──────────────
@router.get("/tickets")
def list_tickets(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Every sitting's drawn set as a ticket: its number, whose it is, when, and
    what it holds (questions per department and per type). The questions
    themselves are `GET /tickets/{id}`. Admins only — a ticket carries the
    bank's questions and their expected answers, which a judge never browses.
    A redrawn set is replaced by the new one; the old set is not kept."""
    _require_admin(db, payload)
    rows = (db.query(Assessment)
            .order_by(Assessment.ticket_no.desc().nulls_last(), Assessment.id.desc())
            .limit(500).all())
    if not rows:
        return {"rows": [], "total": rules.TOTAL}
    ids = [a.id for a in rows]
    cands = {c.id: c for c in db.query(AssessmentCandidate).filter(
        AssessmentCandidate.id.in_({a.candidate_id for a in rows})).all()}
    comp: dict[int, dict] = {}
    for aid_, dep, qt in db.query(AssessmentItem.assessment_id, AssessmentItem.department,
                                  AssessmentItem.qtype).filter(AssessmentItem.assessment_id.in_(ids)).all():
        c = comp.setdefault(aid_, {"departments": {}, "types": {}, "total": 0})
        c["departments"][dep] = c["departments"].get(dep, 0) + 1
        c["types"][qt] = c["types"].get(qt, 0) + 1
        c["total"] += 1
    emps = _photo_emps(db)
    return {"total": rules.TOTAL, "rows": [{
        "id": a.id, "ticket_no": a.ticket_no, "status": a.status, "held_on": _iso(a.held_on),
        "created_at": _iso(a.created_at), "created_by": a.created_by,
        "candidate": _cand_dict(cands.get(a.candidate_id), emps),
        **comp.get(a.id, {"departments": {}, "types": {}, "total": 0}),
    } for a in rows]}


@router.get("/tickets/{aid}")
def get_ticket(aid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """One ticket whole: its questions in the sitting's order, each with its
    department, type and expected answer (as copied at the draw). Admins only."""
    _require_admin(db, payload)
    a = _get(db, aid)
    c = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == a.candidate_id).first()
    return {
        "id": a.id, "ticket_no": a.ticket_no, "status": a.status, "held_on": _iso(a.held_on),
        "created_at": _iso(a.created_at), "created_by": a.created_by,
        "candidate": _cand_dict(c, _photo_emps(db)),
        "items": [_item_dict(i) for i in _items(db, aid)],
    }


# ── «Materiallar» — what a candidate prepares from (admins) ───────────────────
# A table of files beside the bank (2026-11-21, the operator: «another table in
# which I can upload the materials for candidates to prepare»). Every file is
# one row: a title, the department it belongs to (or none — «Umumiy») and an
# optional note. The file itself goes the way every attachment on the platform
# goes — into the archive channel (`relay_uploads`), streamed back as a
# download, or put into the caller's own Telegram chat, from where it is
# forwarded to a candidate. No candidate-facing view exists.
#
# The bot API hands back no file over 20 MB, so a bigger one (up to
# `rules.MAX_MATERIAL_MB`) is stored in PIECES: the browser cuts it and sends
# the pieces one request each (`POST /materials/parts`), then completes the
# upload (`POST /materials/complete`) — only then does the row exist. Such a
# file is downloaded as its pieces in order and is never sent by the bot.
#
# A material may also be a LINK (`POST /materials/link`): a video or a file
# kept on a drive, however large. Nothing is stored but the address; it is
# opened in the browser and the bot sends it as a message.

MAX_MATERIAL_FILES = 10   # one request; `relay_uploads` holds the same line


def _m_dict(m: AssessmentMaterial) -> dict:
    """`url`: a link material's address (None for a file). `sendable`: the bot
    can put it into a chat — a link, or a file kept as ONE archive document.
    A file kept in pieces is downloaded in a browser only."""
    return {"id": m.id, "department": m.department or rules.GENERAL, "title": m.title,
            "note": m.note, "name": m.name, "mime": m.mime, "size": m.size,
            "url": m.url, "sendable": bool(m.file_id or m.url),
            "created_at": _iso(m.created_at), "created_by": m.created_by,
            "updated_at": _iso(m.updated_at), "updated_by": m.updated_by}


_UPLOAD_KEY = re.compile(r"^[0-9a-f]{32}$")


def _upload_key(value) -> str:
    """The browser's key for one upload in pieces — 32 hex digits it made up."""
    key = str(value or "").replace("-", "").lower()
    if not _UPLOAD_KEY.match(key):
        _refuse(400, "bad_upload", "Unknown upload.")
    return key


def _material(db: Session, mid: int) -> AssessmentMaterial:
    m = db.query(AssessmentMaterial).filter(AssessmentMaterial.id == mid).first()
    if not m:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Material not found."})
    return m


def _m_department(value) -> Optional[str]:
    try:
        return rules.material_department(value)
    except ValueError:
        _refuse(400, "bad_department", "Unknown department.")


@router.get("/materials")
def list_materials(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Every preparation material, newest first. Admins only, like the bank."""
    _require_admin(db, payload)
    rows = db.query(AssessmentMaterial).order_by(AssessmentMaterial.id.desc()).all()
    return {"rows": [_m_dict(m) for m in rows], "meta": rules.meta()}


@router.post("/materials")
def add_materials(parsed: dict = Depends(appeal_body), db: Session = Depends(get_db),
                  payload: dict = Depends(PAGE)):
    """Upload materials — every file of the multipart body is one row, under
    the `department` and `note` sent with it. A `title` is taken only when
    exactly ONE file is sent (it could name no file in particular otherwise);
    a file with none is called by its own name. Every file is checked and
    stored BEFORE any row is written, so a refused file adds nothing."""
    _require_admin(db, payload)
    fields = parsed.get("fields") or {}
    uploads = list(parsed.get("files") or [])
    if not uploads:
        _refuse(400, "file_required", "Attach at least one file.")
    if len(uploads) > MAX_MATERIAL_FILES:
        _refuse(400, "too_many_files", f"At most {MAX_MATERIAL_FILES} files at once.")
    dept = _m_department(fields.get("department"))
    note = _clean(fields.get("note"), rules.MAX_MATERIAL_NOTE) or None
    title = _clean(fields.get("title"), rules.MAX_MATERIAL_TITLE)
    if title and len(uploads) > 1:
        _refuse(400, "title_one", "A title goes with one file at a time.")
    try:
        stored = relay_uploads(uploads)
    except HTTPException as e:
        # `relay_uploads` words its refusals in English for a chat; here each
        # becomes a code the page words in the reader's language.
        code = {413: "file_too_big", 502: "store_failed"}.get(e.status_code, "bad_file")
        _refuse(e.status_code, code, str(e.detail))
    rows = [AssessmentMaterial(department=dept, title=rules.material_title(title, f["name"]),
                               note=note, name=f["name"], mime=f["mime"], size=f["size"],
                               file_id=f["file_id"], tg_message_id=f["message_id"],
                               created_by=_who(payload)) for f in stored]
    db.add_all(rows)
    db.commit()
    action_log.enrich(target_kind="assessment_material",
                      target_id=str(rows[0].id) if len(rows) == 1 else None,
                      target_name=rows[0].title if len(rows) == 1 else None,
                      details=[("department", dept or rules.GENERAL), ("added", len(rows)),
                               ("files", ", ".join(m.name for m in rows))])
    return {"added": len(rows), "rows": [_m_dict(m) for m in rows]}


@router.post("/materials/parts")
def add_material_part(parsed: dict = Depends(appeal_body), db: Session = Depends(get_db),
                      payload: dict = Depends(PAGE)):
    """One piece of a file too big for a single archive document: `upload` (the
    browser's key for this upload), `seq` (1 … n), `name` (the file's own) and
    the bytes. Stored in the archive channel at once; sending a piece again
    replaces it, so a retry after a lost answer is safe. The material itself
    appears only when the upload is completed."""
    _require_admin(db, payload)
    fields = parsed.get("fields") or {}
    uploads = list(parsed.get("files") or [])
    key = _upload_key(fields.get("upload"))
    try:
        seq = int(fields.get("seq"))
    except (TypeError, ValueError):
        seq = 0
    most = rules.material_part_count(rules.MAX_MATERIAL_MB * 1024 * 1024)
    if not 1 <= seq <= most or len(uploads) != 1:
        _refuse(400, "bad_part", "A piece is one file with its number.")
    up = uploads[0]
    up.file.seek(0)
    data = up.file.read(rules.MATERIAL_PART_BYTES + 1)
    if not data or len(data) > rules.MATERIAL_PART_BYTES:
        _refuse(400, "bad_part", "A piece is empty or too large.")
    row = db.query(AssessmentMaterialPart).filter(
        AssessmentMaterialPart.upload == key, AssessmentMaterialPart.seq == seq).first()
    if row is not None and row.material_id is not None:
        _refuse(409, "upload_done", "This upload is already complete.")
    name = leader_appeal_chat.safe_name(fields.get("name"))
    got = leader_appeal_chat.relay_file(data, f"{name[:100]}.part{seq:03d}")
    if not got:
        _refuse(502, "store_failed", "The piece could not be stored — send it again.")
    if row is None:
        row = AssessmentMaterialPart(upload=key, seq=seq, size=0, file_id="")
        db.add(row)
    row.size, row.file_id, row.tg_message_id, row.created_by = len(data), got[0], got[1], _who(payload)
    try:
        db.commit()
    except IntegrityError:        # the same piece sent twice at once: the other one stands
        db.rollback()
    return {"seq": seq, "size": len(data)}


@router.post("/materials/complete")
def complete_material(body: dict = Body(...), db: Session = Depends(get_db),
                      payload: dict = Depends(PAGE)):
    """Turn an upload in pieces into a material: `upload`, the file's `name`
    and `size`, and the `department` / `title` / `note` a one-request upload
    takes. Refused until the stored pieces are exactly the file — every piece
    present and full, the last one the remainder (409 `upload_incomplete` +
    `missing`), so a material can never be listed with a hole in it."""
    _require_admin(db, payload)
    key = _upload_key(body.get("upload"))
    try:
        size = int(body.get("size"))
    except (TypeError, ValueError):
        size = 0
    if size <= 0:
        _refuse(400, "bad_file", "The file is empty.")
    if size > rules.MAX_MATERIAL_MB * 1024 * 1024:
        _refuse(413, "file_too_big", f"The file is larger than {rules.MAX_MATERIAL_MB} MB.")
    dept = _m_department(body.get("department"))
    name = leader_appeal_chat.safe_name(body.get("name"))
    parts = (db.query(AssessmentMaterialPart)
             .filter(AssessmentMaterialPart.upload == key).order_by(AssessmentMaterialPart.seq).all())
    if any(p.material_id is not None for p in parts):
        _refuse(409, "upload_done", "This upload is already complete.")
    missing = rules.material_parts_missing(size, [(p.seq, p.size) for p in parts])
    if missing is None or missing:
        _refuse(409, "upload_incomplete", "Some pieces of the file did not arrive.", missing=missing or [])
    m = AssessmentMaterial(department=dept, title=rules.material_title(_clean(body.get("title"), rules.MAX_MATERIAL_TITLE), name),
                           note=_clean(body.get("note"), rules.MAX_MATERIAL_NOTE) or None,
                           name=name, mime=mimetypes.guess_type(name)[0] or "application/octet-stream",
                           size=size, file_id="", created_by=_who(payload))
    db.add(m)
    db.flush()
    for p in parts:
        p.material_id = m.id
    # Pieces of uploads nobody completed — a closed tab, a lost connection.
    db.query(AssessmentMaterialPart).filter(
        AssessmentMaterialPart.material_id.is_(None),
        AssessmentMaterialPart.created_at < _now() - timedelta(days=1)).delete(synchronize_session=False)
    db.commit()
    action_log.enrich(target_kind="assessment_material", target_id=str(m.id), target_name=m.title,
                      details=[("department", dept or rules.GENERAL), ("added", 1), ("files", m.name),
                               ("size", size), ("parts", len(parts))])
    return _m_dict(m)


def _m_url(value) -> tuple[str, str]:
    try:
        return rules.material_url(value)
    except ValueError:
        _refuse(400, "bad_url", "This is not a web link.")


@router.post("/materials/link")
def add_material_link(body: dict = Body(...), db: Session = Depends(get_db),
                      payload: dict = Depends(PAGE)):
    """A material that is a LINK — a video or a file kept on a drive: `url`
    (http / https), a `title` (required: a link has no name of its own to fall
    back on), and the `department` / `note` a file takes. Nothing is fetched
    or stored but the address."""
    _require_admin(db, payload)
    url, host = _m_url(body.get("url"))
    title = _clean(body.get("title"), rules.MAX_MATERIAL_TITLE)
    if not title:
        _refuse(400, "title_required", "The material needs a title.")
    dept = _m_department(body.get("department"))
    m = AssessmentMaterial(department=dept, title=" ".join(title.split()),
                           note=_clean(body.get("note"), rules.MAX_MATERIAL_NOTE) or None,
                           name=host[:255], url=url, file_id="", created_by=_who(payload))
    db.add(m)
    db.commit()
    action_log.enrich(target_kind="assessment_material", target_id=str(m.id), target_name=m.title,
                      details=[("department", dept or rules.GENERAL), ("added", 1), ("link", host)])
    return _m_dict(m)


@router.put("/materials/{mid}")
def edit_material(mid: int, body: dict = Body(...), db: Session = Depends(get_db),
                  payload: dict = Depends(PAGE)):
    """Rename a material, move it to another department, rewrite its note. A
    file itself is never replaced — a new version is a new upload; a LINK's
    address may be changed (`url`), and only a link has one."""
    _require_admin(db, payload)
    m = _material(db, mid)
    dept = _m_department(body["department"]) if "department" in body else m.department
    title = _clean(body.get("title", m.title), rules.MAX_MATERIAL_TITLE)
    if not title:
        _refuse(400, "title_required", "The material needs a title.")
    note = (_clean(body["note"], rules.MAX_MATERIAL_NOTE) or None) if "note" in body else m.note
    url, name = m.url, m.name
    if "url" in body and body["url"] != m.url:
        if not m.url:
            _refuse(400, "not_a_link", "A file's link cannot be set — add the link as a material of its own.")
        url, name = _m_url(body["url"])
        name = name[:255]
    changes = [(f, o, n) for f, o, n in (("department", m.department or rules.GENERAL, dept or rules.GENERAL),
                                         ("title", m.title, title), ("note", m.note, note),
                                         ("link", m.url, url)) if o != n]
    m.department, m.title, m.note, m.url, m.name = dept, title, note, url, name
    if changes:
        m.updated_at, m.updated_by = _now(), _who(payload)
    db.commit()
    action_log.enrich(target_kind="assessment_material", target_id=str(m.id), target_name=m.title,
                      changes=changes)
    return _m_dict(m)


@router.delete("/materials/{mid}")
def delete_material(mid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Take a material off the list (its pieces go with it — ON DELETE
    CASCADE). Its copy in the archive channel stays where every archived file
    stays; nothing here points at it any more."""
    _require_admin(db, payload)
    m = _material(db, mid)
    was = {"target_id": str(m.id), "target_name": m.title,
           "details": [("department", m.department or rules.GENERAL), ("file", m.name), ("size", m.size)]}
    db.delete(m)
    db.commit()
    action_log.enrich(target_kind="assessment_material", **was)
    return {"ok": True}


@router.get("/materials/{mid}/file")
def material_file(mid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The file itself, always as a DOWNLOAD behind `nosniff` — an uploaded
    page or SVG must never run in our own origin. One archive document, or the
    pieces of a file too big to be one, in order."""
    _require_admin(db, payload)
    m = _material(db, mid)
    if m.url:
        _refuse(409, "is_link", "This material is a link — open it instead.")
    from app.routers.leader_tasks import _stream_tg_file, _stream_tg_parts
    mime = m.mime or "application/octet-stream"
    if not m.file_id:        # kept in pieces: the same bytes, stitched in order
        ids = [fid for (fid,) in db.query(AssessmentMaterialPart.file_id)
               .filter(AssessmentMaterialPart.material_id == m.id)
               .order_by(AssessmentMaterialPart.seq).all()]
        if not ids:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "File not found."})
        return _stream_tg_parts(ids, name=m.name, mime=mime, size=m.size)
    return _stream_tg_file(m.file_id, name=m.name, mime=mime, download=True)


@router.post("/materials/{mid}/send")
def send_material(mid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Put the file into the caller's own Telegram chat, under its title and
    note — a mini app's WebView has no downloads folder, and a chat is where a
    file is forwarded to a candidate from. A link material goes as a message:
    its title, its note, the address."""
    _require_admin(db, payload)
    m = _material(db, mid)
    if not m.file_id and not m.url:
        _refuse(409, "too_big_to_send", "The bot cannot send a file this large — download it in a browser.")
    tid = _tg(payload)
    if not tid:
        _refuse(400, "no_chat", "No Telegram chat to send to.")
    caption = m.title if not m.note else f"{m.title}\n\n{m.note}"
    try:
        from app.telegram_bot import bot
        if m.url:        # a link: one message, the address on its own last line
            bot.send_message(tid, f"{caption[:1500]}\n\n{m.url}")
        else:
            bot.send_document(tid, m.file_id, caption=caption[:1024])
    except Exception:
        _refuse(502, "send_failed", "Telegram did not accept the file — open the bot and try again.")
    action_log.enrich(target_kind="assessment_material", target_id=str(m.id), target_name=m.title)
    return {"ok": True}


@router.get("/assessments/{aid}")
def get_assessment(aid: int, seat: Optional[str] = Query(default=None),
                   db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The grading dashboard, whole: the candidate, the 20 questions, every
    seat's progress, the viewer's own scorecard, and — unless the viewer still
    holds an unsubmitted seat — the submitted results."""
    a = _get(db, aid)
    me = _judge_key(db, payload)
    admin = _is_admin(db, payload)
    c = db.query(AssessmentCandidate).filter(AssessmentCandidate.id == a.candidate_id).first()
    items = _items(db, aid)
    evs = db.query(JudgeEvaluation).filter(JudgeEvaluation.assessment_id == aid).all()
    grades = _grades_of(db, [e.id for e in evs])
    mine = _pick_mine(evs, me, seat)
    mine_all = _mine_all(evs, me)
    test = _is_test(db, aid)
    hidden = _hidden(evs, me, mine if test else None)
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
        "id": a.id, "ticket_no": a.ticket_no, "status": a.status, "held_on": _iso(a.held_on),
        "created_at": _iso(a.created_at), "created_by": a.created_by,
        "closed_at": _iso(a.closed_at), "closed_by": a.closed_by,
        "candidate": _cand_dict(c, _photo_emps(db)),
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
            # One person may hold several seats (2026-11-23), so a free seat
            # may always be taken. `multi_seat` is read by a tab opened before
            # that day, which would otherwise offer to MOVE its seat.
            "multi_seat": True,
            "claim": is_open and len(taken) < len(rules.DEPARTMENTS),
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
    """Sit on a department's free seat. One person may hold several seats of a
    sitting (the operator, 2026-11-23) — each one more scorecard of theirs,
    graded and submitted by itself; taking a seat never touches the ones
    already held, submitted or not. A seat is given up by releasing it."""
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
    # The first seat sits under the person's own key, every further one under
    # a per-seat key — so `uq_assessment_eval_judge` still holds.
    key = f"{me}#{dept}" if _mine_all(evs, me) else me
    try:
        db.add(JudgeEvaluation(assessment_id=aid, department=dept, judge_key=key,
                               judge_name=payload.get("full_name"), judge_tg=_tg(payload)))
        db.commit()
    except IntegrityError:
        db.rollback()
        _refuse(409, "seat_taken", "Another judge took this seat a moment ago.")
    action_log.enrich(target_kind="assessment", target_id=str(aid), details=[("seat", dept)])
    return {"ok": True, "seat": dept}


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
    if not _is_mine(ev, _judge_key(db, payload)) and not _is_admin(db, payload):
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
    """The viewer's scorecard to write to — on `seat` when given (they may hold
    several), else their first open one."""
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
    _require_admin(db, payload)
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
    _require_admin(db, payload)
    a = _get(db, aid, lock=True)
    if a.status != "open":
        _refuse(409, "closed", "This assessment is closed.")
    if _has_work(db, aid):
        _refuse(409, "has_grades", "Judges have already started grading.")
    db.query(AssessmentItem).filter(AssessmentItem.assessment_id == aid).delete(synchronize_session=False)
    db.flush()
    n = _draw_into(db, a)
    db.commit()
    action_log.enrich(target_kind="assessment", target_id=str(aid),
                      details=[("ticket", a.ticket_no), ("questions", n)])
    return {"ok": True, "ticket_no": a.ticket_no}


@router.delete("/assessments/{aid}")
def delete_assessment(aid: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Delete a sitting opened by mistake — only while nothing was graded,
    except a TEST sitting (drawn from sample questions), whose grades are test
    grades: it goes at any time, scorecards and grades with it (the operator,
    2026-10-31). A candidate left with no sitting goes too."""
    _require_admin(db, payload)
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
