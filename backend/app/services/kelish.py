"""«Kelish ro'yxati» — the T11 staff list, kept on the platform (from 2026-09-28).

Checklist task #11 asks a leader for their cell's staff list: every worker, and
beside each name whether they are coming — until now an Excel or Google Sheets
file screenshotted into the bot and read by Gemini. This is that list as a page:
one list per CELL per shift-day, each worker marked «keladi» (`yes`) or
«kelmaydi» (`no`). Nothing here feeds a score — task #11 is untouched until the
operator says otherwise, and the page is admin-only until then.

THE rules, all the operator's (2026-09-28):

  * WHO is on a cell's list is the ORIGINAL Verifix upload
    (`attendance_batch_rows` — the file as uploaded, before any
    people-exchange rewrote `attendance`): every worker it filed under the cell
    in the `WINDOW_DAYS` before the day shown.
  * A worker is on exactly ONE list: the cell of their MOST RECENT row in that
    upload. Verifix itself re-files people — on the 11 Sep copy 105 of 1,487
    workers carried two cell codes within 30 days, every one of those rows an
    untouched file row, 86 of them moved once and stayed — and the latest row
    is the only reading on which nobody stands on two lists.
  * «+» puts a name on a cell's list and «−» takes one off, each until the other
    undoes it. Both count from the cell's CURRENT shift-day (`effective_from`),
    so a past day is never rewritten; the events are append-only and the state
    on day D is the last event with `effective_from` ≤ D.
  * Only TODAY and TOMORROW — the unit's shift-day frame, the rule `/live` and
    «Smena hisoboti» run on — are editable. Earlier days are read-only; later
    ones are not offered.
  * The page reads a whole calendar WEEK at once (from 2026-09-29, `week`):
    each day's list exactly as a single day would be built, laid side by side
    as one row per worker. The file is read ONCE for the whole run of days
    (`file_workers_days`) — one window query per day cost ~0.3 s apiece.
  * A tap cycles empty → yes → no → empty (the third tap CLEARS — the
    operator's call, 2026-09-28). An unmarked worker is the absence of a row,
    so clearing deletes it.

Identity is the folded NAME (`worker_key`): the file carries no employee id,
and its spelling of a person is stable from day to day. «Same person» when a
name is typed by hand is the platform's own strict rule — surname and first
name folding to the same two tokens (`name_map._name_tokens`).

This module computes; `routers/kelish.py` decides who may see and change what.
"""
from __future__ import annotations

import re
from bisect import bisect_right
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import KelishMark, KelishRosterEvent
from app.services import live_overview
from app.services.cell_lookup import norm_code
from app.services.name_map import _name_tokens

WINDOW_DAYS = 30        # «every unique worker for the last 30 days»
QUIET_DAYS = 7          # no worked day for this long → the list says so
STATUSES = ("yes", "no")
NAME_MAX = 120


# ── names ─────────────────────────────────────────────────────────────────────

def clean_name(value) -> str:
    """A name as it will be stored and shown: whitespace collapsed, capped."""
    return re.sub(r"\s+", " ", str(value or "")).strip()[:NAME_MAX]


def worker_key(name: str) -> str:
    """THE identity of a worker on these lists — the folded name.

    Two spellings of one person in the file (a stray space, the two apostrophe
    forms of O'G'LI, Cyrillic against Latin) fold to one key; two people who
    differ anywhere in the name, patronymic included, keep two keys."""
    toks = _name_tokens(name or "")
    if toks:
        return " ".join(toks)
    return clean_name(name).upper()


def same_person(a: str, b: str) -> bool:
    """Is a hand-typed name the person already listed? Surname and first name
    folding to the same two tokens — the platform's strict sameness rule, so a
    typed «Rustamov Xurshidbek» finds RUSTAMOV XURSHIDBEK BAXTIYOR O'G'LI."""
    ta, tb = a.split(), b.split()
    if len(ta) >= 2 and len(tb) >= 2:
        return ta[:2] == tb[:2]
    return a == b


# ── which days ────────────────────────────────────────────────────────────────

