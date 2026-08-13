"""AI proof-review endpoints for the leader monitoring page.

**Admin-only, deliberately.** This is a pilot: every endpoint here is gated by
`verify_admin`, and the page asks for none of them unless the viewer is an
admin — so a supervisor, leader or top-manager sees the page exactly as it was.

Verdicts are read in three shapes:

* `overview` — flag counts per report uid, for the register's row badge. Small
  by design, so it stays cheap over years of reports.
* `report` — every verdict of ONE report, fetched when its detail modal opens.
* `queue` — the triage feed: one flat, severity-ordered list of everything a
  human still has to decide, with the photos, the window and the criteria all
  inlined. This is what makes review a queue instead of a hunt through the
  register, and it is the only read that carries enough to decide without a
  second request.

A verdict now has a TERMINAL state (`resolution`). Before that, "12 suspect"
meant "12 ever" — the admin re-read the same flags every session and the number
only grew. `resolve` is what empties the queue, and `rejected` is the one
decision that changes a score anywhere.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AppSetting, LeaderAiReview, LeaderChecklist, LeaderTaskDay, LeaderTaskDef,
    LeaderTaskEntry, LeaderTaskLeaderSetting, LeaderTaskMedia, LeaderTaskSetting,
    Manager, RoleProfile,
)
from app.routers.admin import verify_admin
from app.services import gemini, leader_ai
from app.services.name_map import relabel_supervisor

router = APIRouter(prefix="/api/leader-ai", tags=["leader-ai"])
log = logging.getLogger(__name__)

# Newest flagged rows resolved into the register's badge map. A cap rather than
# a date filter because the page filters client-side and never tells the server
# its range; newest-first means the badge is always right where anyone is
# actually looking.
FLAG_MAP_CAP = 4000

# How much of the queue one read hands over. The triage screen shows ONE item at
# a time and the rail scrolls, so this is about how far ahead an admin can work
# before a refetch — not about what fits on screen. Generous enough that a day's
# flags always arrive whole; bounded so a first-ever backfill cannot ship
# thousands of rows with their photo lists attached.
QUEUE_CAP = 300


def _bot_uid_map(db: Session, entry_ids: set[int]) -> dict[int, str]:
    """bot entry id → the uid /api/leaders prints for its day."""
    if not entry_ids:
        return {}
    entries = db.query(LeaderTaskEntry).filter(LeaderTaskEntry.id.in_(entry_ids)).all()
    return {e.id: f"bot-{e.day_id}" for e in entries}


def _sheet_uid_map(db: Session, refs: set[str]) -> dict[str, str]:
    """sheet ref → uid. A ref built on a submission id already IS the uid; one
    built on date+leader has to be resolved back to a live row, because the uid
    for those is the (recycled) row id."""
    out: dict[str, str] = {}
    dated = [r for r in refs if r.startswith("sheetd:")]
    for ref in refs:
        if ref.startswith("sheet:"):
            out[ref] = ref.split(":", 2)[1]
    if dated:
        dates = {r.split(":")[1] for r in dated}
        rows = db.query(LeaderChecklist).filter(LeaderChecklist.date.in_(dates)).all()
        by_key = {(r.date, (r.leader or "").strip().lower()[:60]): r for r in rows}
        for ref in dated:
            parts = ref.split(":")
            row = by_key.get((parts[1], parts[2] if len(parts) > 3 else ""))
            if row is not None:
                out[ref] = leader_ai.row_uid(row)
    return out


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Queue state + flag counts per report uid. Only reports that actually
    carry a flag are listed — a clean report contributes nothing to the map."""
    if not gemini.available():
        return {"enabled": False, "counts": {}, "flags": {}}

    # ONLY flagged rows are resolved to uids. The pending queue is a backfill of
    # everything ever filed — tens of thousands of rows — and loading it on
    # every page open would be the most expensive query on the page for a
    # number that `counts` already reports in one aggregate.
    #
    # UNRESOLVED only: once a human has ruled on a flag it stops badging the
    # register. A badge that survives its own decision is a badge that can never
    # reach zero, which is exactly what made the old counter meaningless.
    flagged = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.is_(None))
        .order_by(LeaderAiReview.date.desc())
        .limit(FLAG_MAP_CAP)
        .all()
    )

    bot_uid = _bot_uid_map(
        db, {int(r.ref.split(":")[1]) for r in flagged if r.ref.startswith("bot:")}
    )
    sheet_uid = _sheet_uid_map(
        db, {r.ref for r in flagged if not r.ref.startswith("bot:")}
    )

    flags: dict[str, int] = {}
    for rev in flagged:
        uid = (bot_uid.get(int(rev.ref.split(":")[1]))
               if rev.ref.startswith("bot:") else sheet_uid.get(rev.ref))
        if uid:
            flags[uid] = flags.get(uid, 0) + 1

    return {
        "enabled": True,
        "model": gemini.active_model(),
        "counts": leader_ai.counts(db),
        "flags": flags,
        # Where review begins. Every "why has this old day never been checked"
        # question has this as its answer, and until it shipped in a payload the
        # only place it existed was a settings row nobody can read.
        "floor": leader_ai.floor_date(db),
        "defaultFloor": leader_ai.DEFAULT_FLOOR,
        # How often the human agreed with the machine. For a pilot this is the
        # actual deliverable: at 40% agreement on `not_proven` the criteria text
        # is wrong, not the leaders — and that is a conclusion no amount of
        # reading individual verdicts produces.
        "calibration": _calibration(db),
    }


def _calibration(db: Session) -> dict:
    """Human-vs-machine agreement, overall and per flag type.

    `agreed` = the reviewer confirmed the AI (rejected the proof or asked for a
    new one); `overruled` = the reviewer approved a photo the AI doubted. Only
    RESOLVED rows count — an unread flag is not evidence either way.
    """
    rows = (
        db.query(LeaderAiReview.flags, LeaderAiReview.resolution)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.isnot(None))
        .all()
    )
    per: dict[str, dict[str, int]] = {}
    agreed = 0
    for flags, res in rows:
        hit = res in ("rejected", "requeried")
        agreed += hit
        for f in (flags or ()):
            slot = per.setdefault(f, {"agreed": 0, "total": 0})
            slot["total"] += 1
            slot["agreed"] += hit
    return {
        "resolved": len(rows),
        "agreed": agreed,
        "rate": round(agreed / len(rows) * 100) if rows else None,
        "byFlag": {
            f: {**v, "rate": round(v["agreed"] / v["total"] * 100)}
            for f, v in per.items() if v["total"]
        },
    }


@router.get("/report")
def report(uid: str = Query(...), db: Session = Depends(get_db),
           _: dict = Depends(verify_admin)):
    """Every verdict for one report, keyed by task id — what the detail modal
    renders inside each task card."""
    if not gemini.available():
        return {"enabled": False, "tasks": {}}

    refs = _refs_for_uid(db, uid)
    if not refs:
        return {"enabled": True, "tasks": {}}

    out = {}
    for rev in db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(refs.keys())).all():
        out[str(refs[rev.ref])] = _as_verdict(rev)
    return {"enabled": True, "tasks": out}


# ── the filter dimensions ────────────────────────────────────────────────────
# ONE table, read by both the predicate and the facet pass, so "what a leader
# filter means" cannot come to differ between the rows that survive a filter and
# the options the filter offers. `flag` is multi-valued — a row carries several.
_DIMS = {
    "leader":     lambda rev, p: p["leader"],
    "supervisor": lambda rev, p: p["supervisor"],
    "task":       lambda rev, p: rev.task_id,
    "shift":      lambda rev, p: rev.shift,
    "flag":       lambda rev, p: rev.flags or [],
}


def _dim_ok(dim: str, want, rev, p) -> bool:
    if want is None:
        return True
    got = _DIMS[dim](rev, p)
    return want in got if isinstance(got, list) else got == want


