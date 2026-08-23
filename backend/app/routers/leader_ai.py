"""AI proof-review endpoints for the leader monitoring page.

**Reading a verdict is for everyone the register shows the row to; acting on
the reviewer is admin-only.** Two reads — `overview`'s "is the reviewer on"
bit and `report`'s per-task verdicts — take the `/leaders` page and the row's
own scope (`report_scope_ok`, the same rule the day report and its photos
use), so a brigadir or a leader sees the review result on their own rows
exactly as an admin does: the amber flag chip, the checked / flagged cells and
the verdict strip inside each task card. This started as an admin-only pilot;
once a flag began costing points automatically, hiding the verdict from the
two people it costs was the wrong default. Everything that queues, re-checks,
resolves, configures or purges stays behind `verify_admin`.

Verdicts are read in three shapes:

* `overview` — queue state and the reviewer's own numbers, for the admin's
  strip and tab. Every other viewer receives the `enabled` bit alone: their
  per-report counts already ride on `/api/leaders` as `row.ai`, scoped to the
  rows they may see.
* `report` — every verdict of ONE report, fetched when its detail modal opens.
* `queue` — the review feed: one flat list of every JUDGED proof in the chosen
  period — flagged and clean, decided and undecided — with the photos, the
  window and the criteria all inlined. This is what makes review a queue
  instead of a hunt through the register, and it is the only read that carries
  enough to decide without a second request.

  It was once the *unresolved flags* alone, which made the tab a worklist and
  nothing else: a proof the AI cleared, and a flag somebody had already ruled
  on, both vanished the moment they stopped being work. "Was this day even
  looked at", "what did I decide last week", "show me a leader's actual
  photos" had no answer anywhere in the app. So the feed now carries the whole
  judged set and `state` narrows it back down — `state=open` is exactly the
  old queue, one pick away.

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
from sqlalchemy.orm import Session, load_only

from app.database import get_db
from app.models import (
    AppSetting, LeaderAiReview, LeaderChecklist, LeaderTaskDay, LeaderTaskDef,
    LeaderTaskEntry, LeaderTaskLeaderSetting, LeaderTaskMedia, LeaderTaskSetting,
    Manager, RoleProfile,
)
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, gemini, leader_ai, leader_tasks
from app.services.name_map import (
    leader_match, relabel_supervisor, supervisor_match, unit_display_names,
)

router = APIRouter(prefix="/api/leader-ai", tags=["leader-ai"])
log = logging.getLogger(__name__)

# How far the queue's own scan reaches. It no longer walks flags alone: a clean
# verdict is a row too, and a factory filing ~13 tasks × ~90 leaders puts a
# thousand rows in a single day. The pass over these is column-projected (see
# `_scan`) precisely so the ceiling could be raised — carrying four languages
# of verdict prose through 12 000 rows to count facets is what made 4 000 the
# old limit.
SCAN_CAP = 12000

# How much of the queue one read hands over. The rail is a continuous list an
# admin walks with J/K, so this is a first helping, not a page: «Ko'proq» asks
# for another `PAGE` on top and the whole thing stays ONE list under one cursor.
# A pager would have been cheaper and wrong — J stopping dead at row 150 breaks
# the only interaction this screen exists for.
PAGE = 150
QUEUE_CAP = 1200


@router.get("/overview")
def overview(db: Session = Depends(get_db),
             payload: dict = Depends(require_page("leaders"))):
    """Queue state and the reviewer's own numbers — the admin's strip and tab.

    Any viewer of the page may ask, and learns ONE thing: whether the reviewer
    is on at all, which is what lets the register show its verdict cells and
    the modal its verdict strips instead of an empty «0 / 12 checked» under a
    reviewer that will never run. Everything else here is platform-wide (the
    queue, the run floor, calibration) — the admin's operational view, and no
    part of what a leader's or a brigadir's own rows say. Their per-report
    counts, including the unresolved-flag count the row chip prints, already
    ride on `/api/leaders` as `row.ai` (`leader_ai.stats_by_uid`), scoped to
    the rows they may see; the flag map that used to be resolved here for the
    same chip was a second spelling of the same number and is gone.
    """
    if not gemini.available():
        return {"enabled": False, "counts": {}}
    if payload.get("role") != "admin":
        return {"enabled": True}

    # The date verdict is DERIVED (clocks + report day + task window), and this
    # is the entry point to every AI surface — so bring it up to date before a
    # single number is counted. Normally a no-op scan writing nothing; after a
    # window edit or a Refresh that moved reports to other days, this is what
    # makes the correction visible without anyone re-running the AI.
    leader_ai.sync_date_flags(db)

    return {
        "enabled": True,
        "model": gemini.active_model(),
        "counts": leader_ai.counts(db),
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

    **FLAGGED rows only, and that is not an oversight.** Rulings on clean rows
    are now possible (the review tab shows them), but the sense of every verb
    above inverts there: on a clean verdict it is APPROVE that agrees with the
    machine and REJECT that overrules it. Pouring both through one rule would
    score every confirmed-clean proof as a disagreement and quietly halve the
    rate. If clean rows are ever to count, they need their own arm, not this one.
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
           payload: dict = Depends(require_page("leaders"))):
    """Every verdict for one report, keyed by task id — what the detail modal
    renders inside each task card.

    Page-gated, then ROW-scoped for anyone but an admin: the same
    `report_scope_ok` the day report, its photos and its disputes answer to,
    so a supervisor reads verdicts on their own unit's reports and a leader on
    their own — exactly the rows the register already lists for them, and not
    one more (a uid is guessable; the row scope is what makes that harmless).
    404 rather than 403, as the day report does: a probe must not learn which
    uids name a real report in another unit.
    """
    if not gemini.available():
        return {"enabled": False, "tasks": {}}

    if payload.get("role") != "admin":
        # Lazy, like leader_reports: routers/leaders imports the leader_ai
        # SERVICE at module load, and this router is loaded beside it.
        from app.routers.leaders import build_report_row, report_scope_ok
        row = build_report_row(db, uid)
        if row is None or not report_scope_ok(db, payload, row):
            raise HTTPException(status_code=404, detail="No such report")

    refs = _refs_for_uid(db, uid)
    if not refs:
        return {"enabled": True, "tasks": {}}

    revs = db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(refs.keys())).all()
    cfg = _task_cfg(db, revs)
    out = {str(refs[rev.ref]): _as_verdict(rev, _window(cfg, rev),
                                           _date_check(cfg, rev),
                                           _time_check(cfg, rev),
                                           _date_plus(cfg, rev))
           for rev in revs}
    return {"enabled": True, "tasks": out}


# ── buckets ──────────────────────────────────────────────────────────────────
# The queue's own bucket set: the four flag bands, plus `clean` for a verdict
# that found nothing wrong. `bucket_of` cannot answer for a clean row — it reads
# FLAGS, and an empty flag list falls through its last branch to «undone», which
# would file every clean proof on the page under "not done".
QUEUE_BUCKETS = (*leader_ai.BUCKETS, "clean")


def _bucket(rev: LeaderAiReview) -> str:
    return "clean" if rev.status == "ok" else leader_ai.bucket_of(rev.flags)


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
    # The tab strip is a filter like any other, evaluated in the same pass. It
    # used to be applied in the BROWSER, over whatever the page cap happened to
    # ship — so the cap had to hand every band a guaranteed share or a tab
    # reading «3» opened onto an empty rail. Server-side, a tab is simply its
    # own query, and that whole balancing act is gone.
    "bucket":     lambda rev, p: _bucket(rev),
    # What the HUMAN said, as opposed to what the AI said. A rejected fake is
    # both `forged` and `rejected`, so the two can never share one control.
    # NULL reads as «open» so the dimension has a value on every row — a facet
    # is a count, and a None option is one nobody can pick.
    "state":      lambda rev, p: rev.resolution or "open",
}


def _dim_ok(dim: str, want, rev, p) -> bool:
    if want is None:
        return True
    got = _DIMS[dim](rev, p)
    return want in got if isinstance(got, list) else got == want


@router.get("/queue")
def queue(limit: int = Query(PAGE, ge=1, le=QUEUE_CAP),
          offset: int = Query(0, ge=0),
          date_from: str | None = Query(None),
          date_to: str | None = Query(None),
          leader: str | None = Query(None),
          supervisor: str | None = Query(None),
          task_id: int | None = Query(None),
          shift: int | None = Query(None),
          flag: str | None = Query(None),
          bucket: str | None = Query(None),
          state: str | None = Query(None),
          db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """The review feed — every judged proof in the period, with enough context
    inlined to rule on it.

    One request, no follow-ups: the reviewer's whole job is "look at the photo,
    compare its clock to the window, decide", and every one of those needs to be
    on screen at once. Splitting the criteria or the leader's own answer into a
    second call is what turned the old flow into a hunt.

    **Scope is `flagged` + `ok` — judged rows.** `pending` and `error` are
    deliberately absent: they have no verdict to read, so a card for one would
    be a photo under four empty questions, and the three decision buttons would
    be recording an opinion about an answer nobody has given yet. The progress
    bar above the tab already reports them as a number, which is the honest
    shape for work that has not happened.

    **Filtering is server-side, and it has to be.** The page ships at most
    `limit` rows out of a set that can run to thousands, so a filter applied to
    what the browser happens to hold would answer "this leader's proofs" with
    "this leader's proofs among the ones that fit" — and on an old date it would
    answer "none" for a day with forty. Every dimension is therefore evaluated
    over the whole scanned set, tab strip included.

    `facets` ships the option lists with counts, each dimension tallied against
    every OTHER active filter. Picking a leader narrows the task list to that
    leader's tasks, so no option in the panel is ever a dead end — and because
    `bucket` is one of those dimensions, the tab counts come from the same pass:
    a tab reading «333» beside a four-row rail is not a filter, it is a bug.
    """
    if not gemini.available():
        return {"enabled": False, "items": [], "buckets": {}, "facets": {}}

    q = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("flagged", "ok")))
        # Column-projected: this pass exists to COUNT, and the four language
        # columns of verdict prose are the heaviest thing on the row. The page
        # slice re-reads its own rows whole (`_full`).
        .options(load_only(
            LeaderAiReview.ref, LeaderAiReview.date, LeaderAiReview.task_id,
            LeaderAiReview.leader_id, LeaderAiReview.manager_id,
            LeaderAiReview.shift, LeaderAiReview.status, LeaderAiReview.flags,
            LeaderAiReview.resolution,
        ))
    )
    # `date` is a 'YYYY-MM-DD' string, so a lexical compare IS a date compare —
    # and it narrows BEFORE the scan cap, which is the point: the newest rows of
    # the chosen days, not the chosen days out of the newest 12 000.
    if date_from:
        q = q.filter(LeaderAiReview.date >= date_from)
    if date_to:
        q = q.filter(LeaderAiReview.date <= date_to)
    rows = (q.order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.desc())
            .limit(SCAN_CAP).all())

    proj = _project(db, rows)
    picked = {"leader": leader, "supervisor": supervisor,
              "task": task_id, "shift": shift, "flag": flag,
              "bucket": bucket, "state": state}

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

    # The tab strip reads its numbers out of the facet pass, NOT out of `kept` —
    # `bucket` is a filter now, so counting the survivors would leave every tab
    # but the open one reading zero, and the strip would stop being a way back.
    buckets: dict[str, int] = {b: facets["bucket"].get(b, 0) for b in QUEUE_BUCKETS}

    # ONE order: newest first. The feed is a register as much as a worklist —
    # "what came in today" is the question you arrive with — and the severity
    # order that used to sit behind a toggle is now covered by the bucket strip,
    # which narrows to the worst band instead of just floating it to the top.
    page = kept[offset:offset + limit]

    def _opts(dim: str) -> list[dict]:
        """Busiest first — the option worth picking is the one with the work
        behind it, and an alphabetical list of 90 leaders buries it."""
        items = [{"v": v, "n": n} for v, n in facets[dim].items()]
        items.sort(key=lambda it: (-it["n"], str(it["v"])))
        return items

    return {
        "enabled": True,
        "items": _hydrate(db, _full(db, page), proj),
        "buckets": buckets,
        "total": len(kept),
        # The rail asks for more of the SAME list rather than turning a page, so
        # what it needs to know is only whether the list has run out.
        "hasMore": offset + len(page) < len(kept),
        "facets": {
            **{d: _opts(d) for d in ("leader", "supervisor", "shift", "flag", "state")},
            # The label a task carries can differ per unit (a supervisor may
            # rename it), so the option is keyed by id and labelled with the
            # first wording seen — newest report first.
            "task": [{**o, "label": task_labels.get(o["v"], f"#{o['v']}")}
                     for o in _opts("task")],
        },
        # Said out loud rather than silently truncated: past this many rows the
        # scan itself is capped, so the counts become a floor.
        "scanCapped": len(rows) >= SCAN_CAP,
    }


def _full(db: Session, rows: list[LeaderAiReview]) -> list[LeaderAiReview]:
    """Re-read the page's rows with every column loaded, order preserved.

    The scan above is column-projected — it walks up to `SCAN_CAP` rows to build
    the facet counts, and dragging four languages of verdict prose through that
    pass is exactly what kept the old ceiling at 4 000. Only the page needs the
    whole record, and the page is at most `limit` rows.

    `populate_existing` is not optional: these objects are already in the
    session's identity map with their text columns deferred, so a plain re-query
    hands back the same half-loaded instances and every `reason_*` read after it
    becomes a lazy round-trip per row.
    """
    if not rows:
        return []
    refs = [r.ref for r in rows]
    full = {r.ref: r for r in db.query(LeaderAiReview)
            .filter(LeaderAiReview.ref.in_(refs)).populate_existing().all()}
    return [full[ref] for ref in refs if ref in full]


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


def _levels(cfg, rev):
    """This row's three config rows, narrowest first — the chain both date-rule
    resolvers below walk."""
    defs, sup_cfg, own_cfg = cfg
    return (own_cfg.get((rev.leader_id, rev.task_id)) if rev.leader_id else None,
            sup_cfg.get((rev.manager_id, rev.task_id)) if rev.manager_id else None,
            defs.get(rev.task_id))


def _window(cfg, rev) -> tuple[str, str]:
    """The task's effective photo window, off the same preloaded chain. Same
    resolution as services/leader_ai.date_rule_for, which is the per-row form —
    the triage queue would otherwise pay three queries a card for it."""
    return leader_ai.resolve_window(rev.shift, *_levels(cfg, rev))


def _date_check(cfg, rev) -> bool:
    """Is the date question asked for this row's task? Off the same chain, for
    the same reason — and it travels with `_window` everywhere, because a window
    shown without it is a rule the reader cannot tell is enforced."""
    return leader_ai.resolve_date_check(*_levels(cfg, rev))


def _time_check(cfg, rev) -> bool:
    """And is the CLOCK judged, or only the day? The third of the three that
    travel together — with this False the window above is not a rule either, so
    no surface may print it as one (see leader_ai.resolve_time_check)."""
    return leader_ai.resolve_time_check(*_levels(cfg, rev))


def _date_plus(cfg, rev) -> int:
    """And how many days AFTER the report's may the proof be dated? The fourth
    of the four that travel together (services/leader_ai.date_rule_for): the
    window, the two questions and this tolerance name ONE accepted set between
    them, so a card printing three of them prints a rule nobody was judged by."""
    return leader_ai.resolve_date_plus(*_levels(cfg, rev))


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

    **The names are the REGISTER's names — the same strings `/api/leaders`
    ships for the same source row.** The `/leaders` page keys people by name:
    its leader and supervisor pickers hold exactly what the register put on its
    rows, and every tab — this queue included — is filtered by that one pick.
    So a queue row labelled by any other rule is a row the picker can never
    reach: the queue used to print a sheet row's leader as the SHEET spelt it
    (`ABDURASULOV YULDASH …`), the register resolves the same row to the
    PROFILE name (`Abdurasulov Yuldash`), and picking that leader on the page
    answered «no rows match» over a queue holding forty of theirs. The rule,
    per source (see `routers/leaders.get_leaders` + `leader_bot.dashboard_rows`):

    * sheet row — supervisor: the relabelled sheet spelling; leader: the
      PROFILE the (spelling, unit) pair resolves to, else the raw spelling.
      Resolved LIVE, not read off the review's stamped `leader_id`: that id was
      matched at discovery, and a profile created since (or a pin added to
      `_LEADER_PINS`) moves the register's name while the stamp stays put.
    * bot row — leader: the profile name; supervisor: the spelling the sheet
      most often uses for the unit (`unit_display_names`), else Manager.name.
    * a review whose source row is gone — the stamped ids, same labels; the
      register has no such row, so there is nothing for it to disagree with.
    """
    if not rows:
        return {}

    cfg = _task_cfg(db, rows)
    prof_ids = {r.leader_id for r in rows if r.leader_id}
    profs = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
             .filter(RoleProfile.id.in_(prof_ids)).all()} if prof_ids else {}
    # The whole roster, not the referenced units: the sheet's «Бригадир ФИО»
    # resolves to a unit by fuzzy match over every manager, as the register does.
    managers = db.query(Manager).all()
    mgrs = {m.id: m.name for m in managers}

    # Columns only: the `tasks` JSONB on these rows is the whole report and
    # none of it is needed here.
    scope = _sheet_scope(rows)
    sheet = (db.query(LeaderChecklist.date, LeaderChecklist.leader,
                      LeaderChecklist.supervisor, LeaderChecklist.submission_id)
             .filter(scope).all()) if scope is not None else []
    has_bot = any(r.ref.startswith("bot:") for r in rows)

    # One census of the sheet's supervisor spellings — the whole sheet, so the
    # unit a spelling resolves to and the label a unit carries never depend on
    # which rows happen to be in scope. A grouped count: ~50 distinct spellings
    # out of thousands of rows.
    census = (db.query(LeaderChecklist.supervisor, func.count(LeaderChecklist.id))
              .group_by(LeaderChecklist.supervisor).all()) if (sheet or has_bot) else []
    sup_match = supervisor_match(
        managers, {relabel_supervisor(s) for s, _ in census if s})
    sup_display = unit_display_names(sup_match, census) if has_bot else {}
    lead_match = leader_match(
        db.query(RoleProfile.id, RoleProfile.name, RoleProfile.manager_id)
        .filter(RoleProfile.role == "leader").all(),
        {(l, (sup_match.get(relabel_supervisor(s)) or {}).get("id"))
         for _, l, s, _ in sheet if l},
    ) if sheet else {}

    by_key: dict[tuple[str, str], tuple[str, str]] = {}
    by_sub: dict[str, tuple[str, str]] = {}
    for d, ldr, sup, sub in sheet:
        sup_lbl = relabel_supervisor(sup)
        who = lead_match.get((ldr, (sup_match.get(sup_lbl) or {}).get("id"))) or {}
        pair = (who.get("name") or ldr, sup_lbl)
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
        # name IS the name the register prints — no entry→day walk needed here.
        if not leader and rev.leader_id in profs:
            leader = profs[rev.leader_id]
        if not supervisor and rev.manager_id in mgrs:
            supervisor = sup_display.get(rev.manager_id) or mgrs[rev.manager_id]
        out[rev.ref] = {
            "leader": leader or "—",
            "supervisor": supervisor or "—",
            "task": _label(cfg, rev),
        }
    return out


