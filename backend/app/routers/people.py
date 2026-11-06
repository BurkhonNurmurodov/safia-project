"""«Xodim kartasi» (/people, /people/:employee_id) — one person of the plant.

Page key `people` (Laboratory): admin-only until the operator opens it on the
Access tab. When it is opened the reach follows the platform's locks
(`_scope`): admin / top-manager / a page grant at "all" read everybody, a
supervisor the people of their own unit, a shift-manager their shift ∩ plant,
a leader the people standing in the cells they run or own; anybody else 403.
A person outside the viewer's reach is a 404, never a blank card.

Everything is read through the module that owns it (services/people.py says
which). The card's ONE register is the honours (`employee_honours`): an admin
or the person's own brigadir adds and removes, everybody who may open the card
reads.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.capabilities import page_scope_is_all
from app.database import get_db
from app.identity import viewer_leader_profile_ids, viewer_profile_key
from app.models import Cell, EmployeeHonour, Manager
from app.permissions import page_allowed, require_page
from app.services import action_log, people, shift_scope
from app.services import turnover as tv
from app.services.day_state import confirmed_pairs
from app.services.kept_answer import KeptAnswers
from app.services.live_day import LIVE_FROM

router = APIRouter(prefix="/api/people", tags=["people"])
PAGE = require_page("people")
TZ = ZoneInfo("Asia/Tashkent")

# The per-person fold — every attendance row, document, concern and journal
# line of one person — kept a minute, served up to five while one new build
# runs behind it, never to a viewer who wrote something since. Everything that
# depends on WHO is looking (scope, rights, the assessment rule) is computed
# per request around it.
_KEPT = KeptAnswers("people", ttl=60, stale=300, max_keys=96, writer_waits=True)

MAX_SPAN_DAYS = 400


def _today() -> date:
    return datetime.now(TZ).date()


def _refuse(status: int, code: str, message: str, **params):
    raise HTTPException(status_code=status, detail={"code": code, "message": message, **params})


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


# ── reach ─────────────────────────────────────────────────────────────────────

def _scope(db: Session, payload: dict) -> people.Scope:
    role = payload.get("role")
    if role in ("admin", "top-manager") or page_scope_is_all(db, payload, "people"):
        return people.Scope(all_=True)
    if role == "supervisor":
        return people.Scope(units=[payload.get("role_id")])
    if role == "shift-manager":
        return people.Scope(units=shift_scope.unit_ids(db, payload.get("role_id")))
    if role == "leader":
        pids = viewer_leader_profile_ids(db, payload)
        cells = [cid for (cid,) in db.query(Cell.id).filter(
            or_(Cell.leader_id.in_(pids), Cell.owner_id.in_(pids))).all()] if pids else []
        return people.Scope(cells=cells)
    raise HTTPException(status_code=403, detail="You don't have access to this page")


def _person(db: Session, payload: dict, eid: str):
    dirx = people.directory(db)
    p = dirx["by_id"].get(str(eid))
    if not p:
        _refuse(404, "not_found", "No such person.")
    cmap = tv.cell_map(db)
    cell = people.cell_of(cmap, p)
    if not _scope(db, payload).covers(cell):
        _refuse(404, "not_found", "No such person.")
    return dirx, p, cell


def _cell_out(db: Session, cell: Optional[dict]) -> Optional[dict]:
    if not cell:
        return None
    letter = db.query(Cell.wc_group).filter(Cell.id == cell["id"]).scalar()
    return {"id": cell["id"], "code": cell["code"], "letter": letter,
            "unit_id": cell.get("manager_id"), "unit": cell.get("brigadir"),
            "shift": cell.get("shift"), "leader_id": cell.get("leader_id"),
            "leader": cell.get("leader"), "archived": cell.get("archived")}


# ── search ────────────────────────────────────────────────────────────────────

@router.get("/search")
def search(q: str = Query(default=""), limit: int = Query(default=30, ge=1, le=60),
           db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """People matching `q` (every word of it, Latin or Cyrillic, apostrophes
    ignored) within the viewer's reach — the assessment picker's rule over the
    whole directory, working people first. Fewer than 2 letters answers nothing
    but the directory's size."""
    sc = _scope(db, payload)
    dirx = people.directory(db)
    words = [w for w in people.fold_name(q).split(" ") if w]
    hits = []
    if sum(len(w) for w in words) >= 2:
        cmap = tv.cell_map(db) if not sc.all else None
        for r in dirx["rows"]:
            if not all(w in r["folded"] for w in words):
                continue
            if cmap is not None and not sc.covers(people.cell_of(cmap, r)):
                continue
            hits.append((0 if r["status"] == "W" else 1,
                         0 if r["folded"].startswith(words[0]) else 1, r))
        hits.sort(key=lambda h: (h[0], h[1]))
    return {
        "rows": [{"employee_id": r["employee_id"], "name": r["name"], "job": r["job"],
                  "unit": r["unit"], "code": r["code"], "status": r["status"],
                  "dismissed": _iso(r["dismissed"])} for _, _, r in hits[:limit]],
        "more": len(hits) > limit,
        "directory": people.directory_state(db),
    }