@router.get("/queue")
def queue(limit: int = Query(QUEUE_CAP, ge=1, le=QUEUE_CAP),
          date_from: str | None = Query(None),
          date_to: str | None = Query(None),
          leader: str | None = Query(None),
          supervisor: str | None = Query(None),
          task_id: int | None = Query(None),
          shift: int | None = Query(None),
          flag: str | None = Query(None),
          db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """The triage feed — everything still awaiting a human decision, ordered by
    how much that decision is worth, with enough context inlined to make it.

    One request, no follow-ups: the reviewer's whole job is "look at the photo,
    compare its clock to the window, decide", and every one of those needs to be
    on screen at once. Splitting the criteria or the leader's own answer into a
    second call is what turned the old flow into a hunt.

    **Filtering is server-side, and it has to be.** The page ships at most
    `limit` rows out of a set that can run to thousands, so a filter applied to
    what the browser happens to hold would answer "this leader's flags" with
    "this leader's flags among the ones that fit" — and on an old date it would
    answer "none" for a day with forty. Every dimension is therefore evaluated
    over the whole unresolved set, and the bucket tallies are recomputed inside
    it: a tab reading «333» beside a four-row rail is not a filter, it is a bug.

    `facets` ships the option lists with counts, each dimension tallied against
    every OTHER active filter. Picking a leader narrows the task list to that
    leader's tasks, so no option in the panel is ever a dead end.
    """
    if not gemini.available():
        return {"enabled": False, "items": [], "buckets": {}, "facets": {}}

    q = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.is_(None))
    )
    # `date` is a 'YYYY-MM-DD' string, so a lexical compare IS a date compare —
    # and it narrows BEFORE the scan cap, which is the point: the newest 4 000
    # flags of the chosen days, not the chosen days out of the newest 4 000.
    if date_from:
        q = q.filter(LeaderAiReview.date >= date_from)
    if date_to:
        q = q.filter(LeaderAiReview.date <= date_to)
    rows = (q.order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.desc())
            .limit(FLAG_MAP_CAP).all())

    proj = _project(db, rows)
    picked = {"leader": leader, "supervisor": supervisor,
              "task": task_id, "shift": shift, "flag": flag}

    facets: dict[str, dict] = {d: {} for d in _DIMS}
    task_labels: dict[int, str] = {}
    kept: list[LeaderAiReview] = []
    for rev in rows:
        p = proj[rev.ref]
        task_labels.setdefault(rev.task_id, p["task"])
        ok = {d: _dim_ok(d, picked[d], rev, p) for d in _DIMS}
        misses = [d for d, v in ok.items() if not v]
        if not misses:
            kept.append(rev)
        # A dimension's own options are counted against every other filter but
        # not against itself — otherwise picking «Sevara» would leave the leader
        # list holding only Sevara, and there would be no way back to anyone
        # else without clearing the filter first.
        for d in _DIMS:
            if misses and misses != [d]:
                continue
            got = _DIMS[d](rev, p)
            for v in (got if isinstance(got, list) else [got]):
                if v is None or v == "":
                    continue
                facets[d][v] = facets[d].get(v, 0) + 1

    # Tallies over the FILTERED set — the tabs label the rail beneath them.
    buckets: dict[str, int] = {b: 0 for b in leader_ai.BUCKETS}
    for r in kept:
        buckets[leader_ai.bucket_of(r.flags)] += 1

    page = _fair_slice(kept, limit)

    def _opts(dim: str) -> list[dict]:
        """Busiest first — the option worth picking is the one with the work
        behind it, and an alphabetical list of 90 leaders buries it."""
        items = [{"v": v, "n": n} for v, n in facets[dim].items()]
        items.sort(key=lambda it: (-it["n"], str(it["v"])))
        return items

    return {
        "enabled": True,
        "items": _hydrate(db, page),
        "buckets": buckets,
        "total": len(kept),
        "capped": len(kept) > len(page),
        "facets": {
            **{d: _opts(d) for d in ("leader", "supervisor", "shift", "flag")},
            # The label a task carries can differ per unit (a supervisor may
            # rename it), so the option is keyed by id and labelled with the
            # first wording seen — newest report first.
            "task": [{**o, "label": task_labels.get(o["v"], f"#{o['v']}")}
                     for o in _opts("task")],
        },
        # Said out loud rather than silently truncated: past this many flags the
        # scan itself is capped, so the counts become a floor.
        "scanCapped": len(rows) >= FLAG_MAP_CAP,
    }


def _fair_slice(rows: list[LeaderAiReview], limit: int) -> list[LeaderAiReview]:
    """Trim to `limit` WITHOUT ever emptying a bucket.

    A plain severity sort followed by `rows[:limit]` spends the whole cap on the
    most serious band and hands the tail nothing: with 424 `date` flags against a
    300 cap, `tech` — last by severity — shipped zero items while its tab still
    read "3", because the tallies count the whole unresolved set. A tab that says
    three and then shows an empty queue reads as a broken screen, and the flags it
    hides are the ones nobody can reach by scrolling either.

    So every non-empty bucket is guaranteed an equal floor first, and only the
    REMAINDER is handed out by severity. Order is unchanged — buckets emitted
    most-serious-first, newest report at the head of each band.

    An under-cap list runs the same path rather than short-circuiting: returning
    it untouched would hand back DB order (date desc), and the queue's whole
    premise is that the most expensive decision sits at the top.
    """
    if not rows:
        return []

    by_bucket: dict[str, list[LeaderAiReview]] = {b: [] for b in leader_ai.BUCKETS}
    for r in rows:                       # already newest-first
        by_bucket[leader_ai.bucket_of(r.flags)].append(r)

    live = sorted((b for b in leader_ai.BUCKETS if by_bucket[b]),
                  key=leader_ai.bucket_rank)
    share = limit // len(live)
    taken = {b: by_bucket[b][:share] for b in live}

    spare = limit - sum(len(v) for v in taken.values())
    for b in live:
        if spare <= 0:
            break
        extra = by_bucket[b][len(taken[b]):len(taken[b]) + spare]
        taken[b].extend(extra)
        spare -= len(extra)

    return [r for b in live for r in taken[b]]


# ── the task-config chain ────────────────────────────────────────────────────
# `task_label` and `criteria_for` each walk leader → supervisor → global on
# their own. Called per row that is up to ~1200 queries for one queue read, so
# the same three tables are loaded once and the chain is resolved in memory.
# Same precedence, same answer. Module-level because BOTH the light projection
# (which labels 4 000 rows for the filter facets) and the hydrator (which
# labels a page) need it, and a second copy of a precedence rule is one edit
# away from showing the two surfaces different names for the same task.
_NAMES = ("name_ru", "name_uz", "name_en")


def _first_name(obj) -> str:
    for attr in _NAMES:
        got = getattr(obj, attr, None)
        if got and got.strip():
            return got.strip()
    return ""


def _task_cfg(db: Session, rows: list[LeaderAiReview]) -> tuple[dict, dict, dict]:
    defs = {td.id: td for td in db.query(LeaderTaskDef).all()}
    mgr_ids = {r.manager_id for r in rows if r.manager_id}
    prof_ids = {r.leader_id for r in rows if r.leader_id}
    sup_cfg: dict[tuple[int, int], LeaderTaskSetting] = {}
    if mgr_ids:
        for s in db.query(LeaderTaskSetting).filter(
                LeaderTaskSetting.manager_id.in_(mgr_ids)).all():
            sup_cfg[(s.manager_id, s.task_id)] = s
    own_cfg: dict[tuple[int, int], LeaderTaskLeaderSetting] = {}
    if prof_ids:
        for r in db.query(LeaderTaskLeaderSetting).filter(
                LeaderTaskLeaderSetting.leader_id.in_(prof_ids)).all():
            own_cfg[(r.leader_id, r.task_id)] = r
    return defs, sup_cfg, own_cfg


def _chain(cfg, rev, attr: str) -> str:
    """First non-blank `attr` down leader → supervisor → global."""
    defs, sup_cfg, own_cfg = cfg
    for row, key in ((own_cfg, (rev.leader_id, rev.task_id)),
                     (sup_cfg, (rev.manager_id, rev.task_id))):
        got = getattr(row.get(key), attr, None) if key[0] else None
        if got and str(got).strip():
            return str(got).strip()
    got = getattr(defs.get(rev.task_id), attr, None)
    return str(got).strip() if got and str(got).strip() else ""


def _label(cfg, rev) -> str:
    """LEVEL first, then language — the same precedence services/leader_ai
    `task_label` uses. Walking language-first would let the global `name_ru`
    beat a supervisor's own `name_uz` override, i.e. show the reviewer a
    wording nobody in that unit ever read."""
    defs, sup_cfg, own_cfg = cfg
    for c, key in ((own_cfg, (rev.leader_id, rev.task_id)),
                   (sup_cfg, (rev.manager_id, rev.task_id))):
        obj = c.get(key) if key[0] else None
        if obj is not None and (got := _first_name(obj)):
            return got
    td = defs.get(rev.task_id)
    return (_first_name(td) if td is not None else "") or f"#{rev.task_id}"


def _sheet_scope(rows: list[LeaderAiReview]):
    """SQL condition selecting the form rows behind `rows`, or None for none.

    Matched on the ref's OWN handle — the submission id — and by date only for
    the `sheetd:` refs that never had one. A row's date MOVES underneath a
    verdict: `services/leader_tasks.filed_date` re-attributes a handover row to
    the day it was actually worked, so a report filed at 20:43 dated tomorrow
    lands back on today the next time the sheet syncs. A lookup scoped to the
    review's SNAPSHOT date then finds nothing, and the card reads «0 photos»
    about a report sitting one day over whose photos the reviewer had plainly
    read — image date, verdict and all. The drain never had that blind spot
    (`leader_ai._sheet_row` keys on the submission id alone), and the two
    lookups have to agree about what a ref points at.
    """
    sids = {r.ref.split(":")[1] for r in rows if r.ref.startswith("sheet:")}
    dates = {r.date for r in rows if not r.ref.startswith(("bot:", "sheet:"))}
    conds = []
    if sids:
        conds.append(LeaderChecklist.submission_id.in_(sids))
    if dates:
        conds.append(LeaderChecklist.date.in_(dates))
    return or_(*conds) if conds else None


def _project(db: Session, rows: list[LeaderAiReview]) -> dict[str, dict]:
    """(leader, supervisor, task label) per row — and NOTHING else.

    The filter bar and its facet counts have to be computed over the whole
    unresolved set: an option list built from the rows that survived the page
    cap is a filter that lies about what it will find. `_hydrate` cannot be
    that pass — it carries a photo list and the full checklist JSON per row,
    which is right for 300 rows and ruinous for 4 000. So the names are
    resolved here from column-projected reads, by the same rules, and the
    heavy work stays on the page.
    """
    if not rows:
        return {}

    cfg = _task_cfg(db, rows)
    prof_ids = {r.leader_id for r in rows if r.leader_id}
    profs = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
             .filter(RoleProfile.id.in_(prof_ids)).all()} if prof_ids else {}
    mgr_ids = {r.manager_id for r in rows if r.manager_id}
    mgrs = {m.id: m.name for m in db.query(Manager.id, Manager.name)
            .filter(Manager.id.in_(mgr_ids)).all()} if mgr_ids else {}

    # Sheet rows carry the leader's name as the SHEET spells it, which is what
    # the rail prints even when the fuzzy match to a profile came back empty —
    # so the filter has to match on that same string. Columns only: the `tasks`
    # JSONB on these rows is the whole report and none of it is needed here.
    by_key: dict[tuple[str, str], tuple[str, str]] = {}
    by_sub: dict[str, tuple[str, str]] = {}
    scope = _sheet_scope(rows)
    if scope is not None:
        for d, ldr, sup, sub in db.query(
                LeaderChecklist.date, LeaderChecklist.leader,
                LeaderChecklist.supervisor, LeaderChecklist.submission_id
        ).filter(scope).all():
            pair = (ldr, relabel_supervisor(sup))
            by_key[(d, (ldr or "").strip().lower()[:60])] = pair
            if sub:
                by_sub[sub] = pair

    out: dict[str, dict] = {}
    for rev in rows:
        leader = supervisor = None
        if not rev.ref.startswith("bot:"):
            parts = rev.ref.split(":")
            pair = (by_sub.get(parts[1]) if rev.ref.startswith("sheet:")
                    else by_key.get((rev.date, parts[2] if len(parts) > 3 else "")))
            if pair:
                leader, supervisor = pair
        # Bot rows stamp `leader_id` from the day at discovery, so the profile
        # name IS the name the rail prints — no entry→day walk needed here.
        if not leader and rev.leader_id in profs:
            leader = profs[rev.leader_id]
        if not supervisor and rev.manager_id in mgrs:
            supervisor = relabel_supervisor(mgrs[rev.manager_id])
        out[rev.ref] = {
            "leader": leader or "—",
            "supervisor": supervisor or "—",
            "task": _label(cfg, rev),
        }
    return out