def _hydrate(db: Session, rows: list[LeaderAiReview],
             proj: dict[str, dict]) -> list[dict]:
    """Attach names, photos and the leader's own answer to each verdict.

    Everything is batch-loaded: a 300-row queue that walked one query per row
    would be the slowest read on the platform.

    `proj` is `_project` over a superset of `rows` — the names come from THERE,
    never re-derived here. The rail prints these strings and the page's leader
    picker filters on them, so a second resolution rule inside the hydrator is
    a rail whose names the picker cannot find (which is exactly what happened
    while this function spelt a sheet row's leader as the sheet did).
    """
    if not rows:
        return []

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
        task: dict = {}
        photos: list[dict] = []
        uid = None

        if rev.ref.startswith("bot:"):
            entry = entries.get(int(rev.ref.split(":")[1]))
            if entry is not None:
                uid = f"bot-{entry.day_id}"
                task = {"done": bool(entry.done), "reason": entry.reason}
                photos = [{"kind": "bot", "id": mid} for mid in media.get(entry.id, [])]
        else:
            parts = rev.ref.split(":")
            row = (by_submission.get(parts[1]) if rev.ref.startswith("sheet:")
                   else sheet_rows.get((rev.date, parts[2] if len(parts) > 3 else "")))
            if row is not None:
                uid = leader_ai.row_uid(row)
                tk = next((t for t in (row.tasks or [])
                           if int(t.get("id") or 0) == rev.task_id), None)
                if tk:
                    task = {"done": bool(tk.get("done")), "reason": tk.get("reason")}
                    photos = [{"kind": "sheet", "url": p.strip()}
                              for p in (tk.get("photo") or "").split(",")
                              if "http" in p]

        names = proj.get(rev.ref) or {}
        win = _window(cfg, rev)
        checked, timed = _date_check(cfg, rev), _time_check(cfg, rev)
        plus = _date_plus(cfg, rev)
        lo, hi = leader_ai.date_window(rev.date, rev.shift, win, plus)
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
            "leader": names.get("leader") or "—",
            "supervisor": names.get("supervisor") or "—",
            "flags": rev.flags or [],
            "status": rev.status,
            "bucket": _bucket(rev),
            # The human ruling rides along with the verdict now that the feed
            # carries decided rows: the card has to open showing what was
            # decided, by whom and when, or re-deciding one is a blind edit.
            "resolution": rev.resolution,
            "resolvedBy": rev.resolved_by,
            "resolvedAt": rev.resolved_at.isoformat() if rev.resolved_at else None,
            "resolutionNote": rev.resolution_note,
            "imageDate": rev.image_date,
            "clocks": rev.clocks or [],
            # What the row was actually measured against — the window, the DAY
            # alone on a task judged by the day, and NULL when the task is exempt
            # from the date question entirely. A card printing a window beside an
            # unjudged clock is how a reviewer starts "correcting" verdicts nobody
            # made; printing one on a date-only task is the same mistake quieter.
            "expected": (None if not checked
                         else f"{lo} — {hi}" if timed
                         else ", ".join(leader_ai.date_days(
                             rev.date, plus, rev.shift, win))),
            "dateCheck": checked,
            "timeCheck": timed,
            "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
            # The date sentence is OURS, not the model's — it no longer knows
            # the window, and prose it wrote would go stale on the next window
            # edit. Rendered beside `reason`, which now covers topic and proof
            # only.
            "dateReason": leader_ai.date_prose(rev.clocks, rev.date, win,
                                               check=checked, times=timed,
                                               plus=plus, shift=rev.shift),
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
    # A CLEAN verdict is rulable too. The machine finding nothing wrong is a
    # recommendation, not a finding of fact — an admin who can see a photo the
    # model was happy with must be able to reject it, or the AI's clean pass
    # becomes the last word on a leader's score. What stays unrulable is a row
    # with no verdict at all: `pending` and `error` have nothing to agree or
    # disagree with, and a `rejected` written onto one would dock a day on the
    # strength of a judgement nobody has made.
    if rev.status not in ("flagged", "ok"):
        raise HTTPException(status_code=400,
                            detail="Only a judged verdict can be resolved")

    who = (admin.get("full_name") or admin.get("username")
           or str(admin.get("telegram_id") or "admin"))[:160]
    # WHAT the machine found is half the ruling: «approved» means nothing
    # without the flag it overruled, and the flags go with the verdict when the
    # row is re-derived later.
    was = rev.resolution
    lines = [("leader", rev.leader_id), ("task", rev.task_id),
             ("verdict", ", ".join(str(f) for f in (rev.flags or [])) or "clean")]

    # A ruling written here overrules whatever a dispute decided on the same
    # verdict, so the dispute row retires with it — otherwise the day report
    # keeps printing «objection upheld» beside a task that just lost its weight
    # again. Local import: routers/leaders.py owns the dispute tables.
    from app.routers.leaders import supersede_dispute

    if body.resolution == "open":
        rev.resolution = None
        rev.resolved_by = None
        rev.resolved_at = None
        rev.resolution_note = None
        supersede_dispute(db, rev.ref, None, who)
        db.commit()
        log.info("leader-ai: %s reopened %s", who, rev.ref)
        action_log.enrich(
            target_kind="verdict", target_id=rev.ref, unit_id=rev.manager_id,
            day=rev.date, details=lines,
            changes=[("status", was or "open", "open")],
        )
        return {"ok": True, "ref": rev.ref, "resolution": None,
                "reported": _rescore_day(db, rev),
                "counts": leader_ai.counts(db)}

    rev.resolution = body.resolution
    rev.resolved_by = who
    rev.resolved_at = datetime.now(timezone.utc)
    rev.resolution_note = (body.note or "").strip()[:1000] or None
    supersede_dispute(db, rev.ref, body.resolution, who)
    db.commit()
    log.info("leader-ai: %s ruled %s on %s", who, rev.resolution, rev.ref)
    action_log.enrich(
        target_kind="verdict", target_id=rev.ref, unit_id=rev.manager_id,
        day=rev.date, reason=rev.resolution_note, details=lines,
        changes=[("status", was or "open", rev.resolution)],
    )

    if body.resolution in ("rejected", "requeried"):
        _notify_leader(db, rev)
    return {"ok": True, "ref": rev.ref, "resolution": rev.resolution,
            "reported": _rescore_day(db, rev),
            "counts": leader_ai.counts(db)}