def shift_days(windows: dict, shift: Optional[int], now: datetime):
    """(today, tomorrow, frame) for a unit working `shift`.

    Read off the SHIFT FRAME (`live_overview.shift_frame`): the most recent
    shift start names «today», so a night that opened at 20:00 is still today
    at 02:00, and the night that opens this evening is tomorrow. A unit with no
    shift reads the plant's calendar date. `windows` is `cell_hours.defaults`.
    """
    window = windows.get(shift) if shift in (1, 2) else None
    if window:
        frame = live_overview.shift_frame(now, shift, window)
        today = date.fromisoformat(frame["day"])
        return today, today + timedelta(days=1), frame
    today = now.date()
    return today, today + timedelta(days=1), None


def when(day: date, today: date, frame: Optional[dict], now: datetime) -> dict:
    """What the day on screen IS, in wall-clock words, so the page never has to
    guess from the browser's clock. «Tomorrow» on a night shift at 15:00 opens
    TONIGHT — printing a bare «Ertaga» there would send a leader to the wrong
    shift, so the answer carries the hour and which calendar day it falls on."""
    if day < today:
        return {"kind": "past"}
    if frame is None:
        return {"kind": "today" if day == today else "tomorrow"}
    base = {"start": frame["start"], "end": frame["end"], "shift": frame["shift"]}
    if day == today:
        return {"kind": "running" if frame["state"] == "running" else "ended", **base}
    starts = datetime.fromisoformat(frame["next_start_at"])
    return {"kind": "starts_today" if starts.date() == now.date() else "starts_tomorrow", **base}


# ── the file ──────────────────────────────────────────────────────────────────

_ROWS_SQL = text("""
    SELECT upper(trim(r.worker_name))                   AS n,
           r.verifix_code                               AS code,
           r.job_title                                  AS job,
           b.date                                       AS d,
           r.id                                         AS rid,
           (r.status = 'worked' OR r.status LIKE '%:%') AS worked
      FROM attendance_batch_rows r
      JOIN attendance_batches b ON b.id = r.batch_id
     WHERE b.date BETWEEN :lo AND :hi
       AND r.worker_name IS NOT NULL AND trim(r.worker_name) <> ''
       AND r.verifix_code IS NOT NULL AND trim(r.verifix_code) <> ''
""")
_UPLOADS_SQL = text(
    "SELECT DISTINCT date FROM attendance_batches WHERE date BETWEEN :lo AND :hi")


def window(day: date) -> tuple[date, date]:
    """The file days a list for `day` is drawn from: the WINDOW_DAYS before it."""
    return day - timedelta(days=WINDOW_DAYS), day - timedelta(days=1)


