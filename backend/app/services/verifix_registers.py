"""«Verifix (test)» phase 2 — the registers Verifix keeps (admin-only).

From 2026-10-03 (the operator: "start phase 2") nine more pages of the section
read what Verifix keeps beyond the people and their marks:

* **Qurilmalar** — `devices`: every terminal, and per person whether their
  record, face photo and card are loaded on it (`device$employee_statuses`);
* **So'rovlar** — `requests`: absence, mark, overtime and schedule-change
  requests with their status;
* **Yo'qliklar** — `absences`: vacations (and recalls), sick leaves, trips;
* **Kadr harakati** — `hr_moves`: hirings, transfers, dismissals, schedule and
  rank changes — the Pro module's journals, else the Start module's (the same
  journals seen two ways: one journal id, one page id);
* **Tabel** — `timebooks` + `timebook`: the timebooks, plan against fact;
* **Smenalar** — `shifts`: Verifix's own shift planning;
* **Hodisalar** — `incidents`;
* **Ma'lumotnomalar** — `dictionaries`: the small lists behind the rest;
* **Ish haqi** — `payroll`: wage changes, pay sheets, accrual books, one-time
  charges, payments, bank accounts and the two wage reports (the operator
  opened wages on 2026-10-03).

**Big lists load in the BACKGROUND.** Most of these methods take no date filter
and page 100 rows at a time, so a register can be many pages long while one
request must answer inside Cloudflare's 100 s. `_start` reads a whole list on a
thread of its own (`FEED_BUDGET_S`, `FEED_PAGES`); a request waits up to
`FEED_WAIT_S` and answers with what has arrived, `loading: true`, and the page
polls until it is in. A finished list is reused for `FEED_TTL`; a forced reload
keeps the previous rows on screen until the new read is done.

Everything the phase-1 module promises holds here: only catalog READ methods are
called, rows are projected field by field (nothing private is copied) or passed
through `verifix_explore.scrub` when shown whole, card AND account numbers leave
as their last four digits, and nothing is stored.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import OrderedDict
from datetime import date, timedelta
from typing import Any, Callable, Iterable, Optional

from sqlalchemy.orm import Session

from app.services import verifix, verifix_catalog as catalog, verifix_explore as vx, verifix_live

log = logging.getLogger(__name__)

FEED_TTL = 600            # a whole list is reused for ten minutes
FEED_WAIT_S = 8.0         # a request waits this long for its lists, then answers with what arrived
FEED_BUDGET_S = 540.0     # one background read stops after nine minutes …
FEED_PAGES = 400          # … or 400 pages, and says it is partial
FEEDS_MAX = 40
READERS = 3               # background reads talking to Verifix at once
# Lists whose rows carry every line of a document (an accrual book holds one
# line per person per accrual): read a few documents per page, so one page is
# never tens of megabytes, and kept as one summary row per document — a
# document's lines are read when it is opened (`_one`).
PAGE_SIZE = {
    "pro/book$list": 2, "pro/payment$list": 10, "pro/one_time_charge$list": 10,
    "start/wage_sheet$list": 5, "pro/timebook$list": 5,
}
MAX_WINDOW_DAYS = 400
STAFF_CHUNK = 500         # pro/employee$list page size, and the ids one call may name
STAFF_MAX = 4000
DIR_RETRY_S = 120.0       # a directory read that failed is not retried sooner
CLOSED = ("forbidden", "missing", "bad_request")   # a fallback method may still answer

_s, _iso, _int, _d_iso, _dt = vx._s, vx._iso, vx._int, vx._d_iso, vx._dt


# ── background lists ──────────────────────────────────────────────────────────

_feeds: "OrderedDict[tuple, dict]" = OrderedDict()
_feeds_lock = threading.Lock()
_readers = threading.BoundedSemaphore(READERS)


def _body(path: str, given: Optional[dict] = None, **lists) -> dict:
    """The method's empty-filter body, these params (dates may be `date`s) and
    these id lists."""
    m = catalog.BY_KEY[path]
    if m.blocked:
        raise ValueError(f"{path} is switched off")
    typed = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in (given or {}).items()}
    body, missing = catalog.build_body(m, typed, verifix_live.now_local())
    if missing:
        raise ValueError(f"{path} needs {', '.join(missing)}")
    body.update(lists)
    return body


def _read(st: dict, c: dict, path: str, body: dict, limit: Optional[int],
          project: Optional[Callable[[list], list]] = None) -> None:
    """Every page of one method, into `st` as it arrives — through `project`
    when given, so a list of heavy documents is kept as its summaries."""
    deadline = time.monotonic() + FEED_BUDGET_S
    try:
        with _readers:
            with verifix.client(c) as cl:
                cursor = None
                for _ in range(FEED_PAGES):
                    if time.monotonic() > deadline:
                        st["partial"] = True
                        break
                    data, nxt = verifix.call(cl, path, body, limit=limit, cursor=cursor)
                    rows = vx._as_rows(data)
                    n = len(rows)
                    st["rows"].extend(project(rows) if project else rows)
                    st["pages"] += 1
                    # Verifix hands a cursor with its last page too: an empty
                    # or short page ends the list.
                    if not n or not nxt or nxt == cursor or (limit and n < limit):
                        break
                    cursor = nxt
                else:
                    st["partial"] = True
    except verifix.VerifixError as exc:
        st["error"] = {"code": vx._classify(exc), "message": (exc.message or exc.code)[:300], "status": exc.status}
    except Exception as exc:                            # a broken list must never hang a page
        log.exception("verifix registers: reading %s failed", path)
        st["error"] = {"code": "error", "message": f"{type(exc).__name__}: {exc}"[:300], "status": None}
    finally:
        st["at"] = verifix_live.now_local()
        st["t_done"] = time.monotonic()
        st["prev"] = None
        st["running"] = False
        st["event"].set()


def _start(c: dict, path: str, body: dict, force: bool = False, ttl: float = FEED_TTL,
           project: Optional[Callable[[list], list]] = None) -> dict:
    """The list's state: reused while fresh, else read again on a thread. A
    forced read never restarts one already running."""
    fk = vx._key(c, "feed", path, getattr(project, "__name__", ""),
                 json.dumps(body, sort_keys=True, ensure_ascii=False, default=str))
    launch = False
    now = time.monotonic()
    with _feeds_lock:
        st = _feeds.get(fk)
        if st is None or (not st["running"] and (force or now - st["t_done"] >= ttl)):
            prev = None
            if st is not None and not st["error"]:
                prev = {k: st[k] for k in ("rows", "pages", "partial", "at")}
            st = {"path": path, "rows": [], "pages": 0, "running": True, "error": None, "partial": False,
                  "t_done": None, "at": None, "prev": prev, "event": threading.Event()}
            _feeds[fk] = st
            launch = True
        _feeds.move_to_end(fk)
        extra = len(_feeds) - FEEDS_MAX
        if extra > 0:
            for k in [k for k, v in _feeds.items() if not v["running"]][:extra]:
                _feeds.pop(k, None)
    if launch:
        limit = PAGE_SIZE.get(path, catalog.BY_KEY[path].limit)
        threading.Thread(target=_read, args=(st, c, path, body, limit, project),
                         daemon=True, name="vfx-feed").start()
    return st


def _wait(states: Iterable[dict], wait: float) -> None:
    end = time.monotonic() + wait
    for st in states:
        left = end - time.monotonic()
        if left <= 0:
            return
        if st["running"]:
            st["event"].wait(left)


def _snap(st: dict) -> dict:
    """What a page may show of a list right now. A reload in progress shows the
    previous rows (`refreshing`); a first read shows what has arrived (`loading`)."""
    prev = st.get("prev") if st["running"] else None
    if prev is not None:
        return {"rows": prev["rows"], "loading": False, "refreshing": True, "pages": prev["pages"],
                "partial": prev["partial"], "error": None, "at": _iso(prev["at"]), "source": st["path"]}
    rows = list(st["rows"]) if st["running"] else st["rows"]
    return {"rows": rows, "loading": st["running"], "refreshing": False, "pages": st["pages"],
            "partial": bool(st["partial"] or (st["error"] and rows)), "error": st["error"],
            "at": _iso(st["at"]), "source": st["path"]}


def _gather(c: dict, specs: dict, force: bool, wait: float = FEED_WAIT_S) -> dict:
    """Several lists read together: {name: (path, body[, project])} → {name: snapshot}."""
    states = {name: _start(c, spec[0], spec[1], force, project=spec[2] if len(spec) > 2 else None)
              for name, spec in specs.items()}
    _wait(states.values(), wait)
    return {name: _snap(st) for name, st in states.items()}


def _first(c: dict, groups: dict, force: bool, wait: float = FEED_WAIT_S) -> dict:
    """For each name, the first method of its list the role opens:
    {name: [(path, body), …]} → {name: snapshot + `tried`}. A method still
    loading is waited for, never skipped."""
    end = time.monotonic() + wait
    at = {name: 0 for name in groups}
    tried: dict[str, list] = {name: [] for name in groups}
    states = {name: _start(c, *groups[name][0], force) for name in groups}
    for _ in range(max(len(g) for g in groups.values())):
        _wait(states.values(), max(1.5, end - time.monotonic()))
        moved = False
        for name, st in states.items():
            if (not st["running"] and st["error"] and st["error"]["code"] in CLOSED and not st["rows"]
                    and at[name] + 1 < len(groups[name])):
                tried[name].append({"source": st["path"], "error": st["error"]})
                at[name] += 1
                states[name] = _start(c, *groups[name][at[name]], force)
                moved = True
        if not moved:
            break
    return {name: {**_snap(st), "tried": tried[name]} for name, st in states.items()}


def _one(c: dict, path: str, body: dict, force: bool, wait: float = FEED_WAIT_S) -> dict:
    """One document's full rows, read on its own (narrowed by its id)."""
    st = _start(c, path, body, force)
    _wait([st], wait)
    return _snap(st)