def _rescore_day(db: Session, rev: LeaderAiReview) -> bool:
    """A ruling in the automatic regime can MOVE the day's score after its
    report was already sent — an approved flag hands the weight back, a
    rejection on a clean pass takes more away. Both audiences were told a
    number; leaving them with a stale one is how the first message stops being
    believed.

    `resend_if_changed` owns the comparison, so "changed" means exactly the
    same thing here as it does in the drain. Outside the automatic regime, and
    for a day no report was ever sent for, this does nothing at all."""
    from app.services import leader_reports
    if not leader_ai.in_auto_regime(rev.date, rev.shift):
        return False
    uid = leader_reports.uid_of_ref(db, rev.ref)
    return leader_reports.resend_if_changed(db, uid) if uid else False


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
        # Never queued — the usual case before the first Refresh has run, and
        # the normal case for a paused shift, which nothing queues on its own.
        # Queue THIS report only: a full discover() walks every report ever
        # filed and would turn one button press into a half-minute request.
        #
        # `force`: this endpoint IS the human door the shift pause leaves open
        # (see leader_ai.REVIEW_PAUSED_SHIFTS). An admin who opens one report
        # and presses «check» on one photo is not the machine deciding to spend
        # — and the verdict is written by `review_one` below, never by the
        # drain, so the pause on the queue is untouched by it.
        leader_ai.queue_report(db, force=True, **_report_target(db, body.uid))
        rev = db.query(LeaderAiReview).filter_by(ref=ref).first()
    if rev is None:
        raise HTTPException(status_code=404, detail="Nothing to review for this task")
    win, checked, timed, plus = leader_ai.date_rule_for(
        db, rev.task_id, rev.manager_id, rev.leader_id, rev.shift)
    if rev.status in ("ok", "flagged") and not body.force:
        # No call was made and no quota spent — the register says so, or the row
        # reads as a review that produced the same answer twice.
        action_log.enrich(
            target_kind="verdict", target_id=ref, unit_id=rev.manager_id,
            day=rev.date,
            details=[("leader", rev.leader_id), ("task", rev.task_id),
                     ("report", body.uid), ("note", "cached")],
        )
        return {"ok": True,
                "task": _as_verdict(rev, win, checked, timed, plus)}  # already judged; never re-spend

    # An admin asking again IS the retry — give a burned-out row its attempts back.
    rev.attempts = 0
    try:
        leader_ai.review_one(db, rev)
    except gemini.GeminiQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    db.refresh(rev)
    action_log.enrich(
        target_kind="verdict", target_id=ref, unit_id=rev.manager_id,
        day=rev.date,
        details=[("leader", rev.leader_id), ("task", rev.task_id),
                 ("report", body.uid), ("status", rev.status),
                 ("verdict", ", ".join(str(f) for f in (rev.flags or []))
                  or "clean")]
                + ([("mode", "force")] if body.force else []),
    )
    return {"ok": True, "task": _as_verdict(rev, win, checked, timed, plus)}


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