def file_workers_days(db: Session, days: Iterable[date]) -> dict:
    """THE file reader: for each of `days`, every worker the original upload
    filed in that day's window, keyed by `worker_key`, each on the cell of their
    MOST RECENT row:

        {day: ({key: {"key", "name", "code", "job", "seen", "came"}}, last_upload)}

    `came` is the last day they actually came (a clocked row), None when every
    row in the window is an absence marker; `last_upload` is the newest file
    day in the window. Fleet-wide on purpose: «the latest row» is a question
    about every cell at once.

    The file is read ONCE for the whole run of days and each day's window is
    cut from it in memory — a week of lists used to be seven window queries.
    Per raw spelling the latest row is the greatest (date, row id), as the
    window query's `ORDER BY date DESC, id DESC` had it; spellings folding to
    one key are then merged exactly as before (the later row places the
    worker, the later of the two «came» days stands), walked in name order so
    a tie always resolves the same way."""
    want = sorted(set(days))
    if not want:
        return {}
    lo, hi = window(want[0])[0], window(want[-1])[1]
    raw: dict[str, list] = {}
    for n, code, job, d, rid, worked in db.execute(_ROWS_SQL, {"lo": lo, "hi": hi}):
        raw.setdefault(n, []).append((d, rid, code, job, bool(worked)))
    uploads = sorted(r[0] for r in db.execute(_UPLOADS_SQL, {"lo": lo, "hi": hi}))

    people = []
    for n in sorted(raw):
        rows = sorted(raw[n], key=lambda r: (r[0], r[1]))
        people.append((worker_key(n), clean_name(n), rows, [r[0] for r in rows],
                       sorted({r[0] for r in rows if r[4]})))

    out: dict = {}
    for day in want:
        wlo, whi = window(day)
        fw: dict = {}
        for k, name, rows, dates, came_days in people:
            i = bisect_right(dates, whi) - 1
            if i < 0 or dates[i] < wlo:
                continue
            d, _rid, code, job, _w = rows[i]
            j = bisect_right(came_days, whi) - 1
            came = came_days[j] if j >= 0 and came_days[j] >= wlo else None
            prev = fw.get(k)
            if prev is not None:
                # Two raw spellings of one person: the later row places them,
                # and the later of the two «came» days stands.
                best_came = max([c for c in (prev["came"], came) if c], default=None)
                if d <= prev["seen"]:
                    prev["came"] = best_came
                    continue
                came = best_came
            fw[k] = {"key": k, "name": name, "code": norm_code(code),
                     "job": (job or "").strip(), "seen": d, "came": came}
        u = bisect_right(uploads, whi) - 1
        out[day] = (fw, uploads[u] if u >= 0 and uploads[u] >= wlo else None)
    return out


def file_workers(db: Session, day: date) -> tuple[dict, Optional[date]]:
    """`file_workers_days` for one day — the map and the newest file day."""
    return file_workers_days(db, [day])[day]


# ── overrides and marks ───────────────────────────────────────────────────────

def load_events(db: Session, cell_ids: Iterable[int]) -> dict[int, list]:
    """{cell_id: [KelishRosterEvent…]} in the order they apply."""
    ids = list(set(cell_ids))
    out: dict[int, list] = {}
    if not ids:
        return out
    for ev in (db.query(KelishRosterEvent)
               .filter(KelishRosterEvent.cell_id.in_(ids))
               .order_by(KelishRosterEvent.effective_from, KelishRosterEvent.id)):
        out.setdefault(ev.cell_id, []).append(ev)
    return out


def load_marks_days(db: Session, cell_ids: Iterable[int],
                    days: Iterable[date]) -> dict[int, dict]:
    """{cell_id: {day: {worker_key: KelishMark}}} for a run of days."""
    ids, ds = list(set(cell_ids)), list(set(days))
    out: dict[int, dict] = {}
    if not ids or not ds:
        return out
    for m in (db.query(KelishMark)
              .filter(KelishMark.cell_id.in_(ids), KelishMark.day.in_(ds))):
        out.setdefault(m.cell_id, {}).setdefault(m.day, {})[m.worker_key] = m
    return out


def load_marks(db: Session, cell_ids: Iterable[int], day: date) -> dict[int, dict]:
    """{cell_id: {worker_key: KelishMark}} for one day."""
    return {cid: by_day.get(day, {})
            for cid, by_day in load_marks_days(db, cell_ids, [day]).items()}


def _state(events: list, day: Optional[date] = None) -> dict:
    """worker_key → the last event in force on `day` (every event when None)."""
    st: dict = {}
    for ev in events or ():
        if day is None or ev.effective_from <= day:
            st[ev.worker_key] = ev
    return st


def removed(events: list) -> list[dict]:
    """The workers «−» has taken off this cell and nobody has put back — what
    «+» offers as suggestions."""
    rows = [{"key": ev.worker_key, "name": ev.worker_name, "job": ev.job_title or ""}
            for ev in _state(events).values() if ev.action == "remove"]
    return sorted(rows, key=lambda r: r["name"].casefold())


# ── the list ──────────────────────────────────────────────────────────────────

def by_code(fw: dict) -> dict[str, dict]:
    """The file map bucketed by cell code, for callers building many lists."""
    out: dict[str, dict] = {}
    for k, w in fw.items():
        out.setdefault(w["code"], {})[k] = w
    return out


