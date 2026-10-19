"""The Verifix read behind «Toifaga muvofiqlik» (`services/category_compliance.py`).

Verifix's directory carries no category («разряд») and no history, so the KPI
reads the three HR journals that carry both and keeps them as ONE dated event
table (`category_events`), replaced whole by every read:

1. the rank dictionary (`pro/rank$list`) — the category names, kept on the
   read row for a line that names a rank by id alone;
2. the hiring journal (`pro/hiring$list`, `start/hiring$list` where the Pro
   one is closed to the API role) — the category a person starts on, the
   cell and job they were hired into;
3. the transfer journal (`pro/transfer$list` / `start/…`) — the cell and job
   they moved to, and a category where the transfer set one;
4. the rank-change journal (`pro/rank_change$list`) — every later grant;
5. the units (`core/division$list`), so each line's org unit is stored with
   its cell code the way the turnover read resolves one
   (`turnover.unit_code`; a unit that is somebody's DEPARTMENT on these same
   lines is not a cell — the cells sync's rule).

An unposted journal (`journal_posted` = N) is not in force and is left out,
counted. Only catalog READ methods are called (`verifix_catalog`), and only
what the KPI needs is kept per line: who, when, which unit and job, which
category. No phone, birthday, passport, PINFL or pay is read into a table.

Nightly at 23:55 (after the turnover read's 23:40, so the directory the KPI
places people by is the same night's), a catch-up ~200 s after boot when the
last complete read is older than six hours, and the admin's button.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import delete

from app.database import SessionLocal
from app.models import CategoryEvent, CategoryRead
from app.services import action_log, category_compliance as cc, turnover, verifix
from app.services import verifix_catalog as catalog
from app.services import verifix_explore as vx

log = logging.getLogger(__name__)

READ_BUDGET_S = 480.0       # a background read; no Cloudflare in the way
PAGE_CAP = 400              # the rank-change journal alone is ~65 pages of 100
BOOT_DELAY_S = 200
BOOT_IF_OLDER = timedelta(hours=6)
NIGHT_READ = (23, 55)
JOURNALS_FROM = date(2020, 1, 1)    # the hiring journal takes a span; Verifix's journals start in 2024
CLOSED = ("forbidden", "missing", "bad_request")

_lock = threading.Lock()


def _guard(path: str) -> None:
    m = catalog.BY_KEY.get(path)
    if m is None or m.blocked:
        raise RuntimeError(f"{path} is not an open catalog read method")


def _rows(cl, path: str, body: dict, limit: Optional[int], deadline: float) -> list[dict]:
    _guard(path)
    out: list[dict] = []
    for page in vx._pages(cl, path, body, limit, deadline, cap=PAGE_CAP):
        out.extend(page)
    return out


def _first_open(cl, options: list[tuple[str, dict]], limit: Optional[int],
                deadline: float) -> tuple[list[dict], str]:
    """The first of several journals the API role opens (Pro first, Start
    second — two views of one journal). ([], "closed") when none does."""
    last: Optional[verifix.VerifixError] = None
    for path, body in options:
        try:
            return _rows(cl, path, body, limit, deadline), path.split("/", 1)[0]
        except verifix.VerifixError as exc:
            if vx._classify(exc) not in CLOSED:
                raise
            last = exc
    if last is not None:
        log.info("category: journal closed to the API role: %s", last.message or last.code)
    return [], "closed"


def _date(raw: Any) -> Optional[date]:
    s = vx._d_iso(raw)
    return date.fromisoformat(s) if s else None


def configured(db) -> bool:
    try:
        vx.config(db)
        return True
    except vx.NotConfigured:
        return False


def running(db) -> bool:
    last = cc.last_read(db)
    return bool(last and last.finished_at is None and last.started_at
                and turnover.now_aware() - last.started_at < cc.READ_STALE)


# ── the lines ─────────────────────────────────────────────────────────────────

def _lines(journals: list[dict], key: str) -> tuple[list[dict], int, int]:
    """(lines, posted journals, unposted journals). A Pro journal carries its
    lines under `key`; a Start row IS one line."""
    out: list[dict] = []
    posted = skipped = 0
    for j in journals:
        if not isinstance(j, dict):
            continue
        if key in j and isinstance(j.get(key), list):
            if vx._s(j.get("journal_posted")) == "N":
                skipped += 1
                continue
            posted += 1
            for x in j[key]:
                if isinstance(x, dict):
                    out.append({**x, "journal_id": vx._s(j.get("journal_id")) or None,
                                "journal_date": j.get("journal_date")})
        else:
            if vx._s(j.get("journal_posted")) == "N":
                skipped += 1
                continue
            posted += 1
            out.append(j)
    return out, posted, skipped


def _event(x: dict, kind: str, date_key: str, ranks: dict, units: dict, depts: set) -> Optional[dict]:
    eid = vx._s(x.get("employee_id"))
    d = _date(x.get(date_key)) or _date(x.get("journal_date"))
    if not eid or d is None:
        return None
    rid = vx._s(x.get("rank_id")) or None
    rname = vx._s(x.get("rank_name")) or (ranks.get(rid) if rid else None) or None
    uid = vx._s(x.get("org_unit_id")) or vx._s(x.get("division_id")) or None
    u = units.get(uid or "") or {}
    uname = u.get("name") or vx._s(x.get("org_unit_name")) or vx._s(x.get("division_name")) or None
    code = None
    if kind != "rank" and uid and uid not in depts:
        code = turnover.unit_code(u.get("raw_code"), uname)
    return {
        "employee_id": eid,
        "staff_id": vx._s(x.get("staff_id")) or None,
        "kind": kind,
        "date": d,
        "date_end": _date(x.get("transfer_end")) if kind == "transfer" else None,
        "journal_id": vx._s(x.get("journal_id")) or None,
        "page_id": vx._s(x.get("page_id")) or None,
        "rank_id": rid,
        "rank_name": rname,
        "job_id": vx._s(x.get("job_id")) or None,
        "job_name": vx._s(x.get("job_name")) or None,
        "unit_id": None if kind == "rank" else uid,
        "unit_name": None if kind == "rank" else uname,
        "code": code,
    }


def run_read(trigger: str) -> dict:
    """One complete read. Refuses while another read runs (this process or a
    second copy during a deploy). Never raises."""
    if not _lock.acquire(blocking=False):
        return {"started": False, "reason": "busy"}
    db = SessionLocal()
    rd = None
    try:
        if running(db):
            return {"started": False, "reason": "busy"}
        try:
            c = vx.config(db)
        except vx.NotConfigured:
            return {"started": False, "reason": "not_configured"}
        at = turnover.now_aware()
        rd = CategoryRead(started_at=at, trigger=trigger[:120])
        db.add(rd)
        db.commit()
        deadline = time.monotonic() + READ_BUDGET_S
        today = turnover.local(at).date().strftime("%d.%m.%Y")
        from app.services.verifix_live import _side_by_side

        def read_dict(cl):
            o: dict = {}
            o["units"] = _rows(cl, "core/division$list", {"division_ids": []}, verifix.LIMIT_LIST, deadline)
            o["ranks"] = _rows(cl, "pro/rank$list", {"rank_ids": []}, None, deadline)
            return o

        def read_rank(cl):
            return _rows(cl, "pro/rank_change$list", {"journal_ids": []}, verifix.LIMIT_LIST, deadline), "pro"

        def read_hire(cl):
            return _first_open(cl, [
                ("pro/hiring$list", {"journal_ids": [], "journal_begin_date": JOURNALS_FROM.strftime("%d.%m.%Y"),
                                     "journal_end_date": today}),
                ("start/hiring$list", {"journal_ids": []}),
            ], verifix.LIMIT_LIST, deadline)

        def read_transfer(cl):
            return _first_open(cl, [
                ("pro/transfer$list", {"journal_ids": []}),
                ("start/transfer$list", {"journal_ids": []}),
            ], verifix.LIMIT_LIST, deadline)

        dic, (rank_j, src_rank), (hire_j, src_hire), (tr_j, src_tr) = _side_by_side(
            c, read_dict, read_rank, read_hire, read_transfer)

        units: dict[str, dict] = {}
        for d in dic["units"]:
            did = vx._s(d.get("division_id"))
            if did:
                units[did] = {"name": vx._s(d.get("name")) or None, "raw_code": vx._s(d.get("code")) or None}
        ranks = {vx._s(x.get("rank_id")): vx._s(x.get("name")) or None for x in dic["ranks"] if vx._s(x.get("rank_id"))}
        if len(units) < 50 or not ranks:
            raise verifix.VerifixError("empty", "Verifix returned too few units or no ranks")

        hires, p1, s1 = _lines(hire_j, "hirings")
        transfers, p2, s2 = _lines(tr_j, "transfers")
        changes, p3, s3 = _lines(rank_j, "rank_changes")
        # A unit that is somebody's DEPARTMENT on these lines is not a cell.
        depts = {vx._s(x.get("division_id")) for x in hires + transfers if vx._s(x.get("division_id"))}
        events: list[dict] = []
        for x in hires:
            e = _event(x, "hire", "hiring_date", ranks, units, depts)
            if e:
                events.append(e)
        for x in transfers:
            e = _event(x, "transfer", "transfer_begin", ranks, units, depts)
            if e:
                events.append(e)
        for x in changes:
            e = _event(x, "rank", "change_date", ranks, units, depts)
            if e:
                events.append(e)
        if not events:
            raise verifix.VerifixError("empty", "Verifix returned no journal lines")

        db.execute(delete(CategoryEvent))
        db.bulk_insert_mappings(CategoryEvent, events)
        rd.finished_at = turnover.now_aware()
        rd.ok = True
        rd.journals = p1 + p2 + p3
        rd.skipped = s1 + s2 + s3
        rd.events = len(events)
        rd.employees = len({e["employee_id"] for e in events})
        rd.sources = {"hire": src_hire, "transfer": src_tr, "rank": src_rank}
        rd.ranks = ranks
        db.commit()
        cc.forget()
        action_log.record_system("sync_export", "sync.category_read", db=None, details=[
            ("trigger", trigger), ("journals", rd.journals), ("unposted", rd.skipped),
            ("events", rd.events), ("employees", rd.employees),
            ("sources", f"hire {src_hire} · transfer {src_tr} · rank {src_rank}"),
        ])
        return {"started": True, "ok": True, "events": rd.events, "employees": rd.employees}
    except verifix.VerifixError as exc:
        db.rollback()
        _fail(db, rd, f"{exc.code}: {exc.message}" if exc.message else exc.code)
        return {"started": True, "ok": False, "error": exc.code}
    except Exception as exc:  # noqa: BLE001 — a background read must report, never die silently
        db.rollback()
        log.exception("category: read failed")
        _fail(db, rd, f"{type(exc).__name__}: {exc}"[:500])
        return {"started": True, "ok": False, "error": "error"}
    finally:
        db.close()
        _lock.release()


def _fail(db, rd: Optional[CategoryRead], error: str) -> None:
    if rd is None:
        return
    try:
        row = db.get(CategoryRead, rd.id)
        if row is not None:
            row.finished_at = turnover.now_aware()
            row.ok = False
            row.error = (error or "error")[:500]
            db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("category: could not record the failed read")


def start_read(trigger: str) -> bool:
    """The admin's button: a read on a thread of its own."""
    if _lock.locked():
        return False
    threading.Thread(target=run_read, args=(trigger,), name="category-read", daemon=True).start()
    return True


def _boot() -> None:
    db = SessionLocal()
    try:
        if not configured(db):
            log.info("category: Verifix is not configured — no boot read")
            return
        ok = cc.last_read(db, ok_only=True)
        due = ok is None or ok.finished_at is None or turnover.now_aware() - ok.finished_at > BOOT_IF_OLDER
    finally:
        db.close()
    if due:
        run_read("boot")


def _night() -> None:
    db = SessionLocal()
    try:
        ok = configured(db)
    finally:
        db.close()
    if ok:
        run_read("night")


def register_jobs() -> None:
    """Nightly read 23:55 (after the turnover directory's 23:40) and a
    catch-up read after boot when the last complete one is older than six
    hours. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        h, mi = NIGHT_READ
        get_scheduler().add_job(_night, trigger=CronTrigger(hour=h, minute=mi, timezone=SCHEDULER_TZ),
                                id="category-night-read", replace_existing=True)
        schedule_at("category-boot", datetime.now(timezone.utc) + timedelta(seconds=BOOT_DELAY_S), _boot)
        log.info("category: jobs registered (read %02d:%02d)", h, mi)
    except Exception:  # noqa: BLE001
        log.exception("category: could not register the jobs")