def _meta(s: dict) -> dict:
    return {k: v for k, v in s.items() if k != "rows"}


def _busy(*snaps: dict) -> bool:
    return any(s and (s.get("loading") or s.get("refreshing")) for s in snaps)


# ── the people and places a row names ────────────────────────────────────────

_warm_lock = threading.Lock()
_warming: set = set()
_warm_failed: dict = {}


def _warm(name: tuple, fn: Callable[[], Any]) -> None:
    with _warm_lock:
        if name in _warming or time.monotonic() - _warm_failed.get(name, -1e9) < DIR_RETRY_S:
            return
        _warming.add(name)

    def run():
        try:
            fn()
            _warm_failed.pop(name, None)
        except Exception as exc:
            _warm_failed[name] = time.monotonic()
            log.warning("verifix registers: reading the directory failed: %s", exc)
        finally:
            with _warm_lock:
                _warming.discard(name)

    threading.Thread(target=run, daemon=True, name="vfx-warm").start()


def _dir(c: dict, which: str) -> tuple[Optional[dict], bool]:
    """The phase-1 directory (employees or divisions) if it is in memory, a
    stale copy while it is re-read, or None while the first read runs — never a
    request that waits eighteen pages for it. → (directory, still loading)."""
    loader = vx._employees if which == "emps" else vx._divisions
    key = vx._key(c, which)
    hit = vx._CACHE.peek(key)
    if hit is None or hit[2] >= vx.TTL_DIR:
        _warm(key, lambda: loader(c, time.monotonic() + 300.0))
    if hit is not None:
        return hit[0], False
    with _warm_lock:
        failed = time.monotonic() - _warm_failed.get(key, -1e9) < DIR_RETRY_S
    return None, not failed


def _frame(db: Session, c: dict, emp_ids: Iterable[Optional[str]], node_ids: Iterable[Optional[str]] = ()) -> dict:
    """Who the rows name (photo, org unit) and which nodes are our cells."""
    emps, l1 = _dir(c, "emps")
    divs, l2 = _dir(c, "divs")
    people: dict[str, dict] = {}
    nodes = {n for n in node_ids if n}
    if emps:
        for i in {e for e in emp_ids if e}:
            e = emps.get(i)
            if not e:
                continue
            people[i] = {"name": e["name"], "photo": e["photo"], "unit": e["unit"] or None,
                         "div": e["div"] or None, "status": e["status"]}
            nodes.update(x for x in (e["unit"], e["div"]) if x)
        vx._allow(*(p["photo"] for p in people.values()))
    cells: dict = {}
    divisions: dict = {}
    if divs:
        node_cells = vx._node_cells(divs, vx._cells(db))
        cells = {k: v for k, v in node_cells.items() if k in nodes}
        divisions = {k: divs[k]["name"] for k in nodes if k in divs}
    return {"people": people, "cells": cells, "divisions": divisions, "directory_loading": l1 or l2}


def _staff(c: dict, staff_ids: Iterable[Optional[str]], force: bool,
           wait: float = 6.0) -> tuple[dict, Optional[dict], bool]:
    """staff id → the person behind it. Requests and accrual books name only a
    STAFF record (one person's post); the Pro employee list narrowed to those
    ids says whose it is — and the hiring journals do too, when that list is
    closed to the role. → (map, error, still loading)."""
    ids = sorted({int(s) for s in staff_ids if s and str(s).isdigit()})[:STAFF_MAX]
    if not ids:
        return {}, None, False
    states = [_start(c, "pro/employee$list",
                     _body("pro/employee$list", staff_ids=ids[i:i + STAFF_CHUNK]), force)
              for i in range(0, len(ids), STAFF_CHUNK)]
    _wait(states, wait)
    out: dict[str, dict] = {}
    err = None
    loading = False
    for st in states:
        s = _snap(st)
        loading = loading or s["loading"]
        err = err or s["error"]
        for r in s["rows"]:
            sid = _s(r.get("staff_id"))
            if sid:
                out[sid] = {"emp": _s(r.get("employee_id")) or None,
                            "name": _s(r.get("employee_name")) or vx._name(r) or None,
                            "div": _s(r.get("division_id")) or None, "unit": _s(r.get("org_unit_id")) or None,
                            "job": _s(r.get("job_name")) or None}
    if err and not out and err["code"] in CLOSED:
        st = _start(c, "start/hiring$list", _body("start/hiring$list"), force)
        _wait([st], wait)
        s = _snap(st)
        loading = loading or s["loading"]
        want = {str(i) for i in ids}
        for r in s["rows"]:
            sid = _s(r.get("staff_id"))
            if sid in want and sid not in out:
                out[sid] = {"emp": _s(r.get("employee_id")) or None, "name": _s(r.get("staff_name")) or None,
                            "div": _s(r.get("division_id")) or None, "unit": None,
                            "job": _s(r.get("job_name")) or None}
        if out:
            err = None
    return out, err, loading


# ── values ────────────────────────────────────────────────────────────────────

def _today() -> date:
    return verifix_live.now_local().date()


def _window(begin: Optional[date], end: Optional[date], back: int = 30, fwd: int = 0) -> tuple[date, date]:
    today = _today()
    hi = end or (today + timedelta(days=fwd))
    lo = begin or (hi - timedelta(days=back))
    if lo > hi:
        lo, hi = hi, lo
    if (hi - lo).days > MAX_WINDOW_DAYS:
        lo = hi - timedelta(days=MAX_WINDOW_DAYS)
    return lo, hi


def _when(raw: Any) -> Optional[str]:
    """A Verifix date or date-time: '2025-01-31', or '2025-01-31T09:00' when it
    carries a clock."""
    dt = _dt(raw)
    if dt is not None:
        return dt.isoformat(timespec="minutes")
    return _d_iso(raw)


def _in(iso: Optional[str], lo: date, hi: date) -> bool:
    return bool(iso) and lo.isoformat() <= iso[:10] <= hi.isoformat()


def _overlaps(b: Optional[str], e: Optional[str], lo: date, hi: date) -> bool:
    b = (b or e or "")[:10]
    e = (e or b or "")[:10]
    return bool(b) and b <= hi.isoformat() and e >= lo.isoformat()


def _covers(b: Optional[str], e: Optional[str], day: str) -> bool:
    return bool(b) and b[:10] <= day <= (e or b)[:10]


def _days(b: Optional[str], e: Optional[str]) -> Optional[int]:
    try:
        return (date.fromisoformat((e or b)[:10]) - date.fromisoformat(b[:10])).days + 1
    except (TypeError, ValueError):
        return None


def _f(v: Any) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _yn(v: Any) -> Optional[bool]:
    s = _s(v).upper()
    return True if s == "Y" else False if s == "N" else None


def _kids(r: dict, key: str) -> list[dict]:
    return [x for x in (r.get(key) or []) if isinstance(x, dict)]