def _hydrate(db: Session, rows: list[LeaderAiReview]) -> list[dict]:
    """Attach names, photos and the leader's own answer to each verdict.

    Everything is batch-loaded: a 300-row queue that walked one query per row
    would be the slowest read on the platform.
    """
    if not rows:
        return []

    # ── names ────────────────────────────────────────────────────────────────
    prof_ids = {r.leader_id for r in rows if r.leader_id}
    profs = {p.id: p for p in db.query(RoleProfile)
             .filter(RoleProfile.id.in_(prof_ids)).all()} if prof_ids else {}
    mgr_ids = {r.manager_id for r in rows if r.manager_id}
    mgrs = {m.id: m for m in db.query(Manager)
            .filter(Manager.id.in_(mgr_ids)).all()} if mgr_ids else {}

    cfg = _task_cfg(db, rows)

    # ── the bot layer: entry → answer, and its media ids ─────────────────────
    entry_ids = {int(r.ref.split(":")[1]) for r in rows if r.ref.startswith("bot:")}
    entries = {e.id: e for e in db.query(LeaderTaskEntry)
               .filter(LeaderTaskEntry.id.in_(entry_ids)).all()} if entry_ids else {}
    media: dict[int, list[int]] = {}
    if entry_ids:
        for m in (db.query(LeaderTaskMedia)
                  .filter(LeaderTaskMedia.entry_id.in_(entry_ids))
                  .order_by(LeaderTaskMedia.pos).all()):
            media.setdefault(m.entry_id, []).append(m.id)
    day_ids = {e.day_id for e in entries.values()}
    days = {d.id: d for d in db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.id.in_(day_ids)).all()} if day_ids else {}

    # ── the sheet layer: one query, keyed by ref handle — see _sheet_scope ────
    sheet_rows: dict[tuple[str, str], LeaderChecklist] = {}
    by_submission: dict[str, LeaderChecklist] = {}
    scope = _sheet_scope(rows)
    if scope is not None:
        for row in db.query(LeaderChecklist).filter(scope).all():
            sheet_rows[(row.date, (row.leader or "").strip().lower()[:60])] = row
            if row.submission_id:
                by_submission[row.submission_id] = row

    out = []
    for rev in rows:
        leader = supervisor = None
        task: dict = {}
        photos: list[dict] = []
        uid = None

        if rev.ref.startswith("bot:"):
            entry = entries.get(int(rev.ref.split(":")[1]))
            if entry is not None:
                uid = f"bot-{entry.day_id}"
                task = {"done": bool(entry.done), "reason": entry.reason}
                photos = [{"kind": "bot", "id": mid} for mid in media.get(entry.id, [])]
                day = days.get(entry.day_id)
                if day is not None and day.leader_id in profs:
                    leader = profs[day.leader_id].name
        else:
            parts = rev.ref.split(":")
            row = (by_submission.get(parts[1]) if rev.ref.startswith("sheet:")
                   else sheet_rows.get((rev.date, parts[2] if len(parts) > 3 else "")))
            if row is not None:
                uid = leader_ai.row_uid(row)
                leader = row.leader
                supervisor = relabel_supervisor(row.supervisor)
                tk = next((t for t in (row.tasks or [])
                           if int(t.get("id") or 0) == rev.task_id), None)
                if tk:
                    task = {"done": bool(tk.get("done")), "reason": tk.get("reason")}
                    photos = [{"kind": "sheet", "url": p.strip()}
                              for p in (tk.get("photo") or "").split(",")
                              if "http" in p]

        if leader is None and rev.leader_id in profs:
            leader = profs[rev.leader_id].name
        if supervisor is None and rev.manager_id in mgrs:
            supervisor = relabel_supervisor(mgrs[rev.manager_id].name)

        lo, hi = leader_ai.date_window(rev.date, rev.shift)
        out.append({
            "ref": rev.ref,
            "uid": uid,
            "taskId": rev.task_id,
            # The name the LEADER was shown, not the global catalog name — a
            # supervisor may have renamed the task for their own unit, and that
            # renamed line is what the photo was filed against.
            "taskLabel": _label(cfg, rev),
            "date": rev.date,
            "shift": rev.shift,
            "source": rev.source,
            "leader": leader or "—",
            "supervisor": supervisor or "—",
            "flags": rev.flags or [],
            "bucket": leader_ai.bucket_of(rev.flags),
            "imageDate": rev.image_date,
            "expected": f"{lo} — {hi}",
            "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
            # The yardstick the verdict was measured against. Asking a reviewer
            # to agree with a judgment while hiding its criterion is the reason
            # the old card could only ever be taken on faith.
            "criteria": _chain(cfg, rev, "criteria"),
            "leaderDone": task.get("done"),
            "leaderReason": task.get("reason"),
            "photos": photos,
            # How many images the verdict was actually written from. When the
            # list above comes back empty, this is the only thing that tells
            # «the leader filed nothing» apart from «the report was deleted
            # under a real verdict» — and a bare 0 told the first story about
            # rows that were plainly the second.
            "photosJudged": rev.photos or 0,
            "reviewedAt": rev.reviewed_at.isoformat() if rev.reviewed_at else None,
        })
    return out


class ResolveIn(BaseModel):
    ref: str
    resolution: str = Field(..., pattern="^(approved|rejected|requeried|open)$")
    note: str | None = None


@router.post("/resolve")
def resolve(body: ResolveIn, db: Session = Depends(get_db),
            admin: dict = Depends(verify_admin)):
    """Record the human decision that takes a flag out of the queue.

    Three rulings, and only one of them costs anybody anything:
      approved   the AI was wrong — the flag retires, nothing else moves.
      rejected   the AI was right — the task stops counting toward the day
                 (applied as a read-time overlay in routers/leaders.py; the
                 leaders sheet is not ours to write) and the leader is told.
      requeried  the leader is asked to re-file. No penalty yet — this is the
                 humane default when a photo is merely unreadable.

    …plus `open`, which is not a ruling but its REVERSAL: it clears the decision
    and puts the row back in the queue. That exists because the triage screen
    dispatches on a single keystroke, and a one-key decision is only safe if one
    key takes it back. Undoing by writing `approved` would have been a lie —
    "nobody has looked at this yet" and "somebody looked and cleared it" are
    different facts, and the calibration stats read exactly that difference.

    Idempotent per row: re-deciding overwrites the previous ruling and re-stamps
    the actor, so a correction is a normal action rather than a DB edit.
    """
    rev = db.query(LeaderAiReview).filter_by(ref=body.ref).first()
    if rev is None:
        raise HTTPException(status_code=404, detail="Unknown verdict")
    if rev.status != "flagged":
        raise HTTPException(status_code=400,
                            detail="Only a flagged verdict can be resolved")

    who = (admin.get("full_name") or admin.get("username")
           or str(admin.get("telegram_id") or "admin"))[:160]

    if body.resolution == "open":
        rev.resolution = None
        rev.resolved_by = None
        rev.resolved_at = None
        rev.resolution_note = None
        db.commit()
        log.info("leader-ai: %s reopened %s", who, rev.ref)
        return {"ok": True, "ref": rev.ref, "resolution": None,
                "counts": leader_ai.counts(db)}

    rev.resolution = body.resolution
    rev.resolved_by = who
    rev.resolved_at = datetime.now(timezone.utc)
    rev.resolution_note = (body.note or "").strip()[:1000] or None
    db.commit()
    log.info("leader-ai: %s ruled %s on %s", who, rev.resolution, rev.ref)

    if body.resolution in ("rejected", "requeried"):
        _notify_leader(db, rev)
    return {"ok": True, "ref": rev.ref, "resolution": rev.resolution,
            "counts": leader_ai.counts(db)}


def _notify_leader(db: Session, rev: LeaderAiReview) -> None:
    """Tell the leader their proof did not stand — bell row + DM to every
    account holding the profile, each in its own language.

    A leader whose sheet name never resolved to a profile has nobody to tell;
    the ruling still stands. A failed DM must never roll back the decision,
    which is why this swallows everything.
    """
    if not rev.leader_id:
        return
    try:
        from app.routers.staff import notify_profile
        notify_profile(
            db, f"leader:{rev.leader_id}",
            nkey=("leader_proof_rejected" if rev.resolution == "rejected"
                  else "leader_proof_requeried"),
            params={
                "date": rev.date,
                "task": leader_ai.task_label(db, rev.task_id),
                "by": rev.resolved_by or "—",
            },
            type="warning",
        )
    except Exception:
        log.exception("leader-ai: could not notify leader profile %s", rev.leader_id)


class ReviewNowIn(BaseModel):
    uid: str
    task_id: int
    # Re-run a task that already has a verdict. Normally refused — a stored
    # verdict is returned instead of re-spending quota on an answer we have.
    # But after a prompt or model change the stored answer is the OLD reviewer's,
    # and this is the only way to see the new one on a photo you are looking at
    # without a shell on the box.
    force: bool = False