def roster(code: str, day: date, fw: dict, last_upload: Optional[date],
           events: list, marks: dict, bucket: Optional[dict] = None) -> list[dict]:
    """One cell's list for one day, marks attached, sorted by name.

    file workers on this cell − those «−» took off + those «+» put on, plus
    anybody already MARKED on this day whom the list no longer names (the
    window moved, a file was re-uploaded) — a mark somebody set must never
    silently disappear from the day it was set on. `bucket` is `by_code(fw)`
    when the caller builds several lists off one file map."""
    ncode = norm_code(code)
    st = _state(events, day)
    rows: dict[str, dict] = {}
    mine = (bucket.get(ncode, {}) if bucket is not None
            else {k: w for k, w in fw.items() if w["code"] == ncode})

    def _row(key, name, job, source, came=None):
        quiet = (last_upload - came).days if (came and last_upload) else None
        return {"key": key, "aliases": [], "name": name, "job": job or "",
                "source": source, "came": came.isoformat() if came else None,
                "quiet": quiet,
                "never": source == "file" and came is None}

    for k, w in mine.items():
        ev = st.get(k)
        if ev is not None and ev.action == "remove":
            continue
        rows[k] = _row(k, w["name"], w["job"], "file", w["came"])

    for k, ev in st.items():
        if ev.action != "add" or k in rows:
            continue
        # A name typed by hand that is the same person the file already lists
        # here is that worker, not a second row for them.
        twin = next((r for r in rows.values()
                     if r["source"] == "file" and same_person(r["key"], k)), None)
        if twin is not None:
            twin["aliases"].append(k)
            continue
        w = fw.get(k)
        came = w["came"] if (w and w["code"] == ncode) else None
        rows[k] = _row(k, ev.worker_name, ev.job_title or (w["job"] if w else ""),
                       "manual", came)

    for k, m in marks.items():
        if k in rows or any(k in r["aliases"] for r in rows.values()):
            continue
        rows[k] = _row(k, m.worker_name, "", "kept")

    for r in rows.values():
        m = marks.get(r["key"]) or next(
            (marks[a] for a in r["aliases"] if a in marks), None)
        r["mark"] = m.status if m else None
        r["by"] = m.set_by_name if m else None
        r["by_key"] = m.set_by_key if m else None
        r["at"] = m.set_at.isoformat() if (m and m.set_at) else None

    return sorted(rows.values(), key=lambda r: r["name"].casefold())


def counts(rows: list[dict]) -> dict:
    yes = sum(1 for r in rows if r["mark"] == "yes")
    no = sum(1 for r in rows if r["mark"] == "no")
    return {"yes": yes, "no": no, "none": len(rows) - yes - no, "total": len(rows)}


def find(rows: list[dict], key: str) -> Optional[dict]:
    """The row a key names — its own key or a hand-typed alias of it."""
    return next((r for r in rows if r["key"] == key or key in r["aliases"]), None)


# ── the week ──────────────────────────────────────────────────────────────────

def week_of(day: date) -> list[date]:
    """The calendar week `day` falls in, Monday → Sunday."""
    mon = day - timedelta(days=day.weekday())
    return [mon + timedelta(days=i) for i in range(7)]