@router.get("/resolve")
def resolve(name: str = Query(..., min_length=2), code: Optional[str] = Query(default=None),
            db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Which person a NAME on another page is — the door every name-only row
    (/staff, /daily, the staffing proof) opens the card through. The name is
    folded to its key; several namesakes are narrowed by the cell the row
    named. One answer opens the card; more are listed, never guessed."""
    sc = _scope(db, payload)
    dirx = people.directory(db)
    key = people.worker_key(name)
    ids = list(dirx["by_key"].get(key, []))
    cmap = tv.cell_map(db)
    rows = [dirx["by_id"][e] for e in ids if sc.covers(people.cell_of(cmap, dirx["by_id"][e]))]
    if code and len(rows) > 1:
        ck = tv.code_key(code)
        narrowed = [r for r in rows if (people.cell_of(cmap, r) or {}).get("code")
                    and tv.code_key(people.cell_of(cmap, r)["code"]) == ck]
        if narrowed:
            rows = narrowed
    rows.sort(key=lambda r: (0 if r["status"] == "W" else 1, r["folded"]))
    return {"rows": [{"employee_id": r["employee_id"], "name": r["name"], "job": r["job"],
                      "unit": r["unit"], "code": r["code"], "status": r["status"],
                      "dismissed": _iso(r["dismissed"])} for r in rows]}


# ── the photo ─────────────────────────────────────────────────────────────────

@router.get("/{eid}/photo")
def photo(eid: str, size: int = Query(default=96, ge=32, le=960),
          db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The person's Verifix identification photo, squared (96) or a view
    (960) — `verifix_explore.photo`, the «Verifix (test)» door, served only
    for a person the viewer may read."""
    from app.services import verifix_explore, verifix_org
    _person(db, payload, eid)
    org, _ = verifix_org.stored(db)
    sha = (((org or {}).get("emps") or {}).get(str(eid)) or {}).get("photo")
    if not sha:
        _refuse(404, "no_photo", "Verifix holds no photo of this person.")
    verifix_explore._allow(sha)
    try:
        data = verifix_explore.photo(db, sha, size)
    except LookupError:
        _refuse(404, "no_photo", "The photo could not be read.")
    except Exception:  # noqa: BLE001 — Verifix unreachable is a 424, never a 502
        _refuse(424, "verifix", "Verifix did not answer.")
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


def _has_photo(db: Session, eid: str) -> bool:
    from app.services import verifix_org
    org, _ = verifix_org.stored(db)
    return bool((((org or {}).get("emps") or {}).get(str(eid)) or {}).get("photo"))


# ── the fold ──────────────────────────────────────────────────────────────────

def _facts(db: Session, eid: str) -> dict:
    """Everything viewer-independent about one person, folded once."""
    from app.services import category_compliance as cc
    dirx = people.directory(db)
    p = dirx["by_id"][eid]
    today = _today()
    cmap = tv.cell_map(db)
    cell = people.cell_of(cmap, p)
    units = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}

    rows, withheld = people.attributed_rows(db, dirx, eid, today)
    lo = min((r.date for r in rows), default=today)
    confirmed = confirmed_pairs(db, lo, today, {r.manager_id for r in rows}) if rows else set()
    days = people.by_day(rows, units, confirmed)
    unit_of_day = {}
    for r in rows:
        unit_of_day.setdefault(r.date, r.manager_id)

    live = people.today_live(db, eid, cell)
    if live:
        ld = date.fromisoformat(live["date"])
        if not (ld in days and days[ld]["closed"]):
            from app.routers.workers import _py_on_leave
            days[ld] = {"date": ld, "rows": [], "came": live["came"],
                        "leave": bool(not live["came"] and _py_on_leave(None, live["mark"])),
                        "hours": live["hours"] or 0.0, "cells": [live["cell"]] if live["cell"] else [],
                        "units": [live["unit"]] if live["unit"] else [], "closed": False,
                        "in": live["in"], "out": live["out"], "mark": live["mark"],
                        "no_out": live["status"] == "no_out", "live": True,
                        "status": live["status"], "read_at": live["read_at"]}
            if live["unit_id"]:
                unit_of_day[ld] = live["unit_id"]

    twins = people.namesakes(dirx, eid)
    place = None
    if twins:
        ddays = sorted(days) or [today]
        place = people._placements(db, dirx, [eid], ddays, today)
    names = sorted(people._att_names(db).get(p["key"], ()))
    docs = people.documents(db, dirx, eid, names, date(2025, 1, 1), today, place)

    def place_fn(d):
        if d is None:
            return None
        got = (place or {}).get((eid, d))
        if got is None and twins:
            got = people._placements(db, dirx, [eid], [d], today).get((eid, d))
        return got

    concerns, c_withheld = people.concerns(db, dirx, eid, place_fn)

    # The category today against the step the tenure expects — THE per-person
    # computation of the compliance KPI, for this one person.
    r = cc.rule(db)
    cat = None
    try:
        judged = cc.person_rows([{"employee_id": eid, "name": p["name"], "status": p["status"],
                                  "hired": p["hired"], "code": p["code"], "job": p["job"]}],
                                cc.events_by_person(db), cc.Ladder(r), r, tv.month_start(today), today)
        if judged:
            cat = cc._person_out(judged[0])
    except Exception:  # noqa: BLE001 — a rule that cannot be read costs the chip
        cat = None

    plan_lo = min(days) if days else today
    own_cells = None
    if twins:
        own_cells = {v for (e, _d), v in (place or {}).items() if e == eid and v}
    plan = people.plan_marks(db, p["key"], plan_lo - timedelta(days=1), today + timedelta(days=1), own_cells)

    schedule = (live or {}).get("schedule")
    if not schedule:
        for r_ in reversed(rows):
            if r_.schedule:
                schedule = r_.schedule
                break

    return {
        "p": p, "cell": cell, "days": days, "unit_of_day": unit_of_day, "docs": docs,
        "concerns": concerns, "career": people.career(db, eid, p), "runs": people.cell_runs(days),
        "category": cat, "plan": plan, "schedule": schedule, "live": live,
        "namesakes": len(twins), "withheld": withheld, "withheld_concerns": c_withheld,
        "first_day": _iso(min(days)) if days else None, "today": today,
    }