@router.post("/review-now")
def review_now(body: ReviewNowIn, db: Session = Depends(get_db),
               _: dict = Depends(verify_admin)):
    """Review ONE task's photos right now and return the verdict.

    Deliberately synchronous and deliberately per-task. A whole report is up to
    13 calls, and the free tier's per-MINUTE cap means that would be a
    minute-long request that mostly 429s — whereas one task is a single call an
    admin waits about three seconds for, which is what makes the wait feel like
    an action instead of a queue.
    """
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")

    refs = _refs_for_uid(db, body.uid)
    ref = next((r for r, tid in refs.items() if tid == body.task_id), None)
    if ref is None:
        raise HTTPException(status_code=404, detail="Unknown report or task")

    rev = db.query(LeaderAiReview).filter_by(ref=ref).first()
    if rev is None:
        # Never queued — the usual case before the first Refresh has run.
        # Queue THIS report only: a full discover() walks every report ever
        # filed and would turn one button press into a half-minute request.
        leader_ai.queue_report(db, **_report_target(db, body.uid))
        rev = db.query(LeaderAiReview).filter_by(ref=ref).first()
    if rev is None:
        raise HTTPException(status_code=404, detail="Nothing to review for this task")
    if rev.status in ("ok", "flagged") and not body.force:
        return {"ok": True, "task": _as_verdict(rev)}  # already judged; never re-spend

    # An admin asking again IS the retry — give a burned-out row its attempts back.
    rev.attempts = 0
    try:
        leader_ai.review_one(db, rev)
    except gemini.GeminiQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    db.refresh(rev)
    return {"ok": True, "task": _as_verdict(rev)}


def _report_target(db: Session, uid: str) -> dict:
    """The report behind a uid, as kwargs for `leader_ai.queue_report`."""
    if uid.startswith("bot-"):
        try:
            return {"day": db.query(LeaderTaskDay).filter_by(id=int(uid[4:])).first()}
        except ValueError:
            return {}
    row = None
    if uid.startswith("row-"):
        try:
            row = db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
        except ValueError:
            row = None
    return {"row": row or db.query(LeaderChecklist).filter_by(submission_id=uid).first()}


def _refs_for_uid(db: Session, uid: str) -> dict[str, int]:
    """ref → task_id for every task of one report, whichever layer filed it."""
    refs: dict[str, int] = {}
    if uid.startswith("bot-"):
        try:
            day_id = int(uid[4:])
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad uid")
        if not db.query(LeaderTaskDay).filter_by(id=day_id).first():
            return refs
        for e in db.query(LeaderTaskEntry).filter_by(day_id=day_id).all():
            refs[leader_ai.bot_ref(e.id)] = e.task_id
        return refs

    row = None
    if uid.startswith("row-"):
        try:
            row = db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
        except ValueError:
            row = None
    if row is None:
        row = db.query(LeaderChecklist).filter_by(submission_id=uid).first()
    if row is None:
        return refs
    for tk in (row.tasks or []):
        tid = int(tk.get("id") or 0)
        refs[leader_ai.sheet_ref(row, tid)] = tid
    return refs


def _as_verdict(rev: LeaderAiReview) -> dict:
    lo, hi = leader_ai.date_window(rev.date, rev.shift)
    return {
        "status": rev.status,
        "flags": rev.flags or [],
        "imageDate": rev.image_date,
        # The window the verdict was measured against, from the SAME function
        # the checker used — a date flag is only actionable if you can see what
        # the photo was supposed to fall inside, and a second copy of the shift
        # rule in the client would eventually disagree with the backend.
        "expected": f"{lo} — {hi}",
        "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
        "photos": rev.photos,
        "error": rev.error,
        "attempts": rev.attempts,
        "exhausted": (rev.attempts or 0) >= leader_ai.MAX_ATTEMPTS,
        "reviewedAt": rev.reviewed_at.isoformat() if rev.reviewed_at else None,
        # The human ruling, so a task card can say "an admin already looked at
        # this and disagreed" instead of re-presenting a decided flag as open.
        "resolution": rev.resolution,
        "resolvedBy": rev.resolved_by,
        "resolvedAt": rev.resolved_at.isoformat() if rev.resolved_at else None,
        "resolutionNote": rev.resolution_note,
    }


class ApiKeyIn(BaseModel):
    # "" clears the stored key and turns the feature back off.
    key: str = Field(default="", max_length=400)


@router.get("/key")
def get_key(_: dict = Depends(verify_admin)):
    """Whether a key is configured, where it came from, and a masked preview.

    Never returns the key. The preview is first-4 + last-4 so an operator can
    tell "the key I pasted" from "some other key" without the value being
    readable — enough to diagnose a bad paste, useless to anyone reading over a
    shoulder or scrolling back through a screen share.
    """
    src = gemini.key_source()
    raw = gemini.api_key()
    return {
        "configured": bool(raw),
        # env wins over the stored key, so the form says so rather than letting
        # somebody type a value that silently never takes effect.
        "source": src,
        "editable": src != "env",
        "preview": f"{raw[:4]}…{raw[-4:]}" if len(raw) >= 12 else ("…" if raw else ""),
        # The model rides along: it is the other half of "what will this cost
        # and how well will it judge", and a second request for one string on a
        # card that is already open is a round-trip for nothing.
        "model": gemini.active_model(),
        "modelSource": gemini.model_source(),
        "models": list(gemini.MODELS),
    }


class ModelIn(BaseModel):
    model: str = Field(..., max_length=80)


@router.post("/model")
def set_model(body: ModelIn, db: Session = Depends(get_db),
              admin: dict = Depends(verify_admin)):
    """Choose which Gemini model the reviewer runs on.

    The binding constraint moves and nobody can predict when: `flash` judges
    the relevance question better, `flash-lite` goes several times further per
    day, and which one is right flips the moment the account lands on the free
    tier or runs into a spend cap. Until now that choice lived in `config.py`
    and needed a push, which means it needed someone with repo access at the
    exact moment the quota ran out — the same trap the API key was in.

    Restricted to the curated aliases. A free-text field here is a way to type
    a retired model id and get a 404 on every row until somebody notices, and
    the two on offer are the two that are known to resolve.
    """
    name = (body.model or "").strip()
    if name not in gemini.MODELS:
        raise HTTPException(status_code=400,
                            detail=f"Unknown model. Choose one of: "
                                   f"{', '.join(gemini.MODELS)}")

    row = db.query(AppSetting).filter_by(key=gemini.MODEL_SETTING).first()
    if row is None:
        db.add(AppSetting(key=gemini.MODEL_SETTING, value=name))
    else:
        row.value = name
    db.commit()
    # Same reason the key invalidates its cache: the next thing the operator
    # does is press «Tekshirish» and expect the model they just picked.
    gemini.invalidate_model_cache()
    log.info("leader-ai: %s set the model to %s",
             admin.get("telegram_id"), name)
    return {"ok": True, "model": gemini.active_model(),
            "modelSource": gemini.model_source()}


@router.post("/key")
def set_key(body: ApiKeyIn, db: Session = Depends(get_db),
            admin: dict = Depends(verify_admin)):
    """Store (or clear) the Gemini API key from the admin UI.

    This endpoint exists because the key's only other homes are `backend/.env`
    (needs a shell on the VPS) and a CI secret (needs repo-admin on Gitea). An
    operator with neither could not turn the feature on at all — it shipped and
    then sat dark. Now the person who runs the plant can paste their own key.

    Stored SEALED (`web_auth.seal_password`, keyed off SECRET_KEY, which is in
    .env and never in the database), so a `dbdump` export carries ciphertext.
    The value is never logged and never read back — see GET above.
    """
    from app.web_auth import seal_password

    if gemini.key_source() == "env":
        raise HTTPException(
            status_code=409,
            detail="A key is pinned in backend/.env on the server; "
                   "it takes precedence and must be changed there.",
        )

    raw = (body.key or "").strip()
    who = (admin.get("full_name") or admin.get("username")
           or str(admin.get("telegram_id") or "admin"))

    row = db.query(AppSetting).filter_by(key=gemini.KEY_SETTING).first()
    if not raw:
        if row is not None:
            db.delete(row)
            db.commit()
        gemini.invalidate_key_cache()
        log.info("leader-ai: %s CLEARED the Gemini API key", who)
        return {"ok": True, "configured": False}

    sealed = seal_password(raw)
    if row is None:
        db.add(AppSetting(key=gemini.KEY_SETTING, value=sealed))
    else:
        row.value = sealed
    db.commit()
    # Without this the new key would not be live until the 30s cache expired,
    # and the very next thing the operator does is press «Tekshirish».
    gemini.invalidate_key_cache()
    # Length only. A key in the log is a key in a rotated logfile nobody thinks
    # to shred, and this file is read by everyone debugging the bot.
    log.info("leader-ai: %s set a Gemini API key (%s chars)", who, len(raw))

    # Arm the periodic drain, which boot DECLINED to schedule because there was
    # no key yet — and a key set from this form is precisely the case where
    # there wasn't one. Without this the timer never exists on that process, so
    # the queue only ever moves when a request happens to kick it, and a
    # swallowed kick strands it until the next restart rather than 20 minutes.
    # `replace_existing` makes re-registration a no-op when it is already armed.
    try:
        leader_ai.register_drain_job()
    except Exception:
        log.exception("leader-ai: could not arm the periodic drain")

    # Drain what is ALREADY queued, nothing more. Setting a key used to back-fill
    # the entire corpus — one form submit, thousands of rows and a quota bill
    # nobody chose. Turning the feature on and deciding what it should read are
    # two different acts; the backlog is one «Tekshirish» away in the re-check
    # modal, which shows the count first and asks.
    try:
        leader_ai.run_async(discover_first=False)
    except Exception:
        log.exception("leader-ai: could not kick a drain after the key was set")
    return {"ok": True, "configured": True, "source": "db"}


