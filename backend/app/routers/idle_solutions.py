"""«Kutish yechimlari» — which waiting causes hurt most, who answers for each,
and what they intend to do about it (`/idle-solutions`, beside /downtime).

Nothing is measured here. The minutes are `routers/downtime._downtime`'s own
answer (the page's one computation, headcount-weighted mean per brigadir-day,
stopped half), summed per category over the period; the owner of a category is
`services/idle_scope` (the «Kutish mas'uli» register); this module adds ONE new
fact — the solutions the owners write — in `idle_category_solutions`.

**Who may write.** The person assigned to the category, and admins. Reading
follows `/downtime` (page key `downtime`), including a «Kutish mas'uli»'s own
category lock, applied through the same `idle_scope` calls.

A solution is a small log entry (open → doing → done), never a rewrite of the
previous one, so the history of what was promised stays readable.
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import IdleCategorySolution
from app.permissions import require_page
from app.services import action_log, idle_scope

router = APIRouter(prefix="/api/idle-solutions", tags=["idle-solutions"])

STATUSES = ("open", "doing", "done")
MAX_DAYS = 124
MAX_TEXT = 2000
SHOW_LAST = 30          # solutions served per category, newest first
TOP_UNITS = 5
MAX_NOTES = 8           # brigadir comments served per problem, newest first
MAX_EVENTS = 100        # filed stops served per (category, brigadir), newest first


def _state(rows) -> str:
    """none → no solution yet; else the least finished one wins (open, doing, done)."""
    if not rows:
        return "none"
    st = {r.status for r in rows}
    for s in ("open", "doing"):
        if s in st:
            return s
    return "done"


def _admin_only(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _fmt_dt(v):
    return v.isoformat() if v else None


def _item(r: IdleCategorySolution) -> dict:
    return {
        "id": r.id, "category": r.category, "manager_id": r.manager_id, "event_id": r.event_id, "text": r.text, "status": r.status,
        "author_key": r.author_key, "author_name": r.author_name,
        "created_at": _fmt_dt(r.created_at), "updated_at": _fmt_dt(r.updated_at),
    }


def _may_write(db: Session, payload: dict, category: str) -> bool:
    if payload.get("role") == "admin":
        return True
    viewer = identity.viewer_profile_key(db, payload)
    owner = idle_scope.owners(db).get(category)
    return bool(viewer and owner and viewer == owner)


@router.get("/analysis")
def analysis(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime")),
):
    _admin_only(payload)
    # Lazy: the downtime router is a sibling router, not a service.
    from app.routers.downtime import _downtime

    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from is after date_to")
    if (date_to - date_from).days + 1 > MAX_DAYS:
        raise HTTPException(status_code=400, detail=f"Period longer than {MAX_DAYS} days")

    out = _downtime(db, payload, date_from, date_to, shift, manager_id, False, factory)
    lock = idle_scope.viewer_categories(db, payload)
    out = idle_scope.narrow_downtime(out, idle_scope.resolve_cats(db, payload, []), lock=lock)

    cat_min: dict[str, float] = {}
    cat_days: dict[str, set] = {}
    cat_units: dict[str, dict[int, float]] = {}
    unit_cat: dict[int, dict[str, float]] = {}
    unit_name: dict[int, dict] = {}
    for r in out.get("rows") or []:
        mid = r.get("manager_id")
        unit_name[mid] = {"manager_id": mid, "manager_name": r.get("manager_name"),
                          "shift": r.get("shift")}
        for c, v in (r.get("by_category") or {}).items():
            v = float(v or 0)
            if v <= 0:
                continue
            cat_min[c] = cat_min.get(c, 0.0) + v
            cat_days.setdefault(c, set()).add(r.get("date"))
            cat_units.setdefault(c, {})
            cat_units[c][mid] = cat_units[c].get(mid, 0.0) + v
            unit_cat.setdefault(mid, {})
            unit_cat[mid][c] = unit_cat[mid].get(c, 0.0) + v

    # The brigadirs' own words: the note on every filed stop (/idle-cell),
    # per (category, unit). Read through the bar modal's own reader so the
    # comment shown here is the very row /downtime lists.
    from app.routers.downtime import _cell_detail
    notes: dict[tuple, list] = {}
    for mid in list(unit_name):
        try:
            det = _cell_detail(db, mid, date_from, date_to, True, False, [])
        except Exception:
            continue
        for d, cells_ in (det.get("days") or {}).items():
            for cell in cells_:
                for iv in cell.get("intervals") or []:
                    note = (iv.get("note") or "").strip()
                    notes.setdefault((iv["category"], mid), []).append({
                        "id": iv.get("id"),
                        "date": d, "cell": cell.get("code"), "leader": cell.get("leader"),
                        "start": iv.get("start"), "end": iv.get("end"),
                        "minutes": iv.get("minutes"), "note": note,
                    })
    for lst in notes.values():
        lst.sort(key=lambda n: (n["date"], n["start"] or ""), reverse=True)

    labels = idle_scope.owner_labels(db)
    viewer = identity.viewer_profile_key(db, payload)
    is_admin = payload.get("role") == "admin"
    owner_keys = idle_scope.owners(db)

    sols: dict[str, list] = {}
    for r in (db.query(IdleCategorySolution)
              .order_by(IdleCategorySolution.created_at.desc(),
                        IdleCategorySolution.id.desc()).all()):
        sols.setdefault(r.category, []).append(r)

    total = sum(cat_min.values())
    cats = [c for c in idle_scope.CATEGORIES if lock is None or c in set(lock)]
    rows = []
    for c in cats:
        items = sols.get(c, [])
        ranked = sorted(cat_units.get(c, {}).items(), key=lambda kv: -kv[1])
        top = ranked[:TOP_UNITS]
        general = [i for i in items if i.manager_id is None]
        per_unit: dict[int, list] = {}
        per_event: dict[int, list] = {}
        for i in items:
            if i.event_id is not None:
                per_event.setdefault(i.event_id, []).append(i)
            elif i.manager_id is not None:
                per_unit.setdefault(i.manager_id, []).append(i)
        cat_total = cat_min.get(c, 0.0)
        problems = []
        for m, v in ranked:
            sl = per_unit.get(m, [])
            nt = notes.get((c, m), [])
            events = []
            for n in nt[:MAX_EVENTS]:
                es = per_event.get(n["id"], [])
                events.append({**n, "solutions": [_item(i) for i in es],
                               "state": _state(es)})
            solved = sum(1 for e in events if e["solutions"])
            all_sl = [i for e in events for i in per_event.get(e["id"], [])] + sl
            problems.append({
                **unit_name[m], "minutes": round(v, 1),
                "share": round(100 * v / cat_total, 1) if cat_total else 0.0,
                "days": len({n["date"] for n in nt}) if nt else None,
                "events": events, "events_n": len(nt), "solved_n": solved,
                "notes": [e for e in events if e["note"]][:MAX_NOTES],
                "notes_n": sum(1 for e in events if e["note"]),
                "solutions": [_item(i) for i in sl],
                "state": _state(all_sl),
            })
        mins = round(cat_min.get(c, 0.0), 1)
        rows.append({
            "category": c,
            "minutes": mins,
            "share": round(100 * cat_min.get(c, 0.0) / total, 1) if total else 0.0,
            "days": len(cat_days.get(c, ())),
            "units_n": len(cat_units.get(c, {})),
            "top_units": [{**unit_name[m], "minutes": round(v, 1)} for m, v in top],
            "owner": labels.get(c),
            "owner_key": owner_keys.get(c),
            "can_write": is_admin or bool(viewer and owner_keys.get(c) == viewer),
            "problems": problems,
            "problems_n": sum(max(p["events_n"], 1) for p in problems),
            "solved_n": sum(p["solved_n"] for p in problems),
            "solutions": [_item(i) for i in general[:SHOW_LAST]],
            "solutions_n": len(items),
            "state": (items[0].status if items else "none"),
            "open_n": sum(1 for i in items if i.status != "done"),
        })
    rows.sort(key=lambda r: (-r["minutes"], r["category"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i if r["minutes"] > 0 else None

    units = []
    for mid, cs in unit_cat.items():
        t = sum(cs.values())
        units.append({
            **unit_name[mid], "total": round(t, 1),
            "top": [{"category": c, "minutes": round(v, 1)}
                    for c, v in sorted(cs.items(), key=lambda kv: -kv[1])[:3]],
        })
    units.sort(key=lambda u: -u["total"])

    return {
        "date_from": date_from.isoformat(), "date_to": date_to.isoformat(),
        "total": round(total, 1),
        "categories": rows, "units": units,
        "no_owner_n": sum(1 for r in rows if r["minutes"] > 0 and not r["owner"]),
        "no_solution_n": sum(r["problems_n"] - r["solved_n"] for r in rows),
        "problems_n": sum(r["problems_n"] for r in rows),
        "cat_locked": lock,
        "is_admin": is_admin,
    }


class SolutionBody(BaseModel):
    category: str
    text: str
    status: Optional[str] = "open"
    manager_id: Optional[int] = None
    event_id: Optional[int] = None


class SolutionEdit(BaseModel):
    text: Optional[str] = None
    status: Optional[str] = None


def _clean_text(text: Optional[str]) -> str:
    t = (text or "").strip()
    if not t:
        raise HTTPException(status_code=400, detail="text_required")
    if len(t) > MAX_TEXT:
        raise HTTPException(status_code=400, detail="text_too_long")
    return t


def _clean_status(s: Optional[str]) -> str:
    if s not in STATUSES:
        raise HTTPException(status_code=400, detail="bad_status")
    return s


@router.post("")
def add_solution(
    body: SolutionBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime")),
):
    _admin_only(payload)
    if body.category not in idle_scope.CATEGORIES:
        raise HTTPException(status_code=400, detail="unknown_category")
    if not _may_write(db, payload, body.category):
        raise HTTPException(status_code=403, detail="not_category_owner")
    text = _clean_text(body.text)
    status = _clean_status(body.status or "open")
    key = identity.viewer_profile_key(db, payload)
    name = (idle_scope._profile_names(db, [key]).get(key) or {}).get("name") if key else None
    row = IdleCategorySolution(
        category=body.category, manager_id=body.manager_id, event_id=body.event_id, text=text, status=status,
        author_key=key,
        author_name=name or payload.get("full_name") or payload.get("name"))
    db.add(row)
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=body.category,
                      details=[("category", body.category), ("manager_id", body.manager_id), ("event_id", body.event_id),
                               ("status", status)])
    return _item(row)


@router.put("/{solution_id}")
def edit_solution(
    solution_id: int,
    body: SolutionEdit,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime")),
):
    _admin_only(payload)
    row = db.query(IdleCategorySolution).filter(IdleCategorySolution.id == solution_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    if not _may_write(db, payload, row.category):
        raise HTTPException(status_code=403, detail="not_category_owner")
    changes = []
    if body.text is not None:
        t = _clean_text(body.text)
        if t != row.text:
            changes.append(("text", "…", "…"))
            row.text = t
    if body.status is not None:
        s = _clean_status(body.status)
        if s != row.status:
            changes.append(("status", row.status, s))
            row.status = s
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=row.category,
                      details=[("category", row.category)], changes=changes)
    return _item(row)