def _sum(days: dict, docs: list, a: date, b: date) -> dict:
    listed = came = leave = 0
    hours = 0.0
    for d, x in days.items():
        if not (a <= d <= b) or not (x["closed"] or x.get("live")):
            continue
        listed += 1
        if x["came"]:
            came += 1
            hours += x["hours"] or 0.0
        elif x["leave"]:
            leave += 1
    moves = sum(1 for o in docs if o["kind"] == "people_exchange" and a.isoformat() <= o["date"] <= b.isoformat())
    return {"listed": listed, "came": came, "leave": leave, "absent": listed - came - leave,
            "hours": round(hours, 1),
            "att": round((came + leave) * 100.0 / listed, 1) if listed else None, "moves": moves}


def _tiles(f: dict, a: date, b: date) -> dict:
    span = (b - a).days + 1
    cur = _sum(f["days"], f["docs"], a, b)
    prev = _sum(f["days"], f["docs"], a - timedelta(days=span), a - timedelta(days=1))
    weeks = []
    for i in range(people.SPARK_WEEKS - 1, -1, -1):
        we = b - timedelta(days=7 * i)
        weeks.append(_sum(f["days"], f["docs"], we - timedelta(days=6), we))
    return {"cur": cur, "prev": prev, "weeks": weeks,
            "prev_from": (a - timedelta(days=span)).isoformat(), "prev_to": (a - timedelta(days=1)).isoformat()}