@router.post("/run")
def run(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Queue anything new and start draining. Returns immediately — a backlog
    takes far longer than a request may — so the page polls `overview`."""
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")
    added = leader_ai.discover(db)
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "queued": added, "counts": leader_ai.counts(db)}


def _narrow(q, *, date_from: str | None = None, date_to: str | None = None,
            shift: int | None = None, manager_id: int | None = None,
            leader_id: int | None = None):
    """Apply the re-check modal's scope to a `LeaderAiReview` query.

    ONE definition, used by every surface that has to agree about what a run
    covers: the dry-run count, the range summary, the update that queues the
    rows, the drain that spends on them and the progress bar that measures
    them. Two copies would drift, and the shape they drift into is a bar
    swearing it is honouring a filter the drain never saw.

    `date` is a 'YYYY-MM-DD' string, so a lexical compare IS a date compare.
    The other three are columns stamped at discovery (`services/leader_ai.py`),
    which is what makes this filtering exact and free — no name matching, no
    projection pass. A row whose fuzzy match came back empty carries NULL and
    therefore belongs to no leader and no brigadir: it is reachable under «All»
    and nowhere else, which is the honest answer rather than padding it onto
    somebody who may not own it.
    """
    if date_from:
        q = q.filter(LeaderAiReview.date >= date_from)
    if date_to:
        q = q.filter(LeaderAiReview.date <= date_to)
    if shift is not None:
        q = q.filter(LeaderAiReview.shift == shift)
    if manager_id is not None:
        q = q.filter(LeaderAiReview.manager_id == manager_id)
    if leader_id is not None:
        q = q.filter(LeaderAiReview.leader_id == leader_id)
    return q


def _narrow_labels(db: Session, shift: int | None, manager_id: int | None,
                   leader_id: int | None) -> list[str]:
    """Human names for an active narrowing, resolved ONCE when the run starts.

    The progress strip has to say what a run covers, and it polls every few
    seconds — re-resolving two names on every poll to print a caption is work
    nobody asked for. Ids are stable; the name printed is the one that was true
    when the operator picked it.
    """
    out: list[str] = []
    if shift is not None:
        out.append(f"S{shift}")
    if manager_id is not None:
        m = db.query(Manager.name).filter(Manager.id == manager_id).scalar()
        out.append(relabel_supervisor(m) if m else f"#{manager_id}")
    if leader_id is not None:
        p = db.query(RoleProfile.name).filter(RoleProfile.id == leader_id).scalar()
        out.append(p or f"#{leader_id}")
    return out


class RecheckIn(BaseModel):
    date_from: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    # WHO, alongside WHEN. A date range is the wrong axis for most of the real
    # errands: "this brigadir's unit files photos of the wrong board", "shift 2
    # was judged against the wrong window", "this leader was re-matched to a
    # profile". Without these the only way to re-check one leader was to
    # re-check every leader who filed on the same days and pay for all of them.
    shift: int | None = Field(None, ge=1, le=2)
    manager_id: int | None = Field(None, ge=1)
    leader_id: int | None = Field(None, ge=1)
    # Which verdicts to throw away and re-earn. "flagged" is the cheap, useful
    # default: a stricter reviewer mostly changes its mind about rows it already
    # doubted, and re-running those costs a fraction of the corpus.
    #
    # "unchecked" is the odd one out and deliberately FIRST in the UI: it
    # destroys nothing. It discovers reports that never got a row and drains
    # what is already queued, which is the ordinary "catch up on this week"
    # errand — and until it existed the only way to do it was `/run`, which has
    # no date range and therefore no way to say "just this week".
    scope: str = Field("flagged", pattern="^(unchecked|flagged|clean|all)$")
    # Count what would be re-queued without touching anything. The confirm has
    # to print the real cost — "re-check everything?" with no number attached is
    # a question nobody can answer, and this one spends metered quota.
    dry_run: bool = False


@router.post("/recheck")
def recheck(body: RecheckIn, db: Session = Depends(get_db),
            admin: dict = Depends(verify_admin)):
    """Re-queue verdicts that have already been judged, so a changed prompt or
    model runs against them again.

    This exists because the reviewer's QUESTIONS change. A verdict written by an
    older prompt is not wrong data to be repaired — it is an answer to a
    question we no longer ask, and nothing else in the system can tell the two
    apart. The backfill CLI could do this from a shell; this endpoint is the
    same thing for people who do not have one.

    Two rules make it safe to hand to a button:

    * **Resolved rows are never touched.** A human ruling is that row's terminal
      state. Re-queueing it would resurrect a decided flag in the triage queue
      and pollute the calibration stats, which measure agreement between a human
      and the machine that the human actually saw.
    * **It only queues.** The existing drain — batch-capped, advisory-locked,
      and now on a timer — does the spending, so re-queueing ten thousand rows
      paces itself instead of becoming one enormous request that dies with its
      worker.
    """
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")

    def _scoped(q):
        return _narrow(q, date_from=body.date_from, date_to=body.date_to,
                       shift=body.shift, manager_id=body.manager_id,
                       leader_id=body.leader_id)

    # ── "catch up": never-judged rows only ───────────────────────────────────
    # Nothing is overwritten, so there is no verdict to lose and no confirm to
    # earn. `discover()` runs even for the dry run: a report filed since the
    # last pass has no row yet, and counting only what is already queued would
    # under-report exactly the work the operator came here to start. Discovery
    # inserts `pending` rows — it spends no quota, the drain does that.
    if body.scope == "unchecked":
        found = leader_ai.discover(db)
        n = _scoped(
            db.query(LeaderAiReview).filter(LeaderAiReview.status == "pending")
        ).count()
        if body.dry_run:
            return {"ok": True, "requeued": n, "found": found, "dryRun": True}
        _start_run(db, n, body, admin)
        log.info("LEADER-AI catch-up by %s: %s pending (%s new) in %s..%s [%s]",
                 admin.get("telegram_id"), n, found,
                 body.date_from or "*", body.date_to or "*",
                 " · ".join(_narrow_labels(db, body.shift, body.manager_id,
                                           body.leader_id)) or "all")
        leader_ai.run_async(discover_first=False)
        return {"ok": True, "requeued": n, "found": found,
                "counts": leader_ai.counts(db)}

    # ── re-check: throw away a verdict and earn it again ─────────────────────
    q = _scoped(db.query(LeaderAiReview).filter(
        LeaderAiReview.status.in_(("ok", "flagged")),
        LeaderAiReview.resolution.is_(None),
    ))
    if body.scope == "flagged":
        q = q.filter(LeaderAiReview.status == "flagged")
    elif body.scope == "clean":
        q = q.filter(LeaderAiReview.status == "ok")

    if body.dry_run:
        return {"ok": True, "requeued": q.count(), "dryRun": True}

    n = q.update({"status": "pending", "attempts": 0}, synchronize_session=False)
    db.commit()
    _start_run(db, n, body, admin)
    log.info("LEADER-AI recheck by %s: %s rows (scope=%s, %s..%s, %s)",
             admin.get("telegram_id"), n, body.scope,
             body.date_from or "*", body.date_to or "*",
             " · ".join(_narrow_labels(db, body.shift, body.manager_id,
                                       body.leader_id)) or "everyone")
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "requeued": n, "counts": leader_ai.counts(db)}


# ── the run record: what the progress bar is measuring ───────────────────────
# Queueing ten thousand rows from a button and then showing nothing is how an
# operator ends up pressing it three more times. But the drain is a shared,
# advisory-locked background worker that knows nothing about who queued what, so
# progress needs a mark somewhere outside it.
#
# ONE app_settings row, not a jobs table. The bar needs three numbers — how many
# were queued, how many have been judged since, is it still going — and all three
# come from a start timestamp plus a total. A table would add a schema, a
# lifecycle and a second source of truth about work whose real state already
# lives in `leader_ai_reviews.status`.
#
# Defined in the SERVICE, not here: the drain reads the same record to confine
# itself to an active run's dates, and the dependency only runs router →
# service. Two constants would drift, and the failure they'd drift into is a
# drain that ignores the range while the bar swears it is honouring it.
RUN_SETTING = leader_ai.RUN_SETTING


def _start_run(db: Session, total: int, body: "RecheckIn", admin: dict) -> None:
    """Mark the start of a run so `/progress` can measure it. A run with nothing
    queued is not recorded — an empty progress bar is worse than none."""
    if total <= 0:
        return
    import json

    payload = json.dumps({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "scope": body.scope,
        "from": body.date_from,
        "to": body.date_to,
        # The WHO of the run, by the same rule the dates already follow: the
        # drain confines itself to this and `/progress` measures inside it, so
        # a run started for one brigadir spends on that brigadir instead of
        # walking the corpus behind a bar that claims otherwise. A record
        # written before these existed simply has no keys — `.get` reads them
        # as "no narrowing", which is what it was.
        "shift": body.shift,
        "manager": body.manager_id,
        "leader": body.leader_id,
        "narrow": _narrow_labels(db, body.shift, body.manager_id, body.leader_id),
        "by": (admin.get("full_name") or str(admin.get("telegram_id") or "admin"))[:120],
    })
    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is None:
        db.add(AppSetting(key=RUN_SETTING, value=payload))
    else:
        row.value = payload
    db.commit()


# ── "is anything actually running?" ──────────────────────────────────────────
# The queue's SIZE was the only thing the bar could report, and a queue that is
# not shrinking is consistent with every possible state: a slow batch, a kick
# that no-op'd because another drain holds the lock, a 429 on the first row, a
# retired model failing all forty. The operator has no shell to go and settle it
# with, so the difference has to arrive in this payload.
#
# `services/leader_ai` writes the heartbeat; this only reads it and adds the two
# things the note cannot know: how long ago that was, and when the timer will
# try again by itself.

# A single verdict can legitimately take a couple of minutes — up to 60s
# fetching photos plus a 120s Gemini timeout — so a pulse is only overdue well
# past that. Under it, silence is work; over it, something is wedged.
DRAIN_STALL_S = 240


def _drain_state(db: Session) -> dict:
    """What the drain is doing right now, in the shape the strip renders."""
    import json

    from app.scheduler import next_run

    out: dict = {"state": "never"}
    row = db.query(AppSetting).filter_by(key=leader_ai.HEARTBEAT_SETTING).first()
    if row is not None:
        try:
            beat = json.loads(row.value) or {}
        except Exception:
            beat = {}
        at = beat.get("at")
        secs = None
        if at:
            try:
                secs = max(0, int((datetime.now(timezone.utc)
                                   - datetime.fromisoformat(at)).total_seconds()))
            except Exception:
                secs = None
        state = beat.get("state") or "never"

        def _ago(iso):
            """Seconds since an ISO stamp, or None. Shared by the two questions
            the strip could not answer: how long this drain has been spending,
            and whether the press that got refused was just now."""
            if not iso:
                return None
            try:
                return max(0, int((datetime.now(timezone.utc)
                                   - datetime.fromisoformat(iso)).total_seconds()))
            except Exception:
                return None

        out = {
            "state": state,
            "at": at,
            "secondsSince": secs,
            # How long the drain holding the queue has been at it. `at` is the
            # last PULSE — it ticks, so it can only ever say "alive", never
            # "alive and forty minutes deep". Quota is spent per verdict over
            # that whole span, so this is the number the person paying asks for.
            "runningForS": _ago(beat.get("startedAt")),
            # A kick that lost the race to this drain. Written beside the live
            # record rather than over it, so "Start now" can report what it did
            # instead of blanking the run it collided with.
            "refusedAgoS": _ago(beat.get("refusedAt")),
            "refusedState": beat.get("refusedState"),
            "done": beat.get("done"),
            "errors": beat.get("errors"),
            "quota": bool(beat.get("quota")),
            # The API's own sentence about WHICH limit. Ours said "daily" for
            # every 429, which is a guess: a per-minute cap clears itself before
            # the next timer firing, a spend cap does not clear this month, and
            # those are opposite instructions to the person reading the strip.
            "quotaMsg": beat.get("quotaMsg"),
            # Both are systemic — a retired model, a revoked key, a dead
            # network — and both are the answer to "why is it not moving".
            "error": beat.get("aborted") or beat.get("error"),
            # "running" with no pulse for minutes is NOT running. Saying so
            # beats a spinner that keeps promising, and it is the state a
            # restart fixes.
            "stalled": bool(state == "running" and secs is not None
                            and secs > DRAIN_STALL_S),
        }
    nxt = next_run("leader-ai-drain")
    if nxt is not None:
        try:
            out["nextInS"] = max(0, int((nxt - datetime.now(nxt.tzinfo))
                                        .total_seconds()))
        except Exception:
            pass
    return out


# Rows scanned to work out how many REPORTS a range holds. Row counts below are
# exact SQL aggregates and need no cap; the report count has to group refs in
# Python, so a whole-history query is bounded and marked approximate rather than
# becoming the slowest read on the platform.
REPORT_SCAN_CAP = 20000


@router.get("/range")
def range_summary(date_from: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                  date_to: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                  shift: int | None = Query(None, ge=1, le=2),
                  manager_id: int | None = Query(None, ge=1),
                  leader_id: int | None = Query(None, ge=1),
                  db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """What the chosen SLICE actually holds, and how much of it is already
    checked — plus the option lists for narrowing it further.

    Answers the question an operator has with their finger over a button that
    spends metered quota: *is this the slice I think it is, and how much of it
    is already done?* Until this existed the modal could only say how many rows
    a given scope would queue — a number with no denominator, which tells you
    the price but not what you are buying.

    The slice is dates AND who (`shift` / `manager_id` / `leader_id`), because
    that is what the modal now offers; every number below moves with all five,
    so the summary can never describe a wider set than the button will queue.

    Two units, because both are real and they are not interchangeable:

    * **reports** — a leader's day. This is what a person files and what the
      register lists, so it is the unit the question is usually asked in.
    * **proof rows** — one task's photos inside a report. This is the unit the
      reviewer judges and the unit quota is spent per, so it is what the
      progress bar and the cost estimate run on.

    A report counts as `checked` only when EVERY reviewable row in it has a
    verdict. Half-judged reports are their own bucket rather than being rounded
    into either — "68% checked" hiding a pile of half-done days is exactly the
    kind of number that stops being trusted.

    Both units count work that has NO review row yet (`rows.new`, and reports
    made only of such rows). Discovery is not automatic, so those reports are
    the ones a person came here to start — counting only what is already in
    `leader_ai_reviews` made this box answer "no proof photos in this range"
    about a range full of unchecked reports.
    """
    if not gemini.available():
        return {"enabled": False}

    def _scoped(q):
        return _narrow(q, date_from=date_from, date_to=date_to, shift=shift,
                       manager_id=manager_id, leader_id=leader_id)

    # ── rows: exact, one aggregate ───────────────────────────────────────────
    by_status = dict(
        _scoped(db.query(LeaderAiReview.status, func.count(LeaderAiReview.id)))
        .group_by(LeaderAiReview.status).all()
    )
    judged = by_status.get("ok", 0) + by_status.get("flagged", 0)
    stuck = _scoped(
        db.query(LeaderAiReview).filter(LeaderAiReview.status == "error",
                                        LeaderAiReview.attempts >= leader_ai.MAX_ATTEMPTS)
    ).count()
    rows = {
        "total": sum(by_status.values()),
        "judged": judged,
        "ok": by_status.get("ok", 0),
        "flagged": by_status.get("flagged", 0),
        # Queued = pending plus error rows that still have retries left; those
        # will drain on their own, so they are waiting, not broken.
        "pending": by_status.get("pending", 0) + max(0, by_status.get("error", 0) - stuck),
        "stuck": stuck,
        "skipped": by_status.get("skipped", 0),
    }
    # What triage still owes on this range — the number that says whether the
    # human queue has work here, as opposed to the machine.
    open_flags = _scoped(
        db.query(LeaderAiReview).filter(LeaderAiReview.status == "flagged",
                                        LeaderAiReview.resolution.is_(None))
    ).count()

    # ── reports: group rows by the report they belong to ─────────────────────
    refs = _scoped(
        db.query(LeaderAiReview.ref, LeaderAiReview.status)
    ).limit(REPORT_SCAN_CAP + 1).all()
    approx = len(refs) > REPORT_SCAN_CAP
    refs = refs[:REPORT_SCAN_CAP]

    # A sheet ref already names its report; a bot ref names an ENTRY, and the
    # report is that entry's day, so those need one lookup.
    day_of: dict[int, int] = {}
    entry_ids = {int(r.split(":")[1]) for r, _ in refs if r.startswith("bot:")}
    if entry_ids:
        day_of = dict(
            db.query(LeaderTaskEntry.id, LeaderTaskEntry.day_id)
            .filter(LeaderTaskEntry.id.in_(entry_ids)).all()
        )

    per_report: dict[str, list[str]] = {}
    for ref, status in refs:
        per_report.setdefault(leader_ai.report_key(ref, day_of), []).append(status)

    # ── the work that has no row at all ──────────────────────────────────────
    # Discovery is not automatic, so "never checked" reports are invisible to
    # every query above — they have no review row to be counted by. Reading only
    # `leader_ai_reviews` made this box answer "no proof photos in this range"
    # for a range full of reports nobody had pressed anything for yet, which is
    # the one range «Tekshirilmagan» is FOR. Counted from the source, by
    # discovery's own rule, and kept in its own bucket: `pending` rows drain by
    # themselves on the timer, these wait for someone to press the button.
    census = leader_ai.undiscovered(db, date_from=date_from, date_to=date_to)
    fresh = _who(census["rows"], shift=shift, manager_id=manager_id,
                 leader_id=leader_id)
    for key, *_ in fresh:
        per_report.setdefault(key, []).append("new")
    rows["new"] = len(fresh)
    rows["total"] += len(fresh)
    approx = approx or census["approx"]
    # What the «Tekshirilmagan» run would queue, by that run's OWN definition:
    # rows already pending plus the ones discovery is about to insert. Defined
    # here rather than added up in the UI so the number under the bar and the
    # number in the confirm cannot drift apart — a summary promising 40 and a
    # confirm asking about 37 is a summary nobody reads twice.
    rows["catchUp"] = by_status.get("pending", 0) + len(fresh)

    checked = partial = unchecked = 0
    for statuses in per_report.values():
        done = sum(1 for s in statuses if s in ("ok", "flagged"))
        if done == len(statuses):
            checked += 1
        elif done:
            partial += 1
        else:
            unchecked += 1

    return {
        "enabled": True,
        "from": date_from, "to": date_to,
        "shift": shift, "managerId": manager_id, "leaderId": leader_id,
        "reports": {"total": len(per_report), "checked": checked,
                    "partial": partial, "unchecked": unchecked,
                    "approx": approx},
        "rows": rows,
        "openFlags": open_flags,
        "facets": _range_facets(db, date_from, date_to, shift,
                                manager_id, leader_id, census["rows"]),
    }


def _who(census_rows, *, shift=None, manager_id=None, leader_id=None,
         skip: str | None = None):
    """Narrow census rows by unit/leader/shift, optionally ignoring ONE
    dimension.

    `skip` is what lets a picker count itself out, the same rule the SQL facets
    follow: counting the leader list against the leader already chosen leaves it
    holding only that leader, with no way back to anyone else short of clearing
    the filter.
    """
    out = []
    for row in census_rows:
        sh, mgr, ldr = row[1], row[2], row[3]
        if shift is not None and skip != "shift" and sh != shift:
            continue
        if manager_id is not None and skip != "manager" and mgr != manager_id:
            continue
        if leader_id is not None and skip != "leader" and ldr != leader_id:
            continue
        out.append(row)
    return out


def _range_facets(db: Session, date_from: str | None, date_to: str | None,
                  shift: int | None, manager_id: int | None,
                  leader_id: int | None, census_rows) -> dict:
    """Option lists for the shift / brigadir / leader pickers, with counts.

    Three grouped aggregates, no projection pass: `shift`, `manager_id` and
    `leader_id` are stamped on the row at discovery, so the count beside a name
    is computed from the very column the filter tests. That self-consistency is
    the point — the number the operator reads beside «Aripova M.» is exactly
    how many proof rows picking her will reach, never an estimate from a
    different resolution path.

    Each dimension is counted against every OTHER active filter but not against
    itself, the same rule the triage panel follows: counting a dimension
    against its own pick would leave the leader list holding only the leader
    already chosen, with no way back to anyone else short of clearing it.

    NULLs are dropped rather than bucketed. A row whose match came back empty
    belongs to no leader, and an option that cannot be named cannot be picked —
    those rows stay reachable under «All», which is where they honestly are.

    Options are sorted busiest first: an alphabetical list of ninety leaders
    buries the one with work behind it.
    """
    # Never-queued work counts toward a picker exactly as a judged row does.
    # Leaving it out made every list empty on a range nobody had discovered yet
    # — dead controls over a set the summary was, by then, correctly reporting
    # as full of unchecked reports.
    IDX = {"shift": 1, "manager": 2, "leader": 3}

    def _tally(col, dim, **fixed):
        rows = (_narrow(db.query(col, func.count(LeaderAiReview.id)),
                        date_from=date_from, date_to=date_to, **fixed)
                .filter(col.isnot(None)).group_by(col).all())
        n_by_v = {v: n for v, n in rows}
        for row in _who(census_rows, shift=shift, manager_id=manager_id,
                        leader_id=leader_id, skip=dim):
            v = row[IDX[dim]]
            if v is not None:
                n_by_v[v] = n_by_v.get(v, 0) + 1
        return sorted(({"v": v, "n": n} for v, n in n_by_v.items()),
                      key=lambda o: (-o["n"], str(o["v"])))

    shifts = _tally(LeaderAiReview.shift, "shift",
                    manager_id=manager_id, leader_id=leader_id)
    mgrs = _tally(LeaderAiReview.manager_id, "manager",
                  shift=shift, leader_id=leader_id)
    ldrs = _tally(LeaderAiReview.leader_id, "leader",
                  shift=shift, manager_id=manager_id)

    # The CURRENT pick is looked up even when the other filters starved it to
    # zero rows — a picker that cannot name what is selected shows an empty
    # trigger over a very much filtered set.
    mgr_ids = {o["v"] for o in mgrs} | ({manager_id} if manager_id else set())
    ldr_ids = {o["v"] for o in ldrs} | ({leader_id} if leader_id else set())
    mgr_names = dict(db.query(Manager.id, Manager.name)
                     .filter(Manager.id.in_(mgr_ids)).all()) if mgr_ids else {}
    ldr_names = dict(db.query(RoleProfile.id, RoleProfile.name)
                     .filter(RoleProfile.id.in_(ldr_ids)).all()) if ldr_ids else {}

    return {
        "shift": shifts,
        # Relabelled by the same map the register and the queue print, so one
        # person is not two names across two screens.
        "manager": [{**o, "label": relabel_supervisor(mgr_names.get(o["v"]))
                     or f"#{o['v']}"} for o in mgrs],
        "leader": [{**o, "label": ldr_names.get(o["v"]) or f"#{o['v']}"}
                   for o in ldrs],
        # Names for a pick that fell out of its own list, so the trigger can
        # still say who is selected beside a count of zero.
        "picked": {
            "manager": (relabel_supervisor(mgr_names.get(manager_id))
                        or f"#{manager_id}") if manager_id else None,
            "leader": (ldr_names.get(leader_id) or f"#{leader_id}")
            if leader_id else None,
        },
    }


@router.get("/progress")
def progress(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """How far the current run has got. Polled by the page while a run is live.

    `done` counts rows JUDGED SINCE the run started rather than "total minus
    pending", because pending also grows on its own — a leader closing a bot day
    mid-run would otherwise make the bar go backwards, which reads as a bug even
    when the work is fine.

    Deliberately three cheap COUNT queries and no joins: this is polled every
    few seconds for as long as a backfill takes.
    """
    import json

    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    pending = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS)
        .count()
    )
    if row is None:
        # No run — but "how much of my data has been checked?" is a question an
        # operator has at any time, not only while something is draining. A bar
        # that exists solely during a run is one they will never see, because
        # the runs are rare and mostly happen while nobody is looking.
        c = leader_ai.counts(db)
        judged = c.get("ok", 0) + c.get("flagged", 0)
        stuck = c.get("stuck", 0)
        skipped = c.get("skipped", 0)
        # Every row lands in exactly one bucket: judged (ok|flagged), queued
        # (pending, plus error rows with retries left), stuck (error, retries
        # spent) or skipped (a cancelled run). Leaving stuck rows out of the
        # denominator would let the bar read 100% while forty rows sit
        # permanently unjudged — the one state that most needs saying.
        known = judged + pending + stuck + skipped
        return {
            "active": False,
            "pending": pending,
            "coverage": {"judged": judged, "known": known,
                         "stuck": stuck, "skipped": skipped},
            # Queued work exists without a run behind it too — the timer drain
            # and a sheet Refresh both queue rows nobody started from this page,
            # and "why has this sat at 40 unchecked all day" is the same
            # question with no bar attached to it.
            "drain": _drain_state(db),
        }

    try:
        run = json.loads(row.value)
        started = datetime.fromisoformat(run["started_at"])
    except Exception:
        db.delete(row)
        db.commit()
        return {"active": False, "pending": pending}

    done = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.reviewed_at.isnot(None),
                LeaderAiReview.reviewed_at >= started)
        .count()
    )
    total = max(1, int(run.get("total") or 1))

    # What is left OF THIS RUN — scoped to the dates it was started for, which
    # is also what the drain now works through. `pending` above is the whole
    # table, and reporting that beside a one-day run is a bar contradicting
    # itself: "5 of 222", the percentage and the ETA all describe the run, so
    # the remainder has to as well, or the operator reads 2% and 25 minutes
    # next to 19,998 rows and cannot tell which number to believe.
    #
    # The global figure still ships, as `pendingAll`. The queue outside this
    # run is real, it is what Stop would clear, and dropping it from the payload
    # would only move the surprise later.
    lo, hi = run.get("from"), run.get("to")
    r_shift, r_mgr, r_ldr = (run.get("shift"), run.get("manager"),
                             run.get("leader"))
    if lo or hi or r_shift or r_mgr or r_ldr:
        pending_run = _narrow(
            db.query(LeaderAiReview)
            .filter(LeaderAiReview.status.in_(("pending", "error")),
                    LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS),
            date_from=lo, date_to=hi, shift=r_shift,
            manager_id=r_mgr, leader_id=r_ldr,
        ).count()
    else:
        pending_run = pending

    # Rows THIS run has already failed on. A verdict is only counted `done`
    # when it is written, so a batch that errors on every row leaves the bar at
    # 0 and the operator with no way to tell that anything happened at all —
    # which is exactly the case where something happened.
    errors_run = _narrow(
        db.query(LeaderAiReview).filter(LeaderAiReview.status == "error"),
        date_from=lo, date_to=hi, shift=r_shift,
        manager_id=r_mgr, leader_id=r_ldr,
    ).count()

    # A run ends when nothing is left to drain, not when done reaches total: a
    # row can die on `error` after its attempts run out and never be judged, and
    # a bar that waits for it would hang at 97% forever.
    finished = pending_run == 0
    if finished:
        db.delete(row)
        db.commit()

    return {
        "active": not finished,
        "errors": errors_run,
        # THE answer to "it says 0 and nothing is happening": what the drain
        # itself is doing, when it last moved, and when it retries by itself.
        "drain": _drain_state(db),
        "justFinished": finished,
        "total": total,
        "done": min(done, total),
        "pending": pending_run,
        "pendingAll": pending,
        "startedAt": run["started_at"],
        "scope": run.get("scope"),
        "from": run.get("from"),
        "to": run.get("to"),
        # Whose rows this run covers, already resolved to names — the strip
        # says what it is spending on, not just how many.
        "narrow": run.get("narrow") or [],
        "by": run.get("by"),
    }


@router.post("/progress/kick")
def kick(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Start draining NOW instead of waiting for the timer.

    Every path that queues work already kicks a drain, so this is not the normal
    way anything runs. It is the way OUT of the three states where the kick was
    swallowed and the queue then sits for up to twenty minutes: the previous
    drain was still finishing, another worker held the advisory lock, or the
    batch broke on a quota that has since reset. Before this, the only cure was
    a restart nobody here can perform.

    Deliberately NOT `/run`: that discovers the whole history first, which is a
    half-minute request. This kicks the existing queue and returns immediately —
    the drain has always been a background thread and reports itself through the
    heartbeat that `/progress` reads.
    """
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "drain": _drain_state(db)}