def _hhmm(minutes: Optional[int]) -> Optional[str]:
    if minutes is None:
        return None
    m = minutes % 1440
    return f"{m // 60:02d}:{m % 60:02d}" + (" +1" if minutes >= 1440 else "")


def _sum(rows: Iterable[dict], key: str) -> Optional[float]:
    vals = [r[key] for r in rows if r.get(key) is not None]
    return round(sum(vals), 2) if vals else None


def _flat(rows: list[dict], key: Optional[str] = None) -> list[dict]:
    """A journal list as one row per line: the journal's own fields beside each
    line's (lists and objects dropped). For a method whose shape Verifix does
    not document — the line list is the first list of objects a row carries."""
    out = []
    for r in vx.scrub(rows):
        kids = _kids(r, key) if key else next(
            (v for k, v in r.items() if k not in ("fields", "oper_types") and isinstance(v, list)
             and v and isinstance(v[0], dict)), None)
        top = {k: v for k, v in r.items() if not isinstance(v, (list, dict))}
        if kids:
            for x in kids:
                out.append({**top, **{k: v for k, v in x.items() if not isinstance(v, (list, dict))}})
        else:
            out.append(top)
    return out


def _date_of(row: dict) -> Optional[str]:
    """The date a row of an undocumented shape is ABOUT: a change / begin date
    first, then any date it carries."""
    keys = [k for k in row if "date" in k.lower()]
    keys.sort(key=lambda k: (0 if ("change" in k or "begin" in k) else 1 if "journal" not in k else 2, k))
    for k in keys:
        d = _d_iso(row.get(k))
        if d:
            return d
    return None


def _generic(rows: list[dict], lo: Optional[date], hi: Optional[date]) -> list[dict]:
    out = []
    for x in _flat(rows):
        d = _date_of(x)
        if lo and d and not _in(d, lo, hi):
            continue
        out.append(x)
    return out


def _named_map(rows: list[dict], id_key: str, name_key: str = "name") -> dict[str, str]:
    return {_s(r.get(id_key)): _s(r.get(name_key)) for r in rows if _s(r.get(id_key))}


# ── Qurilmalar ────────────────────────────────────────────────────────────────

ON_DEVICE, PHOTO_ON, CARD_ON = 1, 2, 4


def _dev_rows(rows: list) -> list:
    """A (person, terminal) row as a small tuple: the list runs to tens of
    thousands and a dict per row would hold ten times the memory."""
    out = []
    for r in rows:
        eid, did = _s(r.get("employee_id")), _s(r.get("device_id"))
        if not eid or not did:
            continue
        flags = ((ON_DEVICE if _yn(r.get("employee_is_on_device")) else 0)
                 | (PHOTO_ON if _yn(r.get("photo_is_on_device")) else 0)
                 | (CARD_ON if _yn(r.get("rfid_is_on_device")) else 0))
        out.append((eid, _s(r.get("employee_name")), did, _s(r.get("device_name")),
                    _s(r.get("location_id")), _s(r.get("location_name")), flags,
                    _s(r.get("last_photo_upload_command_response_code")),
                    _s(r.get("last_photo_upload_command_response"))[:240]))
    return out


def devices(db: Session, force: bool = False) -> dict:
    """Every (person, terminal) pair Verifix tracks, as compact rows
    [employee, device, flags, upload code] — flags: 1 the person is on the
    terminal, 2 their face photo is, 4 their card is."""
    c = vx.config(db)
    path = "core/device$employee_statuses"
    s = _gather(c, {"st": (path, _body(path), _dev_rows)}, force)["st"]
    devs: dict[str, dict] = {}
    names: dict[str, str] = {}
    codes: dict[str, str] = {}
    rows = []
    for eid, ename, did, dname, loc, lname, flags, code, resp in s["rows"]:
        if eid not in names:
            names[eid] = ename
        if did not in devs:
            devs[did] = {"id": did, "name": dname or f"#{did}", "loc": loc or None, "loc_name": lname or None}
        if code and code not in codes:
            codes[code] = resp
        rows.append([eid, did, flags, code or None])
    frame = _frame(db, c, names)
    return {
        "section": _meta(s), "rows": rows, "names": names, "codes": codes,
        "devices": sorted(devs.values(), key=lambda d: ((d["loc_name"] or "~"), d["name"])),
        **frame, "today": _today().isoformat(),
        "loading": _busy(s) or frame["directory_loading"],
    }


# ── So'rovlar ─────────────────────────────────────────────────────────────────

def requests(db: Session, begin: Optional[date], end: Optional[date], force: bool = False) -> dict:
    """Absence, mark, overtime and schedule-change requests of a period."""
    c = vx.config(db)
    lo, hi = _window(begin, end, 30)
    snaps = _gather(c, {
        "absence": ("core/request$list", _body("core/request$list",
                                               {"request_begin_date": lo, "request_end_date": hi})),
        "kinds": ("core/request_kind$list", _body("core/request_kind$list")),
        "track": ("core/track_request$list", _body("core/track_request$list")),
        "overtime": ("core/overtime_request$list", _body("core/overtime_request$list")),
        "plan": ("core/plan_change$list", _body("core/plan_change$list")),
    }, force)

    kinds = {}
    for k in snaps["kinds"]["rows"]:
        kid = _s(k.get("request_kind_id"))
        if kid:
            kinds[kid] = {"name": _s(k.get("name")) or f"#{kid}", "tk": _s(k.get("time_kind_id")) or None,
                          "limited": _yn(k.get("annually_limited")), "limit": _int(k.get("annual_day_limit")),
                          "state": _s(k.get("state")) or "A"}

    absence = []
    for r in snaps["absence"]["rows"]:
        absence.append({
            "id": _s(r.get("request_id")), "kind": _s(r.get("request_kind_id")) or None,
            "staff": _s(r.get("staff_id")) or None, "emp": _s(r.get("employee_id")) or None,
            "begin": _when(r.get("begin_time")), "end": _when(r.get("end_time")),
            "type": _s(r.get("request_type")) or None, "status": _s(r.get("status")) or None,
            "note": _s(r.get("note")) or None, "mnote": _s(r.get("manager_note")) or None,
            "barcode": _s(r.get("barcode")) or None,
        })

    track = []
    for r in snaps["track"]["rows"]:
        at = _iso(_dt(r.get("track_datetime")))
        if at and not _in(at, lo, hi):
            continue
        track.append({
            "id": _s(r.get("request_id")), "emp": _s(r.get("employee_id")) or None,
            "staff": _s(r.get("staff_id")) or None, "at": at, "type": _s(r.get("track_type")) or None,
            "status": _s(r.get("status")) or None, "note": _s(r.get("note")) or None,
            "mnote": _s(r.get("manager_note")) or None, "loc": _s(r.get("location_id")) or None,
            "track": _s(r.get("track_id")) or None,
        })

    overtime = []
    for r in snaps["overtime"]["rows"]:
        d = _d_iso(r.get("request_date"))
        if d and not _in(d, lo, hi):
            continue
        overtime.append({
            "id": _s(r.get("request_id")), "date": d, "emp": _s(r.get("employee_id")) or None,
            "staff": _s(r.get("staff_id")) or None, "minutes": _int(r.get("overtime")),
            "kinds": [_s(k.get("name")) for k in _kids(r, "time_kinds") if _s(k.get("name"))],
            "mode": _s(r.get("mode")) or None, "status": _s(r.get("status")) or None,
            "note": _s(r.get("note")) or None, "mnote": _s(r.get("manager_note")) or None,
            "shifts": [{"name": _s(x.get("shift_name")) or None, "minutes": _int(x.get("request_time"))}
                       for x in _kids(r, "shifts")],
        })

    plan = []
    for r in snaps["plan"]["rows"]:
        days = [{"date": _d_iso(d.get("change_date")), "swap": _d_iso(d.get("swapped_date")),
                 "kind": _s(d.get("day_kind")) or None, "begin": _iso(_dt(d.get("begin_time"))),
                 "end": _iso(_dt(d.get("end_time"))), "plan": _int(d.get("plan_time"))}
                for d in _kids(r, "change_days")]
        created = _iso(_dt(r.get("created_on")))
        if not (_in(created, lo, hi) or any(_in(d["date"], lo, hi) for d in days)):
            continue
        plan.append({
            "id": _s(r.get("change_id")), "staff": _s(r.get("staff_id")) or None,
            "kind": _s(r.get("change_kind")) or None, "status": _s(r.get("status")) or None,
            "created": created, "note": _s(r.get("note")) or None, "mnote": _s(r.get("manager_note")) or None,
            "days": sorted(days, key=lambda d: d["date"] or ""),
        })

    staff, staff_err, staff_loading = _staff(
        c, [r["staff"] for r in absence if not r["emp"]] + [r["staff"] for r in plan], force)
    for r in absence + plan:
        who = staff.get(r.get("staff") or "")
        if who and not r.get("emp"):
            r["emp"] = who["emp"]
        r["name"] = (who or {}).get("name")
    emp_ids = [r.get("emp") for r in absence + track + overtime + plan]
    frame = _frame(db, c, emp_ids)
    return {
        "window": {"begin": lo.isoformat(), "end": hi.isoformat()},
        "absence": {**_meta(snaps["absence"]), "rows": absence},
        "track": {**_meta(snaps["track"]), "rows": track},
        "overtime": {**_meta(snaps["overtime"]), "rows": overtime},
        "plan": {**_meta(snaps["plan"]), "rows": plan},
        "kinds": kinds, "kinds_error": snaps["kinds"]["error"],
        "staff_error": staff_err,
        **frame, "today": _today().isoformat(),
        "loading": _busy(*snaps.values()) or staff_loading or frame["directory_loading"],
    }