def _as_verdict(rev: LeaderAiReview, win: tuple[str, str] | None = None,
                check: bool = True, times: bool = True, plus: int = 0) -> dict:
    # `win` is the task's effective photo window, `check` whether the date is
    # judged at all, `times` whether the CLOCK is judged or only the day, and
    # `plus` how many days after the report's the proof may be dated; callers
    # that hold the preloaded config chain pass all four rather than making this
    # re-walk the chain.
    lo, hi = leader_ai.date_window(rev.date, rev.shift, win, plus)
    return {
        "status": rev.status,
        "flags": rev.flags or [],
        "imageDate": rev.image_date,
        "clocks": rev.clocks or [],
        # What the verdict was measured against, from the SAME functions the
        # checker used — a date flag is only actionable if you can see what the
        # photo was supposed to satisfy, and a second copy of the rule in the
        # client would eventually disagree with the backend. Three shapes, one
        # field: the window when hours are judged, the DAY alone when only the
        # day is, and NULL when the task is exempt (nothing was measured).
        "expected": (None if not check
                     else f"{lo} — {hi}" if times
                     else ", ".join(leader_ai.date_days(
                         rev.date, plus, rev.shift,
                         win or leader_ai.shift_window(rev.shift)))),
        "dateCheck": check,
        "timeCheck": times,
        "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
        "dateReason": leader_ai.date_prose(
            rev.clocks, rev.date, win or leader_ai.shift_window(rev.shift),
            check=check, times=times, plus=plus, shift=rev.shift),
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
    was = (row.value or "") if row is not None else ""
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
    action_log.enrich(
        target_kind="setting", target_id=gemini.MODEL_SETTING,
        changes=[("model", was or "default", name)],
    )
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
        # THAT it changed, never what it is. A secret in the action register is
        # a secret in every export of that register.
        action_log.enrich(target_kind="setting", target_id=gemini.KEY_SETTING,
                          details=[("key", "cleared")])
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
    # Same rule as the log line above: the length, and nothing else.
    action_log.enrich(target_kind="setting", target_id=gemini.KEY_SETTING,
                      details=[("key", "set"), ("size", len(raw))])

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
    """Drain what is already queued. Queues NOTHING.

    This was the last bulk submitter on the platform. It ran a full
    `discover()` — a walk of every report ever filed — behind a button captioned
    «AI tekshiruvi», with no count shown first and no confirm: one press turned
    thousands of never-asked-for reports into a queue, the 20-minute drain then
    spent quota on all of them, and because this endpoint writes no run record
    the progress strip could only report the queue as something that had started
    itself. Three separate automatic submitters were removed (the timer's
    discovery, the sheet Refresh, setting the API key); this one survived
    because it was behind a press, which is not the same thing as being asked
    for.

    Submission now has exactly one door: «Tekshirish» → scope «Tekshirilmagan»,
    which counts the work first, shows the number, and asks. The endpoint stays,
    drain-only, so a cached client pressing an old button moves the queue
    instead of growing it.

    Returns immediately — a backlog takes far longer than a request may — so the
    page polls `progress`.
    """
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")
    leader_ai.run_async(discover_first=False)
    # Drain-only by design: it moves the queue and adds nothing to it, which is
    # exactly the fact the register has to carry — the strip's numbers would
    # otherwise be read as this press having submitted them.
    action_log.enrich(target_kind="batch", target_id="drain",
                      details=[("scope", "queued"), ("count", 0)])
    return {"ok": True, "queued": 0, "counts": leader_ai.counts(db)}


def _narrow(q, *, date_from: str | None = None, date_to: str | None = None,
            shift: int | None = None, manager_id: int | None = None,
            leader_id: int | None = None, task_ids: list[int] | None = None):
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

    `task_ids` is a SET, not a single pick, because the errand it serves is
    "task 8's definition of done changed" and tasks come in groups — so the
    modal offers checkboxes and this takes the list. `None` means every task; an
    EMPTY list means none, and is filtered as such rather than skipped. That
    direction is deliberate: a request that ticked nothing must queue nothing,
    never the whole corpus.
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
    if task_ids is not None:
        q = q.filter(LeaderAiReview.task_id.in_(task_ids))
    return q


def _narrow_labels(db: Session, shift: int | None, manager_id: int | None,
                   leader_id: int | None,
                   task_ids: list[int] | None = None) -> list[str]:
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
    # Last, because it is the narrowest — the caption reads in the same
    # coarse-to-fine order the modal's controls do.
    if task_ids:
        # NUMBERS, not names. A task's wording can run to a full sentence and
        # differ per unit, and this caption sits in a strip beside a date range
        # and two people's names — «#3, #8» is what an operator recognises and
        # what fits. A long pick is summarised rather than wrapped.
        ids = sorted(task_ids)
        head = ", ".join(f"#{i}" for i in ids[:4])
        out.append(head if len(ids) <= 4 else f"{head} +{len(ids) - 4}")
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
    # WHICH TASKS, as a set — the axis the who-filters could not reach. The
    # commonest reason to re-check anything is that ONE task's definition of
    # done was rewritten, and without this the only way to re-earn those
    # verdicts was to re-check all thirteen tasks of every report in the range
    # and pay for the twelve nobody touched.
    #
    # None = every task. An empty list is honoured as "none" (see `_narrow`),
    # so a client that sends its checkboxes with nothing ticked queues nothing
    # rather than the corpus.
    task_ids: list[int] | None = None
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


def _scope_lines(db: Session, body: "RecheckIn") -> list[tuple]:
    """What a run was pointed AT, in the same words the log line uses.

    A run is only readable afterwards through its scope: «1,222 queued» says
    nothing about whether somebody re-checked one brigadir's week or the whole
    corpus, and those are the two things an admin needs to tell apart when the
    quota is gone.
    """
    lines = [("scope", body.scope),
             ("period", f"{body.date_from or '*'} … {body.date_to or '*'}")]
    labels = _narrow_labels(db, body.shift, body.manager_id, body.leader_id,
                            body.task_ids)
    lines.append(("target", " · ".join(labels) if labels else "all"))
    return lines


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

    # Normalised ONCE, on the model, so the query, the run record, the caption
    # and the log line all read the same pick. Junk ids are dropped rather than
    # matched: they can only come from a stale client, and `.in_()` over a
    # thousand duplicates is a slower way of asking the same question.
    if body.task_ids is not None:
        body.task_ids = sorted({t for t in body.task_ids if t > 0})

    def _scoped(q):
        return _narrow(q, date_from=body.date_from, date_to=body.date_to,
                       shift=body.shift, manager_id=body.manager_id,
                       leader_id=body.leader_id, task_ids=body.task_ids)

    # A paused shift (leader_ai.REVIEW_PAUSED_SHIFTS) is excluded from both
    # branches below — re-queueing rows the drain refuses to take would leave
    # them `pending` forever and a run that can never reach 100%. Reported back
    # so the modal can say WHY nothing was queued: for a shift the operator just
    # picked out of a facet showing its row count, «nothing to check» is true
    # and useless.
    paused_pick = leader_ai.review_paused(body.shift)

    # ── "catch up": never-judged rows only ───────────────────────────────────
    # Nothing is overwritten, so there is no verdict to lose and no confirm to
    # earn. `discover()` runs even for the dry run: a report filed since the
    # last pass has no row yet, and counting only what is already queued would
    # under-report exactly the work the operator came here to start. Discovery
    # inserts `pending` rows — it spends no quota, the drain does that.
    if body.scope == "unchecked":
        found = leader_ai.discover(db)
        n = _scoped(
            db.query(LeaderAiReview).filter(LeaderAiReview.status == "pending",
                                            ~leader_ai.paused_clause())
        ).count()
        if body.dry_run:
            # Nothing was queued and nothing spent — but somebody asked what it
            # would cost, and that is the press that precedes every big run.
            action_log.enrich(
                target_kind="batch", target_id="recheck",
                details=_scope_lines(db, body) + [("count", n),
                                                  ("added", found),
                                                  ("mode", "dry_run")],
            )
            return {"ok": True, "requeued": n, "found": found, "dryRun": True,
                    "paused": paused_pick}
        _start_run(db, n, body, admin)
        log.info("LEADER-AI catch-up by %s: %s pending (%s new) in %s..%s [%s]",
                 admin.get("telegram_id"), n, found,
                 body.date_from or "*", body.date_to or "*",
                 " · ".join(_narrow_labels(db, body.shift, body.manager_id,
                                           body.leader_id,
                                           body.task_ids)) or "all")
        leader_ai.run_async(discover_first=False)
        action_log.enrich(
            target_kind="batch", target_id="recheck", unit_id=body.manager_id,
            details=_scope_lines(db, body) + [("count", n), ("added", found)],
        )
        return {"ok": True, "requeued": n, "found": found,
                "paused": paused_pick, "counts": leader_ai.counts(db)}

    # ── re-check: throw away a verdict and earn it again ─────────────────────
    q = _scoped(db.query(LeaderAiReview).filter(
        LeaderAiReview.status.in_(("ok", "flagged")),
        LeaderAiReview.resolution.is_(None),
    ))
    if body.scope == "flagged":
        q = q.filter(LeaderAiReview.status == "flagged")
    elif body.scope == "clean":
        q = q.filter(LeaderAiReview.status == "ok")
    held = q.filter(leader_ai.paused_clause()).count() if leader_ai.REVIEW_PAUSED_SHIFTS else 0
    q = q.filter(~leader_ai.paused_clause())

    if body.dry_run:
        would = q.count()
        action_log.enrich(
            target_kind="batch", target_id="recheck",
            details=_scope_lines(db, body) + [("count", would),
                                              ("mode", "dry_run")],
        )
        return {"ok": True, "requeued": would, "dryRun": True,
                "paused": paused_pick}

    n = q.update({"status": "pending", "attempts": 0}, synchronize_session=False)
    db.commit()
    _start_run(db, n, body, admin)
    log.info("LEADER-AI recheck by %s: %s rows (scope=%s, %s..%s, %s)%s",
             admin.get("telegram_id"), n, body.scope,
             body.date_from or "*", body.date_to or "*",
             " · ".join(_narrow_labels(db, body.shift, body.manager_id,
                                       body.leader_id,
                                       body.task_ids)) or "everyone",
             # Said out loud, not inferred from a smaller number than expected.
             f" — {held} held back, shift "
             f"{'/'.join(map(str, leader_ai.REVIEW_PAUSED_SHIFTS))} paused" if held else "")
    leader_ai.run_async(discover_first=False)
    # A re-check DESTROYS verdicts and re-spends on them, so the count is the
    # headline of the row, and `skipped` says out loud what a paused shift held
    # back rather than leaving a smaller number to be inferred.
    action_log.enrich(
        target_kind="batch", target_id="recheck", unit_id=body.manager_id,
        details=_scope_lines(db, body) + [("count", n)]
                + ([("skipped", held)] if held else []),
    )
    return {"ok": True, "requeued": n, "paused": paused_pick,
            "counts": leader_ai.counts(db)}


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
        # Normalised to None when it names every task or none: the drain reads
        # a truthy list as a confinement, so an empty one would mark the run
        # "narrowed" and then narrow nothing.
        "tasks": body.task_ids or None,
        "narrow": _narrow_labels(db, body.shift, body.manager_id, body.leader_id,
                                 body.task_ids),
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
                  tasks: str | None = Query(None, pattern=r"^(none|\d+(,\d+)*)$"),
                  db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """What the chosen SLICE actually holds, and how much of it is already
    checked — plus the option lists for narrowing it further.

    Answers the question an operator has with their finger over a button that
    spends metered quota: *is this the slice I think it is, and how much of it
    is already done?* Until this existed the modal could only say how many rows
    a given scope would queue — a number with no denominator, which tells you
    the price but not what you are buying.

    The slice is dates, who (`shift` / `manager_id` / `leader_id`) and WHICH
    TASKS (`tasks`, a comma-separated set — one repeated query parameter would
    have to survive a client's array serialisation, and this one is read by
    exactly one caller), because that is what the modal now offers; every number
    below moves with all of them, so the summary can never describe a wider set
    than the button will queue.

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

    # A pick naming every task in the catalog is no narrowing at all — kept as
    # None so the counts, the run record and the drain all see one shape for
    # "everything" no matter which control produced it.
    catalog = leader_tasks.ensure_task_defs(db)
    task_ids = _task_pick(tasks, catalog)

    def _scoped(q):
        return _narrow(q, date_from=date_from, date_to=date_to, shift=shift,
                       manager_id=manager_id, leader_id=leader_id,
                       task_ids=task_ids)

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
                 leader_id=leader_id, task_ids=task_ids)
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
        "tasks": task_ids,
        "reports": {"total": len(per_report), "checked": checked,
                    "partial": partial, "unchecked": unchecked,
                    "approx": approx},
        "rows": rows,
        "openFlags": open_flags,
        "facets": _range_facets(db, date_from, date_to, shift,
                                manager_id, leader_id, task_ids,
                                census["rows"], catalog),
    }


def _task_pick(raw: str | None, catalog) -> list[int] | None:
    """The `tasks=3,8` query parameter as a list of ids, or None for "all".

    Three answers, and the third is why this is spelled out rather than left to
    an empty string: absent = every task, a list = those tasks, and the literal
    «none» = no task at all, which is the operator having unticked everything.
    A blank parameter could not carry that — the client drops empty query values
    (`utils/api.js`), so «none» would arrive as «all» and the summary would
    describe the whole range under a button that is refusing to run.

    Ids outside the catalog are DROPPED rather than passed through: they can
    only come from a stale client, they would match nothing, and a filter that
    silently matches nothing is indistinguishable on screen from a range with no
    work in it. A pick naming every task collapses to None, so one shape means
    "everything" no matter which control produced it.
    """
    if not raw:
        return None
    if raw == "none":
        return []
    known = {td.id for td in catalog}
    ids = sorted({int(p) for p in raw.split(",")} & known)
    return None if ids and len(ids) == len(known) else ids


def _who(census_rows, *, shift=None, manager_id=None, leader_id=None,
         task_ids=None, skip: str | None = None):
    """Narrow census rows by unit/leader/shift/task, optionally ignoring ONE
    dimension.

    `skip` is what lets a picker count itself out, the same rule the SQL facets
    follow: counting the leader list against the leader already chosen leaves it
    holding only that leader, with no way back to anyone else short of clearing
    the filter.
    """
    out = []
    for row in census_rows:
        sh, mgr, ldr, task = row[1], row[2], row[3], row[4]
        if shift is not None and skip != "shift" and sh != shift:
            continue
        if manager_id is not None and skip != "manager" and mgr != manager_id:
            continue
        if leader_id is not None and skip != "leader" and ldr != leader_id:
            continue
        # `task_ids` is a list and an EMPTY one means "nothing ticked", so it is
        # tested for None rather than for truth — the same rule `_narrow` gives
        # the SQL side, and the two halves of one count have to agree.
        if task_ids is not None and skip != "task" and task not in task_ids:
            continue
        out.append(row)
    return out


def _range_facets(db: Session, date_from: str | None, date_to: str | None,
                  shift: int | None, manager_id: int | None,
                  leader_id: int | None, task_ids: list[int] | None,
                  census_rows, catalog) -> dict:
    """Option lists for the shift / brigadir / leader / task pickers, with
    counts.

    Four grouped aggregates, no projection pass: `shift`, `manager_id`,
    `leader_id` and `task_id` are stamped on the row at discovery, so the count
    beside a name is computed from the very column the filter tests. That
    self-consistency is the point — the number the operator reads beside
    «Aripova M.» is exactly how many proof rows picking her will reach, never an
    estimate from a different resolution path.

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
    IDX = {"shift": 1, "manager": 2, "leader": 3, "task": 4}

    def _tally(col, dim, **fixed):
        rows = (_narrow(db.query(col, func.count(LeaderAiReview.id)),
                        date_from=date_from, date_to=date_to, **fixed)
                .filter(col.isnot(None)).group_by(col).all())
        n_by_v = {v: n for v, n in rows}
        for row in _who(census_rows, shift=shift, manager_id=manager_id,
                        leader_id=leader_id, task_ids=task_ids, skip=dim):
            v = row[IDX[dim]]
            if v is not None:
                n_by_v[v] = n_by_v.get(v, 0) + 1
        return sorted(({"v": v, "n": n} for v, n in n_by_v.items()),
                      key=lambda o: (-o["n"], str(o["v"])))

    shifts = _tally(LeaderAiReview.shift, "shift",
                    manager_id=manager_id, leader_id=leader_id,
                    task_ids=task_ids)
    mgrs = _tally(LeaderAiReview.manager_id, "manager",
                  shift=shift, leader_id=leader_id, task_ids=task_ids)
    ldrs = _tally(LeaderAiReview.leader_id, "leader",
                  shift=shift, manager_id=manager_id, task_ids=task_ids)
    # The task list is the one facet that ships its EMPTY options too, and it
    # is ordered by task number rather than busiest-first. Both are because it
    # is rendered as a fixed column of checkboxes: an operator looking for
    # «task 8» reads down the numbers, and a row that vanishes when the count
    # hits zero is a list that rearranges itself under the thumb between two
    # date presses. A task with nothing to re-check says «0» in place.
    counted = {o["v"]: o["n"] for o in _tally(
        LeaderAiReview.task_id, "task",
        shift=shift, manager_id=manager_id, leader_id=leader_id)}

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
        # Labelled from the GLOBAL catalog, not per unit. A supervisor may
        # rename a task for their own leaders, but this pick crosses units by
        # construction — one row here can stand for six wordings, and the
        # catalog name is the one an admin configured them all from.
        "task": [{"v": td.id, "n": counted.get(td.id, 0),
                  "label": _first_name(td) or f"#{td.id}"} for td in catalog],
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


# ── how fast the drain is ACTUALLY going ─────────────────────────────────────
#
# The ETA used to be the run's own average — `left ÷ (done ÷ (now − started))`.
# That divides the work by the whole LIFE of the run, and a run's life is mostly
# not spent reviewing: a spent quota parks it until Google's cap rolls over, a
# push to `main` restarts the unit mid-drain, and a pass that cannot chain waits
# on the 20-minute timer. So a backfill the drain would finish in four hours
# read as «about 4 d left» — twenty of the previous twenty-five hours had been
# waiting, and an average cannot tell waiting from working.
#
# The pace is therefore measured over the RECENT past instead, off the verdict
# timestamps themselves, and it answers two different questions:
#
#   wall   = (n−1) ÷ (now − oldest sampled verdict)
#            Verdicts per second including every pause inside the window AND the
#            gap since the last one. That trailing gap is the load-bearing part:
#            a drain that stops makes its own ETA grow, minute by minute,
#            instead of freezing at a pace it is no longer keeping — and when it
#            resumes, the window slides forward and the number recovers inside
#            one batch.
#
#   active = k ÷ Σ(gaps ≤ _PACE_ACTIVE_GAP_S)
#            The same verdicts, counting only the stretches where one actually
#            followed another — i.e. what the remaining rows COST, as opposed to
#            when they will land. "Four hours of work spread over four days" is
#            two facts, and an operator deciding whether to wait or to go and
#            raise the quota needs both of them.
#
# Neither is extrapolated from a handful of rows: under `_PACE_MIN` samples
# there is no number at all, because an ETA off the first verdict swings by
# hours and teaches people to ignore the number for good.
#
# Nothing here models rows JOINING the run (`grew`). They arrive in STEPS — a
# sheet Refresh, a day-close, a backlog one-shot — and a step read as a rate is
# a worse lie than the one this replaces. The strip says «+N joined» instead,
# which is the honest form of that fact.
_PACE_SAMPLE = 60          # verdicts in the trailing window
_PACE_MIN = 4              # below this the window says nothing
_PACE_ACTIVE_GAP_S = 180   # a longer gap is the drain not working, not slow work
# Past this the drain is not working at all and «47 d» is noise wearing the
# costume of an estimate. The drain line directly under it already says which
# state it is in, which is the actionable half.
_PACE_MAX_ETA_S = 30 * 86400


def _pace(db: Session, started: datetime, slice_kw: dict, left: int) -> dict | None:
    """The two paces above, and what they were measured from.

    Reads at most `_PACE_SAMPLE` timestamps, scoped to the run exactly as every
    other number on the strip is — a run narrowed to one brigadir must not be
    timed by verdicts written for somebody else, or its ETA describes a drain
    it is not watching.
    """
    if left <= 0:
        return None
    rows = (
        _narrow(
            db.query(LeaderAiReview.reviewed_at)
            .filter(LeaderAiReview.reviewed_at.isnot(None),
                    LeaderAiReview.reviewed_at >= started),
            **slice_kw,
        )
        .order_by(LeaderAiReview.reviewed_at.desc())
        .limit(_PACE_SAMPLE)
        .all()
    )
    # Oldest → newest. A column stored `timezone=True` still comes back naive
    # from some drivers; a naive stamp subtracted from an aware `now` raises,
    # and the whole poll would 500 over a formatting detail.
    stamps = sorted(
        (r[0] if r[0].tzinfo else r[0].replace(tzinfo=timezone.utc))
        for r in rows if r[0] is not None
    )
    if len(stamps) < _PACE_MIN:
        return None
    now = datetime.now(timezone.utc)
    span = (now - stamps[0]).total_seconds()
    if span <= 0:
        return None

    # (n−1), not n: the window opens ON the oldest sample, so the verdicts it
    # actually contains are the ones after it. Counting the boundary event would
    # make the wall pace beat the active pace on a drain with no gaps at all,
    # and then "of that, N is real work" would print a number LARGER than the
    # ETA it is a part of.
    wall = (len(stamps) - 1) / span

    active_s = 0.0
    active_n = 0
    for a, b in zip(stamps, stamps[1:]):
        d = (b - a).total_seconds()
        if 0 < d <= _PACE_ACTIVE_GAP_S:
            active_s += d
            active_n += 1
    active = (active_n / active_s) if active_n and active_s > 0 else None

    eta_s = left / wall if wall > 0 else None
    if eta_s is not None and eta_s > _PACE_MAX_ETA_S:
        eta_s = None
    # `active` can only be ≥ `wall` — dropping the idle stretches raises the
    # rate — so this is never the longer of the two, which is what lets the
    # strip print it beside the headline without contradicting it.
    work_s = left / active if active else None

    return {
        "etaS": round(eta_s) if eta_s is not None else None,
        "workS": round(work_s) if work_s is not None else None,
        "n": len(stamps),
        "spanS": round(span),
        "perMin": round(wall * 60, 2),
        "activePerMin": round(active * 60, 2) if active else None,
        # Share of the measured window in which nothing was produced — the one
        # number that says WHY the two figures differ.
        "idlePct": round(max(0.0, 1 - active_s / span) * 100),
    }


@router.get("/progress")
def progress(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """How far the current run has got. Polled by the page while a run is live.

    `done` counts rows JUDGED SINCE the run started rather than "total minus
    pending", because pending also grows on its own — a leader closing a bot day
    mid-run would otherwise make the bar go backwards, which reads as a bug even
    when the work is fine.

    **`total` is re-derived on every poll as `done + left`, never below the
    number the run was recorded with.** The recorded total is a snapshot of the
    queue at the start, and the queue keeps growing while a run is live — a bot
    day-close, a sheet Refresh, a Retry all add rows the drain WILL walk under
    this very run. With the snapshot frozen, the strip sat at «13 of 13 · 100%»
    beside «1,222 left» for as long as those rows took: the bar measured one
    leader's close, the remainder measured the whole queue, and nothing on
    screen connected them. Now `done + left = total` holds every time it is
    read, so the percentage, the ETA and the remainder describe one thing, and
    the growth ships as `grew` so the strip can SAY the queue grew instead of
    letting the bar drop from 100% to 1% unexplained.

    Deliberately cheap COUNT queries and no joins: this is polled every few
    seconds for as long as a backfill takes.
    """
    import json

    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    pending = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS,
                # Only what the drain will actually take: a paused shift's rows
                # are queue debris, and counting them would park the strip at
                # «40 queued» with nothing ever working through them.
                ~leader_ai.paused_clause())
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

    # The run's slice — dates and who — applied to EVERY number below, so done,
    # left and errors are three readings of one set. `done` used to be counted
    # over the whole table: a run narrowed to one brigadir would tick up when an
    # admin pressed «check now» on somebody else's row, and its bar could pass
    # 100% of a slice it had not finished. Records written before the who-keys
    # existed carry none, and `_narrow` reads a missing key as "no narrowing".
    lo, hi = run.get("from"), run.get("to")
    r_shift, r_mgr, r_ldr = (run.get("shift"), run.get("manager"),
                             run.get("leader"))
    # `or None` for the same reason the drain reads it that way: an empty list
    # would filter every row out and leave the bar reading 0 of a run that is
    # working fine.
    r_tasks = run.get("tasks") or None
    slice_kw = dict(date_from=lo, date_to=hi, shift=r_shift,
                    manager_id=r_mgr, leader_id=r_ldr, task_ids=r_tasks)

    done = _narrow(
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.reviewed_at.isnot(None),
                LeaderAiReview.reviewed_at >= started),
        **slice_kw,
    ).count()

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
    if lo or hi or r_shift or r_mgr or r_ldr or r_tasks:
        pending_run = _narrow(
            db.query(LeaderAiReview)
            .filter(LeaderAiReview.status.in_(("pending", "error")),
                    LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS,
                    # Same rule as the global figure above: the run ends when
                    # the drain has nothing left it can take.
                    ~leader_ai.paused_clause()),
            **slice_kw,
        ).count()
    else:
        pending_run = pending

    # THE invariant the strip is built on: done + left = total. The recorded
    # total is only the queue as it stood when the run began, and it is a floor,
    # not the answer — rows keep joining a live run (a leader's day-close, a
    # sheet Refresh, a Retry), the drain walks them under this same record, and
    # a total that ignored them left the bar full while the remainder counted
    # in the thousands. Whatever came in after the start is `grew`, and it is
    # shipped rather than swallowed: a bar that falls from 100% to 1% is a bug
    # unless the strip says what arrived.
    total0 = max(1, int(run.get("total") or 1))
    total = max(total0, done + pending_run)
    grew = total - total0

    # Rows THIS run has already failed on. A verdict is only counted `done`
    # when it is written, so a batch that errors on every row leaves the bar at
    # 0 and the operator with no way to tell that anything happened at all —
    # which is exactly the case where something happened.
    errors_run = _narrow(
        db.query(LeaderAiReview).filter(LeaderAiReview.status == "error"),
        **slice_kw,
    ).count()

    # A run ends when nothing is left to drain, not when done reaches total: a
    # row can die on `error` after its attempts run out and never be judged, and
    # a bar that waits for it would hang at 97% forever.
    finished = pending_run == 0
    # THE ETA (see `_pace`): measured over the pace the drain is keeping NOW,
    # never averaged across every hour the run spent parked on a spent quota.
    # Skipped on the poll that ends the run — there is nothing left to time.
    pace = None if finished else _pace(db, started, slice_kw, pending_run)
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
        # Rows that joined this run after it started — the difference between
        # the bar the run began with and the bar it is walking now.
        "grew": grew,
        "pending": pending_run,
        "pendingAll": pending,
        "startedAt": run["started_at"],
        # How long it has left, and how much of that is work rather than
        # waiting. Always PRESENT (null when there is not enough to say), so a
        # client can tell "no estimate" from "this backend predates the field"
        # and never falls back to the average that made a four-hour queue read
        # as four days.
        "pace": pace,
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
    # Queues nothing by construction — it only starts the drain earlier than
    # the timer would.
    action_log.enrich(target_kind="batch", target_id="drain",
                      details=[("scope", "queued"), ("count", 0)])
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
    # Stopping is a real change, not a pause: never-judged rows are gone (and
    # re-discoverable) while re-checked ones went back to the verdict they had.
    action_log.enrich(
        target_kind="batch", target_id="run",
        details=[("scope", "all"), ("count", deleted + restored),
                 ("removed", deleted), ("changed", restored)],
    )
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
        action_log.enrich(
            target_kind="batch", target_id="history",
            details=[("scope", body.scope), ("count", n),
                     ("mode", "dry_run")],
        )
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
    # Irreversible, and the FLOOR is the half that makes it permanent: without
    # it discovery re-inserts everything just deleted. Both go on the row.
    action_log.enrich(
        target_kind="batch", target_id="history", unit_id=body.manager_id,
        details=[("scope", body.scope), ("count", n),
                 ("period", f"{body.date_from or '*'} … {body.date_to or '*'}"),
                 ("target", " · ".join(_narrow_labels(
                     db, body.shift, body.manager_id, body.leader_id))
                     or "all"),
                 ("from_date", floor or "—"),
                 ("verdict", "resolved included" if body.include_resolved
                  else "resolved kept")],
    )
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
        # The other half of the answer, as one cheap COUNT: work SUBMITTED and
        # not yet judged. Everything above reads `reviewed_at`, so a queue
        # nobody chose to submit is invisible here — and that is the queue
        # somebody wants named. The census itself is one tab away rather than
        # in this payload, because this one is polled every few seconds.
        "queuedCount": (
            db.query(LeaderAiReview)
            .filter(LeaderAiReview.status.in_(("pending", "error")),
                    LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS)
            .count()
        ),
    }