@router.post("/progress/cancel")
def cancel_run(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Stop whatever is queued and CLEAR it — leaving nothing behind.

    A progress bar with no stop is a bill you cannot decline: the operator who
    queued the whole corpus by mistake can watch it spend and not intervene.

    Unfinished work is disposed of by what it would cost to lose, which is two
    different things wearing one status:

    * **Never judged** → DELETED outright. The row is re-creatable from its own
      `ref` by the next discovery, so nothing is lost, and deleting beats the
      old behaviour of parking it as `skipped` — that left permanent debris in
      the coverage denominator, so the bar could never read 100% again.
    * **Judged before, re-queued by a re-check** → RESTORED to the verdict it
      already had (`flagged` when it carries flags, else `ok`). Deleting those
      would throw away a real answer that the re-check had not yet replaced.

    Existing `skipped` rows from the earlier behaviour are swept by the same
    rule, so one press also cleans up after the old one.

    Works whenever anything is queued — not only during a run somebody started
    from this page. The timer drain and a sheet Refresh both queue work too, and
    "stop it" has to mean all of it.
    """
    doomed = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "skipped")))
        .all()
    )
    deleted = restored = 0
    for rev in doomed:
        if rev.reviewed_at is None:
            db.delete(rev)
            deleted += 1
        else:
            # Its previous verdict is still on the row — `recheck` only flipped
            # `status`, it never cleared the reasons or the flags. So putting
            # the status back is a complete restoration, not an approximation.
            rev.status = "flagged" if rev.flags else "ok"
            rev.attempts = 0
            restored += 1

    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is not None:
        db.delete(row)
    db.commit()
    log.info("LEADER-AI queue cleared by %s: %s deleted, %s restored",
             admin.get("telegram_id"), deleted, restored)
    return {"ok": True, "deleted": deleted, "restored": restored,
            "cleared": deleted + restored, "counts": leader_ai.counts(db)}


class ClearIn(BaseModel):
    """The slice of AI history to delete, plus where review should resume."""
    date_from: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    shift: int | None = Field(None, ge=1, le=2)
    manager_id: int | None = Field(None, ge=1)
    leader_id: int | None = Field(None, ge=1)
    # Which verdicts to throw away. `all` is the honest default for "clear the
    # history": a wipe that quietly spared the flagged rows would leave the
    # triage queue full of decisions about photos whose verdicts no longer
    # exist anywhere else.
    scope: str = Field("all", pattern="^(all|flagged|clean|unjudged)$")
    # Resolved rows carry a HUMAN ruling. Deleting one throws away work a person
    # did, and it is never the thing somebody means by "clear the AI history",
    # so it takes its own deliberate tick.
    include_resolved: bool = False
    # Where review resumes. Sent explicitly (never derived from the range),
    # because the floor is what makes a wipe permanent: discovery back-fills
    # everything ever filed, so without it the next drain re-inserts exactly
    # what was just deleted and re-spends the quota judging it. "" lifts the
    # floor entirely — the one shape that re-opens all history.
    floor: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    set_floor: bool = True
    dry_run: bool = False


@router.post("/history/clear")
def clear_history(body: ClearIn, db: Session = Depends(get_db),
                  admin: dict = Depends(verify_admin)):
    """Delete AI verdicts and set where review starts again.

    **Why this is a button and not a migration.** The reviewer's criteria get
    reworked, and every verdict written under the old ones is an answer to a
    question nobody asks any more — not corrupt data, just stale, and
    indistinguishable from a live verdict on the page. Until now the only cure
    was a flag-guarded purge in `app/startup.py`, i.e. a code push plus a
    restart, performed by someone with repo access at the moment the operator
    noticed. The people who run the plant have neither.

    **Deleting without moving the floor is a no-op with a bill attached.**
    `discover()` back-fills every report ever filed, so a wipe alone is undone
    on the next pass — and then re-judged, at quota. That is why `floor` rides
    in the same request and defaults to on: one action, one outcome.

    Two protections, both deliberate:

    * **Admin-only, never grantable.** `verify_admin` tests the JWT role
      itself, so this sits outside the per-profile capability system exactly
      like the DB restore does. Everything else on this router is already
      admin-only; this is the one that cannot be widened later by a grant.
    * **Resolved rows survive by default.** A resolution is a person's ruling,
      and the calibration stats measure human-vs-machine agreement over
      precisely those rows. Taking them needs `include_resolved`.

    `dry_run` counts without touching anything — a confirm that cannot say how
    much it is about to destroy is a confirm nobody can answer.
    """
    def _scoped(q):
        return _narrow(q, date_from=body.date_from, date_to=body.date_to,
                       shift=body.shift, manager_id=body.manager_id,
                       leader_id=body.leader_id)

    q = _scoped(db.query(LeaderAiReview))
    if body.scope == "flagged":
        q = q.filter(LeaderAiReview.status == "flagged")
    elif body.scope == "clean":
        q = q.filter(LeaderAiReview.status == "ok")
    elif body.scope == "unjudged":
        # Queue debris — never judged, so nothing is lost and discovery re-finds
        # it. The cheap way out of "40 rows have been stuck for a week".
        q = q.filter(LeaderAiReview.status.in_(("pending", "error", "skipped")))

    resolved_hit = q.filter(LeaderAiReview.resolution.isnot(None)).count()
    if not body.include_resolved:
        q = q.filter(LeaderAiReview.resolution.is_(None))

    n = q.count()
    if body.dry_run:
        return {"ok": True, "deleted": n, "resolved": resolved_hit,
                "dryRun": True, "floor": leader_ai.floor_date(db)}

    n = q.delete(synchronize_session=False)
    db.commit()

    floor = leader_ai.floor_date(db)
    if body.set_floor:
        floor = leader_ai.set_floor(db, body.floor)

    who = (admin.get("full_name") or admin.get("username")
           or str(admin.get("telegram_id") or "admin"))
    log.info("LEADER-AI history cleared by %s: %s row(s) (scope=%s, %s..%s, %s, "
             "resolved=%s) floor=%s",
             who, n, body.scope, body.date_from or "*", body.date_to or "*",
             " · ".join(_narrow_labels(db, body.shift, body.manager_id,
                                       body.leader_id)) or "everyone",
             "included" if body.include_resolved else "kept", floor or "none")
    return {"ok": True, "deleted": n, "floor": floor,
            "counts": leader_ai.counts(db)}


# How many finished verdicts the detail view hands over. The feed answers "what
# has it been doing", which is a question about the recent past — a thousand
# rows would not make it a better answer, only a slower one.
ACTIVITY_CAP = 200


@router.get("/activity")
def activity(limit: int = Query(60, ge=1, le=ACTIVITY_CAP),
             since: str | None = Query(None),
             db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """WHOSE data has been reviewed, and what came of it.

    The progress strip could only ever report arithmetic: a percentage, a
    remainder, an ETA. None of that answers the question anybody actually has
    while quota is being spent — *whose reports are being judged right now, and
    what is it deciding about them?* This is the payload behind tapping it.

    Three readings of the same set, because they answer different questions:

    * `people` — one row per leader, so "has this unit been covered" is a look
      rather than a scroll through a feed.
    * `recent` — the newest verdicts in order, which is the only view where a
      run that has gone wrong (every row flagged, every row errored) is
      obvious.
    * `totals` — what the window holds overall.

    `since` defaults to the active run's start, so the view is scoped to what is
    happening now; with no run it falls back to the last 24 hours, which is the
    window "what did it do overnight" asks about. Rows are keyed off
    `reviewed_at`, so this is strictly what the MACHINE did — a human resolution
    does not put a row back in the feed.
    """
    import json

    if not gemini.available():
        return {"enabled": False, "people": [], "recent": [], "totals": {}}

    started = None
    run = None
    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is not None:
        try:
            run = json.loads(row.value)
            started = run.get("started_at")
        except Exception:
            run = None
    if since:
        started = since
    try:
        cutoff = (datetime.fromisoformat(started) if started
                  else datetime.now(timezone.utc) - timedelta(hours=24))
    except Exception:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    judged = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.reviewed_at.isnot(None),
                LeaderAiReview.reviewed_at >= cutoff)
        .order_by(LeaderAiReview.reviewed_at.desc())
        .limit(ACTIVITY_CAP)
        .all()
    )

    # Names resolved by the SAME projection the triage queue uses, so one person
    # is never two names across two screens. Light pass — no photos, no report
    # JSON: this view is polled while a run is live.
    proj = _project(db, judged)

    people: dict[tuple, dict] = {}
    recent: list[dict] = []
    totals = {"judged": 0, "flagged": 0, "clean": 0, "errors": 0}
    for rev in judged:
        p = proj[rev.ref]
        clean = rev.status == "ok"
        bad = rev.status == "flagged"
        totals["judged"] += 1
        totals["flagged"] += bad
        totals["clean"] += clean
        totals["errors"] += rev.status == "error"

        key = (rev.leader_id, p["leader"])
        slot = people.setdefault(key, {
            "leaderId": rev.leader_id, "leader": p["leader"],
            "supervisor": p["supervisor"], "shift": rev.shift,
            "rows": 0, "flagged": 0, "clean": 0, "errors": 0,
            "days": set(), "lastAt": None,
        })
        slot["rows"] += 1
        slot["flagged"] += bad
        slot["clean"] += clean
        slot["errors"] += rev.status == "error"
        slot["days"].add(rev.date)
        at = rev.reviewed_at.isoformat() if rev.reviewed_at else None
        if at and (slot["lastAt"] is None or at > slot["lastAt"]):
            slot["lastAt"] = at

        if len(recent) < limit:
            recent.append({
                "ref": rev.ref, "leader": p["leader"],
                "supervisor": p["supervisor"], "taskLabel": p["task"],
                "taskId": rev.task_id, "date": rev.date, "shift": rev.shift,
                "source": rev.source, "status": rev.status,
                "flags": rev.flags or [], "error": rev.error,
                "reviewedAt": at,
                # A ruling already taken on this verdict, so the feed does not
                # present a decided flag as if it still needed deciding.
                "resolution": rev.resolution,
            })

    rows = sorted(
        ({**v, "days": len(v["days"])} for v in people.values()),
        # Most flags first, then most rows: the unit worth opening is the one
        # with the decisions behind it, and an alphabetical list buries it.
        key=lambda r: (-r["flagged"], -r["rows"], str(r["leader"])),
    )

    return {
        "enabled": True,
        "model": gemini.active_model(),
        "since": cutoff.isoformat(),
        # Whether this window IS the run, or the fallback 24h — the caption over
        # the list says which, and guessing wrong makes "0 reviewed" read as
        # "broken" when it means "nothing has run since yesterday".
        "scoped": bool(started),
        "run": {"scope": run.get("scope"), "from": run.get("from"),
                "to": run.get("to"), "narrow": run.get("narrow") or [],
                "by": run.get("by")} if run else None,
        "floor": leader_ai.floor_date(db),
        "totals": totals,
        "people": rows,
        "recent": recent,
        "capped": len(judged) >= ACTIVITY_CAP,
    }


@router.post("/retry")
def retry(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Give exhausted rows their attempts back. The usual cause of a stuck row
    is a fixable server-side condition (photo permissions, a missing bot token),
    so there has to be a way to re-run them without touching the database."""
    n = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "error")
        .update({"attempts": 0, "status": "pending"}, synchronize_session=False)
    )
    db.commit()
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "reset": n}