# ── Yo'qliklar ────────────────────────────────────────────────────────────────

def _journal(j: dict) -> dict:
    posted = j.get("journal_posted") if j.get("journal_posted") is not None else j.get("posted")
    return {"j": _s(j.get("journal_id")) or None, "jnum": _s(j.get("journal_number")) or None,
            "jdate": _d_iso(j.get("journal_date")), "posted": _yn(posted)}


def _who(x: dict) -> dict:
    return {"emp": _s(x.get("employee_id")) or None, "staff": _s(x.get("staff_id")) or None,
            "name": _s(x.get("employee_name")) or _s(x.get("staff_name")) or None}


def absences(db: Session, begin: Optional[date], end: Optional[date], force: bool = False) -> dict:
    """Vacations (with their recalls), sick leaves and business trips that
    touch the period — and who is away TODAY, whatever the period."""
    c = vx.config(db)
    lo, hi = _window(begin, end, 15, 15)
    snaps = _gather(c, {
        "vacation": ("pro/vacation$list", _body("pro/vacation$list")),
        "recall": ("pro/recall_vacation$list", _body("pro/recall_vacation$list")),
        "sick": ("pro/sick_leave$list", _body("pro/sick_leave$list")),
        "trip": ("pro/business_trip$list", _body("pro/business_trip$list")),
        "tk": ("core/time_kind$list", _body("core/time_kind$list")),
    }, force)
    today = _today().isoformat()

    recalls = []
    for j in snaps["recall"]["rows"]:
        for x in _kids(j, "recall_vacations"):
            recalls.append({**_journal(j), **_who(x), "id": _s(x.get("page_id")) or None,
                            "date": _d_iso(x.get("recall_date")), "vbegin": _d_iso(x.get("vacation_begin_date")),
                            "vend": _d_iso(x.get("vacation_end_date")),
                            "vnum": _s(x.get("vacation_journal_number")) or None,
                            "timeoff": _s(x.get("timeoff_id")) or None})
    recalled = {r["timeoff"]: r["date"] for r in recalls if r["timeoff"] and r["date"]}

    vacations = []
    for j in snaps["vacation"]["rows"]:
        for x in _kids(j, "vacations"):
            tid = _s(x.get("timeoff_id")) or None
            vacations.append({**_journal(j), **_who(x), "id": tid,
                              "begin": _d_iso(x.get("vacation_begin_date")), "end": _d_iso(x.get("vacation_end_date")),
                              "pbegin": _d_iso(x.get("period_begin_date")), "pend": _d_iso(x.get("period_end_date")),
                              "tk": _s(x.get("time_kind_id")) or None, "amount": _f(x.get("payroll_amount")),
                              "net": _f(x.get("payroll_net_amount")), "recalled": recalled.get(tid or "")})

    sick = []
    for j in snaps["sick"]["rows"]:
        for x in _kids(j, "sick_leaves"):
            sick.append({**_journal(j), **_who(x), "id": _s(x.get("timeoff_id")) or None,
                         "begin": _d_iso(x.get("sick_leave_begin_date")), "end": _d_iso(x.get("sick_leave_end_date")),
                         "reason": _s(x.get("reason_name")) or None, "coef": _f(x.get("sick_leave_coefficient")),
                         "tk": _s(x.get("time_kind_id")) or None})

    trips = []
    for j in snaps["trip"]["rows"]:
        for x in _kids(j, "business_trips"):
            trips.append({**_journal(j), **_who(x), "id": _s(x.get("timeoff_id")) or None,
                          "begin": _d_iso(x.get("trip_begin_date")), "end": _d_iso(x.get("trip_end_date")),
                          "regions": [_s(n) for n in (x.get("region_names") or []) if _s(n)]
                          or ([_s(x.get("region_name"))] if _s(x.get("region_name")) else []),
                          "legal": _s(x.get("legal_person_name")) or None,
                          "reason": _s(x.get("trip_reason_name")) or None})

    def vac_end(v):     # a recalled vacation ends the day before the recall
        if v["recalled"]:
            try:
                return (date.fromisoformat(v["recalled"]) - timedelta(days=1)).isoformat()
            except ValueError:
                pass
        return v["end"]

    away = {
        "vacation": len({v["emp"] or v["staff"] for v in vacations if _covers(v["begin"], vac_end(v), today)}),
        "sick": len({v["emp"] or v["staff"] for v in sick if _covers(v["begin"], v["end"], today)}),
        "trip": len({v["emp"] or v["staff"] for v in trips if _covers(v["begin"], v["end"], today)}),
    }
    for rows in (vacations, sick, trips):
        for r in rows:
            r["days"] = _days(r["begin"], r["end"])
            r["now"] = _covers(r["begin"], vac_end(r) if "recalled" in r else r["end"], today)
    keep = lambda rows: [r for r in rows if _overlaps(r["begin"], r["end"], lo, hi)]   # noqa: E731
    vacations, sick, trips = keep(vacations), keep(sick), keep(trips)
    recalls = [r for r in recalls if _in(r["date"], lo, hi)]
    frame = _frame(db, c, [r["emp"] for r in vacations + sick + trips])
    return {
        "window": {"begin": lo.isoformat(), "end": hi.isoformat()},
        "vacation": {**_meta(snaps["vacation"]), "rows": vacations},
        "recall": {**_meta(snaps["recall"]), "rows": recalls},
        "sick": {**_meta(snaps["sick"]), "rows": sick},
        "trip": {**_meta(snaps["trip"]), "rows": trips},
        "away": away, "kinds": _named_map(snaps["tk"]["rows"], "time_kind_id"),
        **frame, "today": today,
        "loading": _busy(*snaps.values()) or frame["directory_loading"],
    }


# ── Kadr harakati ─────────────────────────────────────────────────────────────

def _where(x: dict) -> dict:
    return {"div": _s(x.get("division_id")) or None, "div_name": _s(x.get("division_name")) or None,
            "unit": _s(x.get("org_unit_id")) or None, "unit_name": _s(x.get("org_unit_name")) or None,
            "job": _s(x.get("job_name")) or None, "sched": _s(x.get("schedule_name")) or None,
            "fte": _s(x.get("fte_name")) or None, "rank": _s(x.get("rank_name")) or None,
            "position": _s(x.get("position_name")) or None}


def _pay(x: dict, indicators: dict) -> list[dict]:
    out = []
    for o in _kids(x, "oper_types"):
        for i in _kids(o, "indicators"):
            v = _f(i.get("indicator_value"))
            iid = _s(i.get("indicator_id"))
            if v is not None:
                out.append({"name": indicators.get(iid) or f"#{iid}", "value": v})
    return out


def _salary(x: dict, key: str = "salary") -> Optional[dict]:
    v = _f(x.get(key))
    return {"value": v, "type": _s(x.get("salary_type")) or None} if v is not None else None