def _day_state(x: Optional[dict], moved: bool) -> Optional[str]:
    if not x:
        return None
    if x.get("live") and x["came"]:
        return "live"
    if x["came"]:
        return "moved" if moved else ("no_out" if x["no_out"] else "came")
    if x["leave"]:
        return "leave"
    m = (x.get("mark") or "").strip()
    if m in ("—", "-", "–"):
        return "off"
    if x.get("live") and x.get("status") in ("not_yet", "off"):
        return x["status"]
    return "absent"


def _day_out(f: dict, d: date, moves_by_day: dict) -> Optional[dict]:
    x = f["days"].get(d)
    mv = moves_by_day.get(d.isoformat(), [])
    if not x and not mv:
        return None
    plan = f["plan"].get(d)
    out = {"date": d.isoformat(), "state": _day_state(x, bool(mv)), "plan": plan,
           "moves": [{"to_unit": m["to_unit"], "to_unit_id": m["to_unit_id"], "task": m["task"],
                      "at": m["at"], "back": m["back"]} for m in mv]}
    if x:
        out.update({"in": x["in"], "out": x["out"], "hours": x["hours"] if x["came"] else None,
                    "mark": x["mark"], "cells": x["cells"], "units": x["units"],
                    "unit_id": f["unit_of_day"].get(d), "closed": x["closed"],
                    "live": bool(x.get("live")), "no_out": x["no_out"]})
    return out


def _feed(f: dict, assess: list, honours: list) -> list:
    """«Oxirgi voqealar» — one dated feed, newest first, of the last
    `FEED_DAYS`: attendance anomalies (an absence a live day's copy names as
    such, a missing check-out), exchanges and role changes, the HR journals'
    hires / transfers / category changes and dismissals, concerns filed,
    assessments sat and honours given."""
    since = (f["today"] - timedelta(days=people.FEED_DAYS)).isoformat()
    out = []
    for d, x in f["days"].items():
        iso = d.isoformat()
        if iso < since or not (x["closed"] or x.get("live")):
            continue
        unit = f["unit_of_day"].get(d)
        if x["no_out"] and not x.get("live"):
            out.append({"date": iso, "kind": "no_out", "unit_id": unit, "in": x["in"]})
        elif (not x["came"] and not x["leave"] and d >= LIVE_FROM
              and (x.get("mark") or "").strip().upper() in ("X", "Х")):
            out.append({"date": iso, "kind": "absent", "unit_id": unit})
    for o in f["docs"]:
        if o["date"] >= since:
            out.append({"date": o["date"], "kind": o["kind"], "unit_id": o["unit_id"], "unit": o["unit"],
                        "to_unit": o["to_unit"], "task": o["task"], "at": o["at"], "back": o["back"],
                        "new_role": o["new_role"], "source": o["source"]})
    for c in f["career"]:
        if c["date"] >= since:
            out.append({**c, "kind": "career_" + c["kind"]})
    for c in f["concerns"]:
        if (c["date"] or "") >= since:
            out.append({"date": c["date"], "kind": "concern", "id": c["id"], "seq": c["seq"],
                        "code": c["code"], "bucket": c["bucket"]})
    for a in assess:
        if a["date"] >= since:
            out.append({"date": a["date"], "kind": "assessment", "id": a["id"], "status": a["status"]})
    for h in honours:
        if h["date"] >= since:
            out.append({"date": h["date"], "kind": "honour", "title": h["title"], "honour": h["kind"]})
    out.sort(key=lambda e: e["date"], reverse=True)
    return out[:people.FEED_MAX]


def _assessments(db: Session, payload: dict, eid: str) -> Optional[list]:
    """The sittings of this person exactly as /assessment shows them to THIS
    viewer (its own list, its `results_hidden` rule) — None when the viewer may
    not open that page."""
    if not page_allowed(db, payload, "assessment"):
        return None
    from app.routers.assessment import list_assessments
    res = list_assessments(status="all", db=db, payload=payload)
    return [r for r in res.get("rows") or [] if (r.get("candidate") or {}).get("employee_id") == str(eid)]


