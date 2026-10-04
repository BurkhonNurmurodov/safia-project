"""«Verifix (test)» phase 2 — the registers Verifix keeps (admin-only).

From 2026-10-03 (the operator: "start phase 2") more pages of the section
read what Verifix keeps beyond the people and their marks:

* **Kadr harakati** — `hr_moves`: hirings, transfers, dismissals, schedule and
  rank changes — the Pro module's journals, else the Start module's (the same
  journals seen two ways: one journal id, one page id);
* **Tabel** — `timebooks` + `timebook`: the timebooks, plan against fact;
* **Smenalar** — `shifts`: Verifix's own shift planning;
* **Ma'lumotnomalar** — `dictionaries`: the small lists behind the rest.

«Qurilmalar», «So'rovlar», «Yo'qliklar» and «Hodisalar» were removed on
2026-10-04 (the operator); their methods stay open in the catalog and readable
on the API map's raw viewer.

**No wages.** The operator opened wages on 2026-10-03 and closed them again the
same day: the «Ish haqi» page is gone, every wage / payroll list is `blocked` in
the catalog (never called), and the salary carried by HR journals and the pay
carried by vacations are neither projected nor passed through `scrub`.

**Big lists load in the BACKGROUND.** Most of these methods take no date filter
and page 100 rows at a time, so a register can be many pages long while one
request must answer inside Cloudflare's 100 s. `_start` reads a whole list on a
thread of its own (`FEED_BUDGET_S`, `FEED_PAGES`); a request waits up to
`FEED_WAIT_S` and answers with what has arrived, `loading: true`, and the page
polls until it is in. A finished list is reused for `FEED_TTL`; a forced reload
keeps the previous rows on screen until the new read is done.

Everything the phase-1 module promises holds here: only catalog READ methods are
called, rows are projected field by field (nothing private is copied) or passed
through `verifix_explore.scrub` when shown whole, and nothing is stored.
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
# A list whose rows carry every line of a document (a timebook holds a row per
# person): read a few documents per page, so one page is never tens of
# megabytes, and kept as one summary row per document — a document's lines are
# read when it is opened, narrowed by its id.
PAGE_SIZE = {"pro/timebook$list": 5}
MAX_WINDOW_DAYS = 400
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


def _in(iso: Optional[str], lo: date, hi: date) -> bool:
    return bool(iso) and lo.isoformat() <= iso[:10] <= hi.isoformat()


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


# ── journals ──────────────────────────────────────────────────────────────────

def _journal(j: dict) -> dict:
    posted = j.get("journal_posted") if j.get("journal_posted") is not None else j.get("posted")
    return {"j": _s(j.get("journal_id")) or None, "jnum": _s(j.get("journal_number")) or None,
            "jdate": _d_iso(j.get("journal_date")), "posted": _yn(posted)}


def _who(x: dict) -> dict:
    return {"emp": _s(x.get("employee_id")) or None, "staff": _s(x.get("staff_id")) or None,
            "name": _s(x.get("employee_name")) or _s(x.get("staff_name")) or None}


# ── Kadr harakati ─────────────────────────────────────────────────────────────

def _where(x: dict) -> dict:
    return {"div": _s(x.get("division_id")) or None, "div_name": _s(x.get("division_name")) or None,
            "unit": _s(x.get("org_unit_id")) or None, "unit_name": _s(x.get("org_unit_name")) or None,
            "job": _s(x.get("job_name")) or None, "sched": _s(x.get("schedule_name")) or None,
            "fte": _s(x.get("fte_name")) or None, "rank": _s(x.get("rank_name")) or None,
            "position": _s(x.get("position_name")) or None}


def _hr_pro(kind: str, rows: list[dict]) -> list[dict]:
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
                         etype=_s(x.get("employment_type_name")) or None)
            elif kind == "transfer":
                r.update(date=_d_iso(x.get("transfer_begin")), until=_d_iso(x.get("transfer_end")),
                         reason=_s(x.get("transfer_reason")) or _s(x.get("transfer_base")) or None,
                         etype=_s(x.get("employment_type_name")) or None)
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
            r.update(date=_d_iso(x.get("hiring_date")))
        elif kind == "transfer":
            r.update(date=_d_iso(x.get("change_date")))
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
    }, force)
    out: dict[str, Any] = {}
    emp_ids: list = []
    node_ids: list = []
    for kind in ("hire", "transfer", "dismissal", "schedule"):
        s = got[kind]
        pro = s["source"].startswith("pro/")
        rows = _hr_pro(kind, s["rows"]) if pro else _hr_start(kind, s["rows"])
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


# ── Ma'lumotnomalar ───────────────────────────────────────────────────────────

DICTIONARIES = (
    ("dismissal_reason", "core/dismissal_reason$list"),
    ("request_kind", "core/request_kind$list"),
    ("sick_leave_reason", "pro/sick_leave_reason$list"),
    ("business_trip_reason", "pro/business_trip_reason$list"),
    ("vacation_type", "pro/vacation_type$list"),
    ("employment_source", "pro/employment_source$list"),
    ("fixed_term_base", "pro/fixed_term_base$list"),
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