def _hr_pro(kind: str, rows: list[dict], indicators: dict) -> list[dict]:
    out = []
    child = {"hire": "hirings", "transfer": "transfers", "dismissal": "dismissals",
             "schedule": "schedule_changes"}[kind]
    for j in rows:
        jr = _journal(j)
        for x in _kids(j, child):
            r = {**jr, **_who(x), **_where(x), "page": _s(x.get("page_id")) or None}
            if kind == "hire":
                r.update(date=_d_iso(x.get("hiring_date")), trial=_int(x.get("trial_period")),
                         fixed=_yn(x.get("contract_fixed_term")), expiry=_d_iso(x.get("contract_expiry_date")),
                         etype=_s(x.get("employment_type_name")) or None, pay=_pay(x, indicators))
            elif kind == "transfer":
                r.update(date=_d_iso(x.get("transfer_begin")), until=_d_iso(x.get("transfer_end")),
                         reason=_s(x.get("transfer_reason")) or _s(x.get("transfer_base")) or None,
                         etype=_s(x.get("employment_type_name")) or None, pay=_pay(x, indicators))
            elif kind == "dismissal":
                r.update(date=_d_iso(x.get("dismissal_date")), reason=_s(x.get("dismissal_reason_name")) or None,
                         source=_s(x.get("dismissal_source_name")) or None,
                         note=_s(x.get("dismissal_note")) or None)
            else:
                r.update(date=_d_iso(j.get("change_begin_date")), until=_d_iso(j.get("change_end_date")),
                         div=r["div"] or _s(j.get("division_id")) or None,
                         div_name=r["div_name"] or _s(j.get("division_name")) or None)
            out.append(r)
    return out


def _hr_start(kind: str, rows: list[dict]) -> list[dict]:
    out = []
    for x in rows:
        r = {"j": _s(x.get("journal_id")) or None, "page": _s(x.get("page_id")) or None,
             **_who(x), **_where(x)}
        if kind == "hire":
            r.update(date=_d_iso(x.get("hiring_date")), salary=_salary(x))
        elif kind == "transfer":
            r.update(date=_d_iso(x.get("change_date")), salary=_salary(x))
        elif kind == "dismissal":
            r.update(date=_d_iso(x.get("dismissal_date")), reason=_s(x.get("dismissal_reason_name")) or None,
                     note=_s(x.get("note")) or None)
        else:
            r.update(date=_d_iso(x.get("change_date")))
        out.append(r)
    return out


def hr_moves(db: Session, begin: Optional[date], end: Optional[date], force: bool = False) -> dict:
    """Hirings, transfers, dismissals, schedule and rank changes of a period."""
    c = vx.config(db)
    lo, hi = _window(begin, end, 30)
    span = {"journal_begin_date": lo, "journal_end_date": hi}
    got = _first(c, {
        "hire": [("pro/hiring$list", _body("pro/hiring$list", span)),
                 ("start/hiring$list", _body("start/hiring$list"))],
        "transfer": [("pro/transfer$list", _body("pro/transfer$list")),
                     ("start/transfer$list", _body("start/transfer$list"))],
        "dismissal": [("pro/dismissal$list", _body("pro/dismissal$list")),
                      ("start/dismissal$list", _body("start/dismissal$list"))],
        "schedule": [("pro/schedule_change$list", _body("pro/schedule_change$list", span)),
                     ("start/schedule_change$list", _body("start/schedule_change$list"))],
        "rank": [("pro/rank_change$list", _body("pro/rank_change$list"))],
        "ind": [("pro/indicator$list", _body("pro/indicator$list"))],
    }, force)
    indicators = _named_map(got["ind"]["rows"], "indicator_id")
    out: dict[str, Any] = {}
    emp_ids: list = []
    node_ids: list = []
    for kind in ("hire", "transfer", "dismissal", "schedule"):
        s = got[kind]
        pro = s["source"].startswith("pro/")
        rows = _hr_pro(kind, s["rows"], indicators) if pro else _hr_start(kind, s["rows"])
        rows = [r for r in rows if _in(r.get("date"), lo, hi)]
        rows.sort(key=lambda r: r.get("date") or "", reverse=True)
        emp_ids += [r["emp"] for r in rows]
        node_ids += [r.get("unit") for r in rows] + [r.get("div") for r in rows]
        out[kind] = {**_meta(s), "rows": rows}
    rank = got["rank"]
    out["rank"] = {**_meta(rank), "rows": _generic(rank["rows"], lo, hi), "generic": True}
    frame = _frame(db, c, emp_ids, node_ids)
    return {
        "window": {"begin": lo.isoformat(), "end": hi.isoformat()}, **out,
        **frame, "today": _today().isoformat(),
        "loading": _busy(*got.values()) or frame["directory_loading"],
    }


# ── Tabel ─────────────────────────────────────────────────────────────────────

def _tb_staff(x: dict) -> dict:
    return {"staff": _s(x.get("staff_id")) or None, "emp": _s(x.get("employee_id")) or None,
            "name": _s(x.get("employee_name")) or None,
            "div": _s(x.get("division_id")) or None, "div_name": _s(x.get("division_name")) or None,
            "unit": _s(x.get("org_unit_id")) or None, "unit_name": _s(x.get("org_unit_name")) or None,
            "plan_d": _f(x.get("plan_days")), "plan_h": _f(x.get("plan_hours")),
            "fact_d": _f(x.get("fact_days")), "fact_h": _f(x.get("fact_hours")),
            "facts": {_s(f.get("time_kind_id")): _f(f.get("fact_hours")) for f in _kids(x, "facts")
                      if _s(f.get("time_kind_id"))}}


def _tb_head(r: dict) -> dict:
    staffs = [_tb_staff(x) for x in _kids(r, "staffs")]
    return {"id": _s(r.get("timebook_id")), "num": _s(r.get("timebook_number")) or None,
            "date": _d_iso(r.get("timebook_date")), "month": _d_iso(r.get("timebook_month")),
            "begin": _d_iso(r.get("timebook_period_begin")), "end": _d_iso(r.get("timebook_period_end")),
            "div": _s(r.get("division_id")) or None, "div_name": _s(r.get("division_name")) or None,
            "posted": _yn(r.get("posted")), "people": len(staffs),
            "plan_h": _sum(staffs, "plan_h"), "fact_h": _sum(staffs, "fact_h"),
            "modified": _iso(_dt(r.get("modified_on")))}


def _tb_heads(rows: list) -> list:
    return [_tb_head(r) for r in rows if _s(r.get("timebook_id"))]


def timebooks(db: Session, force: bool = False) -> dict:
    c = vx.config(db)
    path = "pro/timebook$list"
    s = _gather(c, {"tb": (path, _body(path), _tb_heads)}, force)["tb"]
    rows = sorted(s["rows"], key=lambda r: (r["month"] or "", r["date"] or "", r["num"] or ""), reverse=True)
    return {"section": _meta(s), "rows": rows, "today": _today().isoformat(), "loading": _busy(s)}


def timebook(db: Session, timebook_id: str, force: bool = False) -> dict:
    """One timebook: each person's plan and fact, by time kind, and day by day."""
    if not timebook_id.isdigit():
        raise LookupError("unknown timebook")
    c = vx.config(db)
    path = "pro/timebook$list"
    one = _start(c, path, _body(path, timebook_ids=[int(timebook_id)]), force)
    det = _start(c, "pro/timebook$list_details",
                 _body("pro/timebook$list_details", {"timebook_id": timebook_id}), force)
    tk = _start(c, "core/time_kind$list", _body("core/time_kind$list"))
    _wait([one, det, tk], FEED_WAIT_S)
    s = _snap(one)
    head = next((r for r in s["rows"] if _s(r.get("timebook_id")) == timebook_id), None)
    if head is None:
        if s["loading"] or s["error"]:
            return {"loading": s["loading"], "error": s["error"], "head": None, "staffs": []}
        raise LookupError("unknown timebook")
    d = _snap(det)
    days: dict[str, list] = {}
    for x in d["rows"]:
        sid = _s(x.get("staff_id"))
        if not sid:
            continue
        days[sid] = [[_d_iso(dd.get("date")), _s(dd.get("day_kind")) or None,
                      {_s(f.get("time_kind_id")): _int(f.get("fact_minutes")) for f in _kids(dd, "facts")
                       if _s(f.get("time_kind_id"))}]
                     for dd in _kids(x, "days")]
    staffs = [{**_tb_staff(x), "days": days.get(_s(x.get("staff_id")))} for x in _kids(head, "staffs")]
    frame = _frame(db, c, [r["emp"] for r in staffs], [r["unit"] for r in staffs] + [r["div"] for r in staffs])
    return {
        "head": _tb_head(head), "staffs": staffs,
        "days_section": _meta(d), "kinds": _named_map(_snap(tk)["rows"], "time_kind_id"),
        **frame, "loading": _busy(s, d) or frame["directory_loading"],
    }