def _kpi_peek(pids: list[int], today: date) -> Optional[dict]:
    """The «Liderlar KPI» board's rows for this leader's owned cells — ONLY if a
    board of this month is already kept (another viewer opened the page in the
    last five minutes). Never a build: the board is every KPI of the month."""
    if not pids:
        return None
    from app.routers import leaders_kpi as lk
    ym = tv.ym(tv.month_start(today))
    best = None
    for age, _key, val in lk._KEPT.peek():
        if not isinstance(val, dict) or val.get("month") != ym:
            continue
        rows = val.get("rows") or []
        mine = [r for r in rows if r.get("owner_id") in pids]
        if mine and (best is None or len(rows) > best[1]):
            best = (age, len(rows), mine)
    if not best:
        return None
    return {"age_s": round(best[0]), "of": best[1], "month": ym,
            "rows": [{"code": r.get("code"), "total": r.get("total"), "pct": r.get("pct"),
                      "rank": r.get("rank")} for r in best[2]]}


def _rights(payload: dict, cell: Optional[dict]) -> dict:
    role = payload.get("role")
    own_brigadir = role == "supervisor" and cell is not None and cell.get("manager_id") == payload.get("role_id")
    can = role == "admin" or own_brigadir
    return {"honours": can}


@router.get("/{eid}")
def card(eid: str,
         date_from: Optional[date] = Query(default=None),
         date_to: Optional[date] = Query(default=None),
         month: Optional[str] = Query(default=None),
         tab: str = Query(default="overview"),
         db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The card: the hero (+ the period's four tiles) and the asked tab."""
    eid = str(eid)
    dirx, p, cell = _person(db, payload, eid)
    today = _today()
    b = min(date_to or today, today)
    a = date_from or (b - timedelta(days=29))
    if a > b:
        _refuse(422, "range_reversed", "The period ends before it starts.")
    if (b - a).days > MAX_SPAN_DAYS:
        a = b - timedelta(days=MAX_SPAN_DAYS)

    f = _KEPT.get(db, payload, ("card", eid), lambda s: _facts(s, eid))
    honours = people.honours(db, eid)
    tie = people.ties(db, eid)
    lead = bool(tie["leaders"] or tie["units"])
    if tab == "leadership" and not lead:
        tab = "overview"           # a tab this person does not have (an old link)
    hired = p["hired"]
    tenure = None
    if hired:
        end = p["dismissed"] if p["status"] == "D" and p["dismissed"] else today
        tenure = max(0, (end.year - hired.year) * 12 + (end.month - hired.month) - (1 if end.day < hired.day else 0))
    live = f["live"]
    hero = {
        "employee_id": eid, "name": p["name"], "job": p["job"], "status": p["status"],
        "hired": _iso(hired), "dismissed": _iso(p["dismissed"]), "tenure_months": tenure,
        "unit_name": p["unit"], "code": p["code"], "cell": _cell_out(db, cell),
        "category": f["category"], "photo": _has_photo(db, eid),
        "today": live, "schedule": f["schedule"],
        "namesakes": f["namesakes"], "withheld": f["withheld"],
        "first_day": f["first_day"], "live_from": LIVE_FROM.isoformat(),
        "leadership": lead,
    }
    out = {"hero": hero, "period": {"from": a.isoformat(), "to": b.isoformat()},
           "tiles": _tiles(f, a, b), "rights": _rights(payload, cell), "tab": tab,
           "honour_kinds": list(people.HONOUR_KINDS)}

    moves_by_day: dict = {}
    for o in f["docs"]:
        if o["kind"] == "people_exchange":
            moves_by_day.setdefault(o["date"], []).append(o)

    # The period's days, oldest first — the card's day grid beside the tiles.
    # `p` marks a day the tiles do not count yet (not closed, not today's live
    # day), so the grid can say so instead of painting it like a counted one.
    strip = []
    d = a
    while d <= b:
        x = f["days"].get(d)
        one = {"s": _day_state(x, bool(moves_by_day.get(d.isoformat())))}
        if x and not (x["closed"] or x.get("live")):
            one["p"] = 1
        strip.append(one)
        d += timedelta(days=1)
    out["tiles"]["days"] = strip

    if tab == "overview":
        out["feed"] = _feed(f, people.assessments_brief(db, eid), honours)
    elif tab == "attendance":
        try:
            m = tv.parse_month(month) if month else None
        except Exception:  # noqa: BLE001
            m = None
        m = m or tv.month_start(b)
        last = tv.last_day(m)
        grid = []
        d = m
        while d <= last:
            grid.append(_day_out(f, d, moves_by_day) or {"date": d.isoformat(), "state": None,
                                                         "plan": f["plan"].get(d)})
            d += timedelta(days=1)
        rows = []
        d = b
        while d >= a:
            x = _day_out(f, d, moves_by_day)
            if x:
                rows.append(x)
            d -= timedelta(days=1)
        # The month's own figures for the calendar's side panel: the tiles'
        # rule over the month so far, and how many days wear each state.
        counts: dict = {}
        for g in grid:
            if g["date"] > today.isoformat():
                continue
            k = g["state"] or "none"
            counts[k] = counts.get(k, 0) + 1
        out["attendance"] = {"month": tv.ym(m), "grid": grid, "rows": rows,
                             "cells_from": people.CELLS_FROM.isoformat(),
                             "month_sum": _sum(f["days"], f["docs"], m, min(last, today)),
                             "counts": counts,
                             "moved_days": sum(1 for g in grid if g.get("moves"))}
    elif tab == "career":
        out["career"] = {"timeline": f["career"], "runs": f["runs"]}
    elif tab == "honours":
        out["honours"] = {"list": honours, "assessments": _assessments(db, payload, eid)}
    elif tab == "concerns":
        cs = f["concerns"]
        out["concerns"] = {
            "rows": cs, "withheld": f["withheld_concerns"],
            "filed": len(cs), "resolved": sum(1 for c in cs if c["bucket"] == "done"),
            "open": sum(1 for c in cs if c["bucket"] in ("todo", "doing")),
            "uplifted": sum(1 for c in cs if c["bucket"] == "uplifted"),
        }
    elif tab == "leadership":
        pids = [x["id"] for x in tie["leaders"]]
        out["leadership"] = {**tie, "kpi": _kpi_peek(pids, today)}
    return out


# ── honours ───────────────────────────────────────────────────────────────────

@router.post("/{eid}/honours")
def add_honour(eid: str, body: dict = Body(...), db: Session = Depends(get_db),
               payload: dict = Depends(PAGE)):
    """Add an honour — an admin, or the person's own brigadir."""
    eid = str(eid)
    _dirx, p, cell = _person(db, payload, eid)
    if not _rights(payload, cell)["honours"]:
        _refuse(403, "not_allowed", "Only an admin or this person's brigadir can add an honour.")
    title = people.clean_text(body.get("title"), people.TITLE_MAX)
    kind = str(body.get("kind") or "")
    if not title:
        _refuse(400, "title_required", "Write the honour's title.")
    if kind not in people.HONOUR_KINDS:
        _refuse(400, "bad_kind", "Pick the kind of honour.", kinds=list(people.HONOUR_KINDS))
    try:
        given = date.fromisoformat(str(body.get("date") or "")) if body.get("date") else _today()
    except ValueError:
        _refuse(400, "bad_date", "The date is not a date.")
    if given > _today():
        _refuse(400, "future", "An honour cannot be dated in the future.")
    note = people.clean_text(body.get("note"), people.NOTE_MAX) or None
    h = EmployeeHonour(employee_id=eid, title=title, kind=kind, given_on=given,
                       given_by=viewer_profile_key(db, payload),
                       given_by_name=payload.get("full_name"), note=note)
    db.add(h)
    db.commit()
    action_log.enrich(target_kind="employee", target_id=eid, target_name=p["name"], day=given,
                      details=[("title", title), ("kind", kind)])
    return {"id": h.id, "honours": people.honours(db, eid)}


@router.delete("/{eid}/honours/{hid}")
def remove_honour(eid: str, hid: int, db: Session = Depends(get_db),
                  payload: dict = Depends(PAGE)):
    eid = str(eid)
    _dirx, p, cell = _person(db, payload, eid)
    if not _rights(payload, cell)["honours"]:
        _refuse(403, "not_allowed", "Only an admin or this person's brigadir can remove an honour.")
    h = db.query(EmployeeHonour).filter(EmployeeHonour.id == hid,
                                        EmployeeHonour.employee_id == eid).first()
    if not h:
        _refuse(404, "not_found", "No such honour.")
    title, kind, given = h.title, h.kind, h.given_on
    db.delete(h)
    db.commit()
    action_log.enrich(target_kind="employee", target_id=eid, target_name=p["name"], day=given,
                      details=[("title", title), ("kind", kind)])
    return {"honours": people.honours(db, eid)}