def week(code: str, days: list[date], files: dict, events: list, marks: dict,
         leader_key: Optional[str]) -> tuple[list[dict], list[Optional[dict]]]:
    """One cell's lists over a run of days, laid side by side: ONE row per
    worker, a slot per day.

    Each day's list is `roster` for that day, byte for byte what a single day
    shows — so a square the week draws is a square the mark endpoint accepts.
    `files` is `file_workers_days` for the days that HAVE a list (none after
    tomorrow); a day missing from it is not open yet. A worker is one row
    across days by their key and the hand-typed aliases it carries, and each
    slot keeps the key that day's list uses (`k`), which is what a tap sends.

    `current` is «on the list of the last day that has one»: the rows the
    reader is filling. The rest — taken off, or out of the file's window
    during the week — sort after them.

    Returns (rows, per-day counts; None for a day with no list)."""
    n = len(days)
    rows: dict[str, dict] = {}
    canon: dict[str, str] = {}
    per_day: list[Optional[dict]] = [None] * n
    last_i = None
    for i, d in enumerate(days):
        if d not in files:
            continue
        last_i = i
        fw, last = files[d]
        lst = roster(code, d, fw, last, events, marks.get(d, {}), by_code(fw))
        per_day[i] = counts(lst)
        for r in lst:
            ids = [r["key"], *r["aliases"]]
            ck = next((canon[k] for k in ids if k in canon), None)
            if ck is None:
                ck = r["key"]
                rows[ck] = {"key": ck, "job": "", "days": [None] * n}
            u = rows[ck]
            for k in ids:
                canon[k] = ck
            # Walked in date order, so the latest day's facts are the ones shown.
            u.update(name=r["name"], job=r["job"] or u["job"], source=r["source"],
                     came=r["came"], quiet=r["quiet"], never=r["never"])
            u["days"][i] = {"k": r["key"], "mark": r["mark"], "by": r["by"],
                            "by_other": bool(r["by_key"]) and r["by_key"] != leader_key,
                            "at": r["at"]}
    for u in rows.values():
        u["current"] = last_i is not None and u["days"][last_i] is not None
    out = sorted(rows.values(), key=lambda u: (not u["current"], u["name"].casefold()))
    return out, per_day


# ── writes ────────────────────────────────────────────────────────────────────

def set_mark(db: Session, cell_id: int, day: date, row: dict, status: str,
             by_key: Optional[str], by_name: Optional[str]) -> KelishMark:
    """Upsert one mark. The mark lands on the row's own key and replaces any
    left under a hand-typed alias, so one person never carries two answers."""
    keys = [row["key"], *row["aliases"]]
    now = datetime.now(timezone.utc)
    for attempt in (1, 2):
        existing = (db.query(KelishMark)
                    .filter(KelishMark.cell_id == cell_id, KelishMark.day == day,
                            KelishMark.worker_key.in_(keys)).all())
        m = next((x for x in existing if x.worker_key == row["key"]), None)
        for x in existing:
            if x is not m:
                db.delete(x)
        if m is None:
            m = KelishMark(cell_id=cell_id, day=day, worker_key=row["key"],
                           worker_name=row["name"])
            db.add(m)
        m.status = status
        m.worker_name = row["name"]
        m.set_by_key = by_key
        m.set_by_name = by_name
        m.set_at = now
        try:
            db.commit()
            return m
        except IntegrityError:
            # Two people tapped the same worker at once and both inserted: the
            # other insert won — re-read it and write this answer over it.
            db.rollback()
            if attempt == 2:
                raise
    return m


def clear_mark(db: Session, cell_id: int, day: date, row: dict) -> int:
    """The third tap: the worker goes back to «not filled yet», which is the
    absence of a row — under the row's own key and any hand-typed alias."""
    n = (db.query(KelishMark)
         .filter(KelishMark.cell_id == cell_id, KelishMark.day == day,
                 KelishMark.worker_key.in_([row["key"], *row["aliases"]]))
         .delete(synchronize_session=False))
    db.commit()
    return n


def add_event(db: Session, cell_id: int, key: str, name: str, job: str,
              action: str, today: date, by_key: Optional[str],
              by_name: Optional[str]) -> KelishRosterEvent:
    ev = KelishRosterEvent(cell_id=cell_id, worker_key=key, worker_name=name,
                           job_title=job or None, action=action,
                           effective_from=today, by_key=by_key, by_name=by_name)
    db.add(ev)
    return ev


def drop_marks(db: Session, cell_id: int, keys: list[str], since: date) -> int:
    """A worker taken off the list takes their answers for today and tomorrow
    with them; earlier days keep theirs."""
    if not keys:
        return 0
    return (db.query(KelishMark)
            .filter(KelishMark.cell_id == cell_id, KelishMark.day >= since,
                    KelishMark.worker_key.in_(keys))
            .delete(synchronize_session=False))