# One read of the queue, bounded. Newest-queued first, so what the cap drops is
# the oldest debt and never the submission somebody is standing here asking
# about.
QUEUE_SCAN_CAP = 8000


@router.get("/activity/queue")
def activity_queue(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """WHOSE work is queued for review but not yet judged — and when it was sent.

    `/activity` answers what the reviewer has DECIDED. It reads `reviewed_at`,
    so a queue of two thousand rows nobody meant to submit does not appear in it
    at all: the operator watching quota drain gets a percentage and a list of
    finished verdicts, and cannot name one report that is about to be paid for.
    That is exactly the view wanted when a submission looks larger than anyone
    intended — by the time a row reaches `recent`, its quota is already spent.

    So this is the same table read from the other end: `pending` rows and
    `error` rows with retries left, grouped by the person whose data it is,
    carrying the report dates covered and the moment each was queued.

    `bursts` is the forensic half, and the reason this endpoint exists. Every
    row stamps `created_at` when it is discovered, so a bulk submit is a SPIKE:
    one minute holding two thousand rows is one press of one button, and the
    timestamp names it. Reports arriving normally are ones and twos spread
    across a day. Without this the only evidence of what happened is the size of
    the queue — the one fact that cannot tell those two apart.
    """
    if not gemini.available():
        return {"enabled": False, "groups": [], "bursts": [], "dates": [],
                "totals": {}}

    rows = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS)
        .order_by(LeaderAiReview.id.desc())
        .limit(QUEUE_SCAN_CAP + 1)
        .all()
    )
    capped = len(rows) > QUEUE_SCAN_CAP
    rows = rows[:QUEUE_SCAN_CAP]
    if not rows:
        return {"enabled": True, "groups": [], "bursts": [], "dates": [],
                "totals": {"tasks": 0, "reports": 0, "leaders": 0,
                           "supervisors": 0}, "capped": False}

    # Same name resolution as every other AI surface, so one person is never two
    # names across two screens.
    proj = _project(db, rows)

    # A bot ref names an ENTRY; the report it belongs to is that entry's day.
    day_of: dict[int, int] = {}
    entry_ids = {int(r.ref.split(":")[1]) for r in rows if r.ref.startswith("bot:")}
    if entry_ids:
        day_of = dict(
            db.query(LeaderTaskEntry.id, LeaderTaskEntry.day_id)
            .filter(LeaderTaskEntry.id.in_(entry_ids)).all()
        )

    groups: dict[tuple, dict] = {}
    bursts: dict[str, dict] = {}
    dates: dict[str, dict] = {}
    all_reports: set[str] = set()
    first_at = last_at = None

    for rev in rows:
        p = proj[rev.ref]
        rk = leader_ai.report_key(rev.ref, day_of)
        all_reports.add(rk)
        at = rev.created_at.isoformat() if rev.created_at else None
        if at:
            if first_at is None or at < first_at:
                first_at = at
            if last_at is None or at > last_at:
                last_at = at

        # ── per person ───────────────────────────────────────────────────────
        key = (p["supervisor"], p["leader"], rev.leader_id, rev.shift)
        g = groups.setdefault(key, {
            "supervisor": p["supervisor"], "leader": p["leader"],
            "leaderId": rev.leader_id, "shift": rev.shift,
            "tasks": 0, "errors": 0, "bot": 0, "sheet": 0,
            "_reports": set(), "_days": set(),
            "from": None, "to": None, "queuedFirst": None, "queuedLast": None,
        })
        g["tasks"] += 1
        g["errors"] += rev.status == "error"
        g["bot" if rev.source == "bot" else "sheet"] += 1
        g["_reports"].add(rk)
        g["_days"].add(rev.date)
        if g["from"] is None or rev.date < g["from"]:
            g["from"] = rev.date
        if g["to"] is None or rev.date > g["to"]:
            g["to"] = rev.date
        if at:
            if g["queuedFirst"] is None or at < g["queuedFirst"]:
                g["queuedFirst"] = at
            if g["queuedLast"] is None or at > g["queuedLast"]:
                g["queuedLast"] = at

        # ── per minute queued: the spike that names the trigger ──────────────
        if at:
            # Keyed by the minute, but carrying a WHOLE timestamp for display:
            # `created_at` is timezone-aware, and an ISO string sliced to
            # "…T09:32" has lost its offset — the browser would then read a UTC
            # stamp as local and print a burst five hours off, which is the one
            # number in this view that has to be exact.
            minute = at[:16]
            b = bursts.setdefault(minute, {
                "at": at, "tasks": 0, "_reports": set(), "_leaders": set()})
            b["tasks"] += 1
            b["_reports"].add(rk)
            b["_leaders"].add(p["leader"])

        # ── per REPORT date: the literal "which dates" answer ────────────────
        d = dates.setdefault(rev.date, {"date": rev.date, "tasks": 0,
                                        "_reports": set(), "_leaders": set()})
        d["tasks"] += 1
        d["_reports"].add(rk)
        d["_leaders"].add(p["leader"])

    def _shed(rec: dict, **counts) -> dict:
        out = {k: v for k, v in rec.items() if not k.startswith("_")}
        out.update(counts)
        return out

    group_rows = sorted(
        (_shed(g, reports=len(g["_reports"]), days=len(g["_days"]))
         for g in groups.values()),
        # Biggest first: the point of the list is which unit the submission
        # actually landed on, and an alphabetical one buries it.
        key=lambda r: (-r["tasks"], str(r["supervisor"]), str(r["leader"])),
    )
    burst_rows = sorted(
        (_shed(b, reports=len(b["_reports"]), leaders=len(b["_leaders"]))
         for b in bursts.values()),
        key=lambda r: -r["tasks"],
    )[:8]
    date_rows = sorted(
        (_shed(d, reports=len(d["_reports"]), leaders=len(d["_leaders"]))
         for d in dates.values()),
        key=lambda r: r["date"], reverse=True,
    )

    return {
        "enabled": True,
        "totals": {
            "tasks": len(rows),
            "reports": len(all_reports),
            "leaders": len({g["leader"] for g in groups.values()}),
            "supervisors": len({g["supervisor"] for g in groups.values()}),
            "days": len(dates),
            "from": min(dates) if dates else None,
            "to": max(dates) if dates else None,
            "queuedFirst": first_at,
            "queuedLast": last_at,
        },
        "groups": group_rows,
        "bursts": burst_rows,
        "dates": date_rows,
        # Said out loud. A census that silently stops at 8 000 reads as "that is
        # the whole queue", which is the one thing it must not do here.
        "capped": capped,
        "cap": QUEUE_SCAN_CAP,
    }


@router.post("/retry")
def retry(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Give exhausted rows their attempts back. The usual cause of a stuck row
    is a fixable server-side condition (photo permissions, a missing bot token),
    so there has to be a way to re-run them without touching the database."""
    n = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "error",
                # A paused shift's rows are not retried — the drain would not
                # take them, so `reset: n` would promise a retry that never
                # happens and leave the rows sitting `pending` instead of
                # visibly stuck.
                ~leader_ai.paused_clause())
        .update({"attempts": 0, "status": "pending"}, synchronize_session=False)
    )
    db.commit()
    leader_ai.run_async(discover_first=False)
    # Rows that had given up and are now queued again — the count IS the scope
    # here, since the errand is «everything that errored».
    action_log.enrich(target_kind="batch", target_id="retry",
                      details=[("scope", "error"), ("count", n)])
    return {"ok": True, "reset": n}