# ── Smenalar ──────────────────────────────────────────────────────────────────

def _shift(x: dict) -> dict:
    return {"id": _s(x.get("shift_id")) or None, "emp": _s(x.get("employee_id")) or None,
            "name": _s(x.get("employee_name")) or None, "date": _d_iso(x.get("shift_date")),
            "begin": _iso(_dt(x.get("begin_time"))), "end": _iso(_dt(x.get("end_time"))),
            "bb": _iso(_dt(x.get("break_begin_time"))), "be": _iso(_dt(x.get("break_end_time"))),
            "plan": _int(x.get("plan_time")), "wp": _s(x.get("workplace_id")) or None,
            "wp_name": _s(x.get("workplace_name")) or None, "job": _s(x.get("job_name")) or None,
            "group": _s(x.get("group_id")) or None, "group_name": _s(x.get("group_name")) or None,
            "status": _s(x.get("status")) or None}


def shifts(db: Session, begin: Optional[date], end: Optional[date], force: bool = False) -> dict:
    c = vx.config(db)
    lo, hi = _window(begin, end, 3, 3)
    span = {"shift_date_begin": lo, "shift_date_end": hi}
    snaps = _gather(c, {
        "shift": ("shift/shift$list", _body("shift/shift$list", span)),
        "groups": ("shift/shift_group$list", _body("shift/shift_group$list")),
        "changes": ("shift/shift_changes$list", _body("shift/shift_changes$list", span)),
    }, force)
    rows = [_shift(x) for x in snaps["shift"]["rows"]]
    rows.sort(key=lambda r: (r["date"] or "", r["begin"] or "", r["name"] or ""))
    groups = [{"id": _s(g.get("group_id")), "name": _s(g.get("name")) or None,
               "color": _s(g.get("bg_color")) or None,
               "begin": _hhmm(_int(g.get("begin_time"))), "end": _hhmm(_int(g.get("end_time"))),
               "plan": _int(g.get("plan_time")), "state": _s(g.get("state")) or "A",
               "code": _s(g.get("code")) or None, "flex": _yn(g.get("can_set_time"))}
              for g in snaps["groups"]["rows"] if _s(g.get("group_id"))]
    changes = [{**_shift(x), "change": _s(x.get("change_id")) or None, "kind": _s(x.get("change_kind")) or None,
                "pub": _s(x.get("publication_status")) or None}
               for x in snaps["changes"]["rows"]]
    changes.sort(key=lambda r: (r["date"] or "", r["begin"] or ""))
    frame = _frame(db, c, [r["emp"] for r in rows + changes], [r["wp"] for r in rows + changes])
    return {
        "window": {"begin": lo.isoformat(), "end": hi.isoformat()},
        "shift": {**_meta(snaps["shift"]), "rows": rows},
        "groups": {**_meta(snaps["groups"]), "rows": groups},
        "changes": {**_meta(snaps["changes"]), "rows": changes},
        **frame, "today": _today().isoformat(),
        "loading": _busy(*snaps.values()) or frame["directory_loading"],
    }


# ── Hodisalar ─────────────────────────────────────────────────────────────────

def incidents(db: Session, begin: Optional[date], end: Optional[date], force: bool = False) -> dict:
    c = vx.config(db)
    lo, hi = _window(begin, end, 90)
    path = "pro/incidents$list"
    s = _gather(c, {"inc": (path, _body(path, {"begin_date": lo, "end_date": hi}))}, force)["inc"]
    rows = []
    for x in s["rows"]:
        rows.append({"id": _s(x.get("event_id")), "date": _d_iso(x.get("event_date")),
                     "num": _s(x.get("event_number")) or None, "type": _s(x.get("event_type_name")) or None,
                     "type_id": _s(x.get("event_type_id")) or None,
                     "emp": _s(x.get("person_id")) or None, "name": _s(x.get("person_name")) or None,
                     "staff": _s(x.get("staff_id")) or None,
                     "resp": _s(x.get("responsible_person_name")) or None,
                     "resp_id": _s(x.get("responsible_person_id")) or None,
                     "action": _s(x.get("action")) or None, "note": _s(x.get("note")) or None})
    rows.sort(key=lambda r: (r["date"] or "", r["num"] or ""), reverse=True)
    frame = _frame(db, c, [r["emp"] for r in rows] + [r["resp_id"] for r in rows])
    return {
        "window": {"begin": lo.isoformat(), "end": hi.isoformat()},
        "section": _meta(s), "rows": rows, **frame, "today": _today().isoformat(),
        "loading": _busy(s) or frame["directory_loading"],
    }


# ── Ma'lumotnomalar ───────────────────────────────────────────────────────────

DICTIONARIES = (
    ("dismissal_reason", "core/dismissal_reason$list"),
    ("request_kind", "core/request_kind$list"),
    ("sick_leave_reason", "pro/sick_leave_reason$list"),
    ("business_trip_reason", "pro/business_trip_reason$list"),
    ("vacation_type", "pro/vacation_type$list"),
    ("employment_source", "pro/employment_source$list"),
    ("fixed_term_base", "pro/fixed_term_base$list"),
    ("indicator", "pro/indicator$list"),
    ("oper_type", "pro/oper_type$list"),
    ("oper_group", "pro/oper_group$list"),
    ("currency", "pro/currency$list"),
    ("cashbox", "pro/cashbox$list"),
    ("wage_scale", "core/wage_scale$list"),
    ("wage_scale_registry", "pro/wage_scale_registry$list"),
    ("division_match", "core/division_match$list"),
    ("job_match", "core/job_match$list"),
)


def dictionaries(db: Session, force: bool = False) -> dict:
    """The small lists the registers refer to, each whole and as Verifix sends
    it (scrubbed)."""
    c = vx.config(db)
    snaps = _gather(c, {k: (p, _body(p)) for k, p in DICTIONARIES}, force)
    lists = {k: {**_meta(s), "rows": vx.scrub(s["rows"])} for k, s in snaps.items()}
    return {"lists": lists, "order": [k for k, _ in DICTIONARIES], "loading": _busy(*snaps.values())}


# ── Ish haqi ──────────────────────────────────────────────────────────────────

PAY_TABS = ("wages", "sheets", "book", "charges", "payments", "accounts", "bytime", "expenses")


def _detail(out: dict, one: dict, detail: Optional[dict]) -> dict:
    out["detail"] = detail
    out["detail_section"] = _meta(one)
    out["busy"] = out.get("busy") or _busy(one)
    return out


def _pay_wages(db, c, lo, hi, doc, force, loc):
    got = _first(c, {"w": [
        ("start/changes/wage$list", _body("start/changes/wage$list", {"begin_date": lo, "end_date": hi})),
        ("start/wage_change$list", _body("start/wage_change$list")),
        ("pro/wage_change$list", _body("pro/wage_change$list")),
    ]}, force)["w"]
    rows: list[dict] = []
    generic = False
    if got["source"] == "start/changes/wage$list":
        for r in got["rows"]:
            for w in _kids(r, "wage_changes"):
                rows.append({"emp": _s(r.get("employee_id")) or None, "name": _s(r.get("employee_name")) or None,
                             "date": _d_iso(w.get("change_date")), "type": _s(w.get("salary_type")) or None,
                             "amount": _f(w.get("salary_amount"))})
    elif got["source"] == "start/wage_change$list":
        for r in got["rows"]:
            rows.append({**_who(r), "date": _d_iso(r.get("change_date")), "type": _s(r.get("salary_type")) or None,
                         "amount": _f(r.get("salary_amount")), "j": _s(r.get("journal_id")) or None})
    else:
        rows, generic = _generic(got["rows"], lo, hi), True
    if not generic:
        rows = [r for r in rows if _in(r["date"], lo, hi)]
        # A raise is read against the same person's previous amount.
        by_emp: dict[str, list] = {}
        for r in sorted(rows, key=lambda r: r["date"] or ""):
            by_emp.setdefault(r.get("emp") or r.get("name") or "", []).append(r)
        for seq in by_emp.values():
            prev = None
            for r in seq:
                r["prev"] = prev
                prev = r["amount"]
        rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return {"section": _meta(got), "rows": rows, "generic": generic,
            "emp_ids": [r.get("emp") for r in rows] if not generic else []}


