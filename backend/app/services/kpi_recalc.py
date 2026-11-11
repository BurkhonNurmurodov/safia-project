"""«Qayta hisoblash» — the ONE door that brings every source of «Liderlar KPI»
up to date (2026-11-11).

The operator, the same day: «Everything should be automatically calculated
when the page is open … The HR won't have any idea if they have to press these
buttons», then «Add one re-calculate button which reloads everything and shows
up-to-date calculation. Until [then] show the old data». The page had FOUR
admin-only buttons on three tabs, each fetching one source («Verifix'dan
yangilash», «Hisoblash» / «Yangilash», «Verifix'dan o'qish», «Reyestrni
yangilash»), and nothing told a reader which of them a figure was waiting on.
Now one run fetches all of them, in the order they depend on each other:

  1. the Quality register from its Google Sheet (the foreign-objects KPI) —
     seconds, on its own thread beside step 2. The Quality page has no
     scheduled sync at all, so before this the KPI moved only when somebody
     pressed a refresh;
  2. the Verifix directory (turnover) — minutes. For a PAST month
     (`turnover.PAST_FROM` ≤ m < `START_MONTH`) the same read also computes the
     month and saves it, as «Hisoblash» did;
  3. then the Verifix HR journals (category compliance), after the directory
     that places their people — the nightly order, 23:40 then 23:55.

Worker concerns and the technologists' audit read the database as it stands:
there is nothing to fetch for them.

**The page starts a run itself every time it opens** (`auto`: the operator
chose «every time it opens»), and the button starts one whenever pressed.
`auto` skips only what is pointless: a run already under way (joined), or
sources every one of which finished a good read in the last `AUTO_FRESH` — a
re-mount or a month flip a minute after a run would read Verifix again for
nothing. A never-computed past month is computed on `auto`; a SAVED one only
on the button (a saved month's figures do not move by themselves).

The run never blocks a request (`start` returns at once) and never raises; the
page polls `status` and asks for the board again once nothing runs, showing
the old figures until then. A read somebody else started (the nightly one, a
second worker during a deploy swap) is waited for, not doubled: the two reads
refuse to run twice and bring the same data. `on_done` drops the board's kept
answers, so the first request after a run builds from the new data.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import date, timedelta, timezone
from typing import Callable, Optional

from app.database import SessionLocal
from app.models import QualitySyncMeta, SheetSource
from app.services import action_log, category_compliance as cc, category_sync, turnover, turnover_sync

log = logging.getLogger(__name__)

AUTO_FRESH = timedelta(minutes=5)
WAIT_POLL_S = 3.0
QUALITY_SHEET = "quality"     # = routers/quality.SHEET_NAME (a router is not imported from a service)

_lock = threading.Lock()
_run: Optional[dict] = None       # the run under way in THIS process
_last: Optional[dict] = None      # the last one that finished here


def _now():
    return turnover.now_aware()


def _public(run: Optional[dict]) -> Optional[dict]:
    if not run:
        return None
    return {
        "started_at": turnover.iso(run["started_at"]),
        "finished_at": turnover.iso(run.get("finished_at")),
        "auto": run["auto"], "month": run["month"], "steps": dict(run["steps"]),
    }


def _quality_synced_at(db):
    meta = db.query(QualitySyncMeta).filter_by(id=1).first()
    if not meta or not meta.ok or not meta.last_synced:
        return None
    at = meta.last_synced
    return at if at.tzinfo else at.replace(tzinfo=timezone.utc)   # written as UTC (sheets_sync)


def status(db) -> dict:
    """What the page polls: is anything bringing the sources up to date — this
    process's run, or a read started elsewhere (the nightly one, another
    worker) — and how the last run here ended."""
    with _lock:
        run, last = _public(_run), _public(_last)
    tv_running = turnover_sync.running(db)
    cc_running = category_sync.running(db)
    return {
        "running": bool(run) or tv_running or cc_running,
        "run": run, "last": last,
        "reads": {"turnover": tv_running, "compliance": cc_running},
    }


def _all_fresh(db, now) -> bool:
    """Every source finished a GOOD read within `AUTO_FRESH` — a failed one is
    tried again on the next open."""
    tv_ok = turnover.last_read(db, ok_only=True)
    cc_ok = cc.last_read(db, ok_only=True)
    q_at = _quality_synced_at(db)
    stamps = (tv_ok.finished_at if tv_ok else None, cc_ok.finished_at if cc_ok else None, q_at)
    return all(t is not None and now - t < AUTO_FRESH for t in stamps)


def _past_compute(db, m: Optional[date], auto: bool) -> Optional[date]:
    """The past month this run must compute and save, if any: «Hisoblash» on a
    month never computed (also on `auto`), «Yangilash» on a saved one (the
    button only)."""
    if m is None or not (turnover.PAST_FROM <= m < turnover.START_MONTH):
        return None
    state, _row = turnover.month_state(db, m)
    if state == "past" or (state == "saved" and not auto):
        return m
    return None


def start(db, *, month: Optional[date], by: str, auto: bool,
          on_done: Optional[Callable[[], None]] = None) -> dict:
    """Start a run on a thread of its own and return at once. `started` is
    False when one is already under way (the caller then just watches it) or,
    on `auto`, when every source is already fresh."""
    global _run
    compute = _past_compute(db, month, auto)
    with _lock:
        busy = _run is not None
    if busy:
        return {"started": False, "reason": "running", **status(db)}
    if auto and compute is None and _all_fresh(db, _now()):
        return {"started": False, "reason": "fresh", **status(db)}
    # `status` takes `_lock` itself: it is read AFTER the block, never inside
    # it — two pages opening at once race here, and a non-reentrant lock
    # asked for twice by one thread never comes back.
    with _lock:
        lost = _run is not None
        if not lost:
            _run = {
                "started_at": _now(), "finished_at": None, "auto": auto,
                "month": turnover.ym(month) if month else None, "by": by,
                "steps": {"quality": None, "turnover": None, "compliance": None},
            }
    if lost:
        return {"started": False, "reason": "running", **status(db)}
    threading.Thread(target=_work, args=(compute, by, auto, on_done),
                     name="kpi-recalc", daemon=True).start()
    return {"started": True, "reason": None, **status(db)}


def _set(step: str, result: dict) -> None:
    with _lock:
        if _run is not None:
            _run["steps"][step] = result


def _wait_for(running_fn) -> None:
    """A read somebody else started: wait until it has finished (bounded by
    the read's own stale limit, after which `running` reads False anyway)."""
    while True:
        db = SessionLocal()
        try:
            if not running_fn(db):
                return
        finally:
            db.close()
        time.sleep(WAIT_POLL_S)


def _quality() -> dict:
    """The Quality register from its sheet — `routers/quality.refresh_quality`'s
    body, on a session of its own, its failure recorded where the page reads it."""
    from app.services.sheets_sync import sync_quality_sheet

    db = SessionLocal()
    try:
        src = db.query(SheetSource).filter(SheetSource.name == QUALITY_SHEET).first()
        if not src:
            return {"ok": False, "error": "not_configured"}
        out = sync_quality_sheet(src.sheet_id, db)
        action_log.record_system("sync_export", "sync.foreign_refresh", db=None,
                                 details=[("trigger", "recalc"), ("rows", out.get("quality_rows"))])
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001 — a background step reports, never dies silently
        db.rollback()
        log.exception("kpi-recalc: the Quality register sync failed")
        try:
            meta = db.query(QualitySyncMeta).filter_by(id=1).first()
            if not meta:
                meta = QualitySyncMeta(id=1)
                db.add(meta)
            meta.ok = False
            meta.message = str(exc)[:500]
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
        return {"ok": False, "error": str(exc)[:300]}
    finally:
        db.close()


def _read(run_fn, running_fn, *args) -> dict:
    """One Verifix read; joined when another is under way, then run again only
    when this one carries a job of its own (a past month to compute)."""
    res = run_fn(*args)
    if res.get("reason") == "not_configured":
        return {"ok": False, "error": "not_configured"}
    if res.get("reason") == "busy":
        _wait_for(running_fn)
        if len(args) > 1 and args[1] is not None:
            res = run_fn(*args)
        else:
            return {"ok": True, "joined": True}
    if res.get("reason") == "busy":
        return {"ok": True, "joined": True}
    return {"ok": bool(res.get("ok")), "error": res.get("error")}


def _work(compute: Optional[date], by: str, auto: bool, on_done) -> None:
    global _run, _last
    trigger = f"{'auto' if auto else 'recalc'}:{by}"[:120]
    try:
        q = threading.Thread(target=lambda: _set("quality", _quality()), name="kpi-recalc-quality", daemon=True)
        q.start()
        if compute is not None:
            tv_args = (f"compute:{turnover.ym(compute)}", compute, by)
        else:
            tv_args = (trigger, None, None)
        _set("turnover", _read(turnover_sync.run_read, turnover_sync.running, *tv_args))
        _set("compliance", _read(category_sync.run_read, category_sync.running, trigger))
        q.join()
    except Exception:  # noqa: BLE001
        log.exception("kpi-recalc: run failed")
    finally:
        if on_done is not None:
            try:
                on_done()
            except Exception:  # noqa: BLE001
                log.exception("kpi-recalc: on_done failed")
        with _lock:
            if _run is not None:
                _run["finished_at"] = _now()
            _last, _run = _run, None