def _sheet_part(x: dict) -> dict:
    return {**_who(x), "begin": _d_iso(x.get("part_begin")), "end": _d_iso(x.get("part_end")),
            "div": _s(x.get("division_id")) or None, "div_name": _s(x.get("division_name")) or None,
            "job": _s(x.get("job_name")) or None, "sched": _s(x.get("schedule_name")) or None,
            "accrual": _f(x.get("accrual_amount")), "penalty": _f(x.get("penalty_amount")),
            "total": _f(x.get("total_amount"))}


def _sheet_head(r: dict) -> dict:
    parts = [_sheet_part(x) for x in _kids(r, "parts")]
    return {"id": _s(r.get("sheet_id")), "num": _s(r.get("sheet_number")) or None,
            "date": _d_iso(r.get("sheet_date")), "month": _d_iso(r.get("month")),
            "begin": _d_iso(r.get("period_begin")), "end": _d_iso(r.get("period_end")),
            "kind": _s(r.get("period_kind")) or None, "posted": _yn(r.get("posted")),
            "note": _s(r.get("note")) or None, "people": len({p["emp"] or p["staff"] for p in parts}),
            "accrual": _sum(parts, "accrual"), "penalty": _sum(parts, "penalty"), "total": _sum(parts, "total")}


def _sheet_heads(rows: list) -> list:
    return [_sheet_head(r) for r in rows if _s(r.get("sheet_id"))]


def _pay_sheets(db, c, lo, hi, doc, force, loc):
    path = "start/wage_sheet$list"
    span = {"period_begin": lo, "period_end": hi}
    s = _gather(c, {"s": (path, _body(path, span), _sheet_heads)}, force)["s"]
    out = {"section": _meta(s), "rows": sorted(s["rows"], key=lambda r: (r["date"] or "", r["num"] or ""), reverse=True)}
    if doc and doc.isdigit():
        one = _one(c, path, _body(path, span, sheet_ids=[int(doc)]), force)
        r = next((x for x in one["rows"] if _s(x.get("sheet_id")) == doc), None)
        parts = [_sheet_part(x) for x in _kids(r, "parts")] if r else []
        _detail(out, one, {"head": _sheet_head(r), "parts": parts} if r else None)
        out.update(emp_ids=[p["emp"] for p in parts], node_ids=[p["div"] for p in parts])
    return out


def _book_head(r: dict) -> dict:
    ops = _kids(r, "operations")
    return {"id": _s(r.get("book_id")), "num": _s(r.get("book_number")) or None,
            "date": _d_iso(r.get("book_date")), "month": _d_iso(r.get("month")),
            "name": _s(r.get("book_name")) or None, "type": _s(r.get("book_type_name")) or None,
            "currency": _s(r.get("currency_name")) or None, "posted": _yn(r.get("posted")),
            "note": _s(r.get("note")) or None,
            "accrued": _f(r.get("c_accrued_amount")), "deducted": _f(r.get("c_deducted_amount")),
            "income_tax": _f(r.get("c_income_tax_amount")), "pension": _f(r.get("c_pension_payment_amount")),
            "social": _f(r.get("c_social_payment_amount")),
            "lines": len(ops), "people": len({_s(o.get("staff_id")) for o in ops if _s(o.get("staff_id"))})}


def _book_heads(rows: list) -> list:
    return [_book_head(r) for r in rows if _s(r.get("book_id"))]


def _oper(opers: dict, oid: str) -> Optional[str]:
    return opers.get(oid) or (f"#{oid}" if oid else None)


def _pay_book(db, c, lo, hi, doc, force, loc):
    path = "pro/book$list"
    snaps = _gather(c, {"b": (path, _body(path), _book_heads),
                        "ot": ("pro/oper_type$list", _body("pro/oper_type$list"))}, force)
    s = snaps["b"]
    opers = _named_map(snaps["ot"]["rows"], "oper_type_id")
    heads = [h for h in s["rows"] if _in(h["date"], lo, hi) or h["id"] == doc]
    heads.sort(key=lambda r: (r["date"] or "", r["num"] or ""), reverse=True)
    out = {"section": _meta(s), "rows": heads, "busy": _busy(snaps["ot"])}
    if doc and doc.isdigit():
        one = _one(c, path, _body(path, book_ids=[int(doc)]), force)
        r = next((x for x in one["rows"] if _s(x.get("book_id")) == doc), None)
        lines = [{"staff": _s(o.get("staff_id")) or None, "oper": _oper(opers, _s(o.get("oper_type_id"))),
                  "kind": _s(o.get("operation_kind")) or None, "div": _s(o.get("division_id")) or None,
                  "begin": _d_iso(o.get("begin_date")), "end": _d_iso(o.get("end_date")),
                  "amount": _f(o.get("amount")), "net": _f(o.get("net_amount")),
                  "income_tax": _f(o.get("income_tax_amount")), "pension": _f(o.get("pension_payment_amount")),
                  "social": _f(o.get("social_payment_amount")), "note": _s(o.get("note")) or None}
                 for o in (_kids(r, "operations") if r else [])]
        staff, staff_err, staff_loading = _staff(c, [ln["staff"] for ln in lines], force)
        for ln in lines:
            who = staff.get(ln["staff"] or "") or {}
            ln["emp"], ln["name"] = who.get("emp"), who.get("name")
        _detail(out, one, {"head": _book_head(r), "lines": lines} if r else None)
        out.update(staff_error=staff_err, busy=out["busy"] or staff_loading,
                   emp_ids=[ln["emp"] for ln in lines], node_ids=[ln["div"] for ln in lines])
    return out


def _charge_head(r: dict) -> dict:
    ops = _kids(r, "operations")
    return {"id": _s(r.get("document_id")), "num": _s(r.get("document_number")) or None,
            "date": _d_iso(r.get("document_date")), "name": _s(r.get("document_name")) or None,
            "kind": _s(r.get("document_kind")) or None, "month": _d_iso(r.get("month")),
            "div": _s(r.get("division_id")) or None, "currency": _s(r.get("currency_name")) or None,
            "posted": _yn(r.get("posted")), "note": _s(r.get("note")) or None, "base": _s(r.get("base")) or None,
            "lines": len(ops), "total": round(sum(_f(o.get("amount")) or 0 for o in ops), 2) if ops else None}


def _charge_heads(rows: list) -> list:
    return [_charge_head(r) for r in rows if _s(r.get("document_id"))]


def _pay_charges(db, c, lo, hi, doc, force, loc):
    path = "pro/one_time_charge$list"
    snaps = _gather(c, {"d": (path, _body(path), _charge_heads),
                        "ot": ("pro/oper_type$list", _body("pro/oper_type$list"))}, force)
    s = snaps["d"]
    opers = _named_map(snaps["ot"]["rows"], "oper_type_id")
    heads = [h for h in s["rows"] if _in(h["date"], lo, hi) or h["id"] == doc]
    heads.sort(key=lambda r: (r["date"] or "", r["num"] or ""), reverse=True)
    out = {"section": _meta(s), "rows": heads, "busy": _busy(snaps["ot"]), "node_ids": [h["div"] for h in heads]}
    if doc and doc.isdigit():
        one = _one(c, path, _body(path, document_ids=[int(doc)]), force)
        r = next((x for x in one["rows"] if _s(x.get("document_id")) == doc), None)
        lines = [{"emp": _s(o.get("employee_id")) or None, "staff": _s(o.get("staff_id")) or None,
                  "oper": _oper(opers, _s(o.get("oper_type_id"))), "amount": _f(o.get("amount")),
                  "note": _s(o.get("note")) or None} for o in (_kids(r, "operations") if r else [])]
        _detail(out, one, {"head": _charge_head(r), "lines": lines} if r else None)
        out["emp_ids"] = [ln["emp"] for ln in lines]
    return out


def _payment_heads(rows: list) -> list:
    out = []
    for r in rows:
        pid = _s(r.get("payment_id"))
        if not pid:
            continue
        acct = _s(r.get("bank_account_code"))
        out.append({"id": pid, "num": _s(r.get("payment_number")) or None, "date": _d_iso(r.get("payment_date")),
                    "kind": _s(r.get("payment_kind")) or None, "div": _s(r.get("division_id")) or None,
                    "cur_id": _s(r.get("currency_id")) or None, "box_id": _s(r.get("cashbox_id")) or None,
                    "account": vx._mask(acct) if acct else None,
                    "paid": _f(r.get("paid_amount")), "unpaid": _f(r.get("unpaid_amount")),
                    "status": _s(r.get("status")) or None, "note": _s(r.get("note")) or None,
                    "people": len(_kids(r, "employees"))})
    return out


def _pay_payments(db, c, lo, hi, doc, force, loc):
    path = "pro/payment$list"
    snaps = _gather(c, {"p": (path, _body(path), _payment_heads),
                        "cb": ("pro/cashbox$list", _body("pro/cashbox$list")),
                        "cur": ("pro/currency$list", _body("pro/currency$list"))}, force)
    s = snaps["p"]
    boxes = _named_map(snaps["cb"]["rows"], "cashbox_id")
    curs = _named_map(snaps["cur"]["rows"], "currency_id")
    heads = []
    for h in s["rows"]:
        if not (_in(h["date"], lo, hi) or h["id"] == doc):
            continue
        heads.append({**h, "currency": curs.get(h["cur_id"] or "") or None,
                      "via": ({"cashbox": boxes.get(h["box_id"]) or f"#{h['box_id']}"} if h["box_id"]
                              else {"account": h["account"]} if h["account"] else None)})
    heads.sort(key=lambda r: (r["date"] or "", r["num"] or ""), reverse=True)
    out = {"section": _meta(s), "rows": heads, "busy": _busy(snaps["cb"], snaps["cur"])}
    if doc and doc.isdigit():
        one = _one(c, path, _body(path, payment_ids=[int(doc)]), force)
        r = next((x for x in one["rows"] if _s(x.get("payment_id")) == doc), None)
        lines = [{"emp": _s(e.get("employee_id")) or None, "pay": _f(e.get("pay_amount")),
                  "limit": _f(e.get("amount_limit")),
                  "card": vx._mask(e["card_number"]) if _s(e.get("card_number")) else None,
                  "account": vx._mask(e["bank_account_code"]) if _s(e.get("bank_account_code")) else None,
                  "note": _s(e.get("note")) or None} for e in (_kids(r, "employees") if r else [])]
        head = next((h for h in heads if h["id"] == doc), None)
        _detail(out, one, {"head": head, "lines": lines} if r and head else None)
        out["emp_ids"] = [ln["emp"] for ln in lines]
    return out


def _pay_accounts(db, c, lo, hi, doc, force, loc):
    path = "pro/bank_account$list"
    s = _gather(c, {"a": (path, _body(path))}, force)["a"]
    rows = [{"id": _s(r.get("bank_account_id")), "emp": _s(r.get("person_id")) or None,
             "name": _s(r.get("person_name")) or None, "label": _s(r.get("name")) or None,
             "bank": _s(r.get("bank_name")) or None, "mfo": _s(r.get("bank_code")) or None,
             "account": vx._mask(r["code"]) if _s(r.get("code")) else None,
             "card": vx._mask(r["card_number"]) if _s(r.get("card_number")) else None,
             "currency": _s(r.get("currency_name")) or None, "main": _yn(r.get("is_main")),
             "state": _s(r.get("state")) or "A", "note": _s(r.get("note")) or None}
            for r in s["rows"]]
    return {"section": _meta(s), "rows": rows, "emp_ids": [r["emp"] for r in rows]}


def _bt_days(e: dict) -> list[dict]:
    days = []
    for d in _kids(e, "days"):
        ivs = [{"in": _iso(_dt(i.get("input_time"))), "out": _iso(_dt(i.get("output_time"))),
                "in_loc": _s(i.get("input_location_name")) or None,
                "out_loc": _s(i.get("output_location_name")) or None,
                "sec": _int(i.get("turnout_time")), "wage": _f(i.get("wage_amount")),
                "over_sec": _int(i.get("overtime_time")), "over": _f(i.get("overtime_amount"))}
               for i in _kids(d, "intervals")]
        days.append({"date": _d_iso(d.get("date")), "kind": _s(d.get("day_kind")) or None,
                     "kind_name": _s(d.get("day_kind_name")) or None,
                     "plan_sec": _int(d.get("plan_time_seconds")), "rate": _f(d.get("wage")),
                     "sec": sum(i["sec"] or 0 for i in ivs), "over_sec": sum(i["over_sec"] or 0 for i in ivs),
                     "earned": round(sum((i["wage"] or 0) + (i["over"] or 0) for i in ivs), 2), "intervals": ivs})
    return days


def _bt_person(e: dict, days: list[dict]) -> dict:
    rates = [d["rate"] for d in days if d["rate"]]
    return {"emp": _s(e.get("employee_id")) or None, "name": _s(e.get("employee_name")) or None,
            "days": sum(1 for d in days if d["sec"]),
            "plan_h": round(sum(d["plan_sec"] or 0 for d in days) / 3600, 2),
            "work_h": round(sum(d["sec"] for d in days) / 3600, 2),
            "over_h": round(sum(d["over_sec"] for d in days) / 3600, 2),
            "earned": round(sum(d["earned"] for d in days), 2), "rate": rates[-1] if rates else None}


def _bt_people(rows: list) -> list:
    out = []
    for blob in rows:
        for e in _kids(blob, "employees") or ([blob] if blob.get("employee_id") else []):
            out.append(_bt_person(e, _bt_days(e)))
    return out


def _pay_bytime(db, c, lo, hi, doc, force, loc):
    """Pay earned by the clock — one location at a time: the report carries
    every interval of every day of every person, so the whole plant over a
    month would be tens of megabytes."""
    if not (loc and str(loc).isdigit()):
        return {"section": None, "rows": [], "need_loc": True}
    path = "rep/payments_by_time$list"
    span = {"begin_date": lo, "end_date": hi}
    s = _gather(c, {"t": (path, _body(path, span, location_ids=[int(loc)]), _bt_people)}, force)["t"]
    people = sorted(s["rows"], key=lambda r: -(r["earned"] or 0))
    out = {"section": _meta(s), "rows": people, "emp_ids": [r["emp"] for r in people]}
    if doc and doc.isdigit():
        one = _one(c, path, _body(path, span, location_ids=[int(loc)], employee_ids=[int(doc)]), force)
        detail = None
        for blob in one["rows"]:
            for e in _kids(blob, "employees") or ([blob] if blob.get("employee_id") else []):
                if _s(e.get("employee_id")) == doc:
                    days = _bt_days(e)
                    detail = {"head": _bt_person(e, days), "days": days}
        _detail(out, one, detail)
    return out


def _pay_expenses(db, c, lo, hi, doc, force, loc):
    path = "rep/expenses_by_location$list"
    body = _body(path, {"begin_date": lo, "end_date": hi})
    if loc and str(loc).isdigit():
        body["location_ids"] = [int(loc)]
    s = _gather(c, {"x": (path, body)}, force)["x"]
    return {"section": _meta(s), "rows": _flat(s["rows"]), "generic": True}


def payroll(db: Session, tab: str, begin: Optional[date], end: Optional[date],
            doc: Optional[str] = None, loc: Optional[str] = None, force: bool = False) -> dict:
    """One tab of «Ish haqi»; `doc` asks for one document's lines too."""
    if tab not in PAY_TABS:
        raise ValueError("unknown tab")
    c = vx.config(db)
    lo, hi = _window(begin, end, 365 if tab in ("wages", "sheets", "book", "charges", "payments") else 30)
    fn = {"wages": _pay_wages, "sheets": _pay_sheets, "book": _pay_book, "charges": _pay_charges,
          "payments": _pay_payments, "accounts": _pay_accounts, "bytime": _pay_bytime,
          "expenses": _pay_expenses}[tab]
    out = fn(db, c, lo, hi, doc, force, loc)
    frame = _frame(db, c, out.pop("emp_ids", []) or [], out.pop("node_ids", []) or [])
    busy = out.pop("busy", False)
    return {
        "tab": tab, "window": {"begin": lo.isoformat(), "end": hi.isoformat()}, **out,
        **frame, "today": _today().isoformat(),
        "loading": _busy(out["section"]) or busy or frame["directory_loading"],
    }
