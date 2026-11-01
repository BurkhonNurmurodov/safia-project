"""THE «Trello» page's figures — computed per request from one board's stored
snapshot (``trello_boards.data``, written by ``services/trello.py``).

Pure: it reads a snapshot and the board's two settings and queries nothing,
so the same function answers the page and could answer an export.

What a card IS on the page:

- **open** — not archived, and its list is not a «done» list;
- **done** — not archived, in a «done» list;
- **archived** — archived itself, or sitting in an archived list (Trello hides
  both). It counts as FINISHED when the board says so (``archived_done``, on
  by default: most teams archive their «Done» column), else it leaves every
  figure but the archived count.

«Done» lists are the ones an admin picked; with none picked, the lists whose
NAME says so (``DONE_RE``, in the four languages the plant writes).

When a card was **created** comes from its id (Trello ids start with the
creation second), so it is exact for every card. When it **finished** comes
from the board's action history: the last time it moved into a «done» list,
else (archived and counted) the last time it was archived. A card whose
history Trello no longer returns falls back to its last activity and is
counted as ``approx`` — never silently dated.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Tashkent")

STALE_DAYS = 14          # an open card nobody touched this long is «stale»
MAX_DAYS = 731           # the longest period the flow chart takes
MIN_DAYS = 7             # date axes never show fewer (utils/chartRange.js)
DEFAULT_DAYS = 84        # twelve weeks
DAILY_UP_TO = 45         # longer periods are drawn in weeks
MAX_OLDEST = 1000        # rows the oldest-cards table carries
AGE_BANDS = ((0, 7), (8, 30), (31, 90), (91, 180), (181, None))

DONE_RE = re.compile(
    r"(done|complete|finish|closed|shipped|released|"
    r"готов|выполн|сделан|заверш|закрыт|"
    r"bajarild|bajarilgan|tayyor|tugadi|tugallan|yakunlan|"
    r"бажарил|бажарилган|тайёр|тугади|якунлан)",
    re.I)


# ── reading the snapshot ─────────────────────────────────────────────────────

def created_at(card_id: str) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(card_id[:8], 16), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def local_day(dt: datetime) -> date:
    return dt.astimezone(TZ).date()


def done_set(lists: list, picked: Optional[list]) -> tuple[set, bool]:
    """(the «done» list ids, whether they were recognised by name)."""
    ids = {l["id"] for l in lists}
    if picked is not None:
        return {i for i in picked if i in ids}, False
    return {l["id"] for l in lists if DONE_RE.search(l.get("name") or "")}, True


class Card:
    __slots__ = ("id", "name", "url", "short", "list_id", "labels", "members", "state",
                 "created", "activity", "due", "due_done", "finished", "finished_at", "approx")


def cards_of(data: dict, done: set, archived_done: bool) -> list[Card]:
    lists = {l["id"]: l for l in data.get("lists") or []}
    moves = data.get("moves") or {}
    out = []
    for k in data.get("cards") or []:
        c = Card()
        c.id = k["id"]
        c.name = k.get("n") or ""
        c.url = k.get("u")
        c.short = k.get("s")
        c.list_id = k.get("l")
        c.labels = k.get("lb") or []
        c.members = k.get("m") or []
        lst = lists.get(c.list_id)
        if k.get("c") or (lst and lst.get("closed")):
            c.state = "archived"
        elif c.list_id in done:
            c.state = "done"
        else:
            c.state = "open"
        c.created = created_at(c.id)
        c.activity = parse_iso(k.get("a"))
        c.due = parse_iso(k.get("d"))
        c.due_done = bool(k.get("dc"))
        c.finished = c.state == "done" or (c.state == "archived" and archived_done)
        c.finished_at, c.approx = None, False
        if c.finished:
            seq = moves.get(c.id) or []
            into_done = [m[0] for m in seq if m[1] in ("m", "n") and m[2] in done]
            closed = [m[0] for m in seq if m[1] == "c" and m[2] == 1]
            when = into_done[-1] if into_done else (closed[-1] if c.state == "archived" and closed else None)
            c.finished_at = parse_iso(when)
            if c.finished_at is None:
                c.finished_at, c.approx = c.activity or c.created, True
        out.append(c)
    return out


# ── the period ───────────────────────────────────────────────────────────────

def window(date_from: Optional[date], date_to: Optional[date], today: date) -> tuple[date, date]:
    d1 = min(date_to or today, today)
    d0 = date_from or (d1 - timedelta(days=DEFAULT_DAYS - 1))
    if d0 > d1:
        d0, d1 = d1, d0
    if (d1 - d0).days + 1 < MIN_DAYS:
        d0 = d1 - timedelta(days=MIN_DAYS - 1)
    if (d1 - d0).days + 1 > MAX_DAYS:
        d0 = d1 - timedelta(days=MAX_DAYS - 1)
    return d0, d1


def buckets(d0: date, d1: date) -> tuple[str, list[date]]:
    """Daily up to DAILY_UP_TO days, else weeks starting on Monday."""
    if (d1 - d0).days + 1 <= DAILY_UP_TO:
        return "day", [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
    start = d0 - timedelta(days=d0.weekday())
    out = []
    while start <= d1:
        out.append(start)
        start += timedelta(days=7)
    return "week", out


def _bucket_of(day: date, grain: str) -> date:
    return day if grain == "day" else day - timedelta(days=day.weekday())


def _days(a: datetime, b: datetime) -> float:
    return max(0.0, (b - a).total_seconds() / 86400.0)


def _r1(x: Optional[float]) -> Optional[float]:
    return None if x is None else round(x, 1)


# ── the page ─────────────────────────────────────────────────────────────────

def build(row, *, date_from: Optional[date] = None, date_to: Optional[date] = None,
          labels: Iterable[str] = (), lists: Iterable[str] = (),
          now: Optional[datetime] = None) -> dict:
    """Everything the /trello page draws for one board. `row` is a
    TrelloBoard (or anything with `data`, `done_lists`, `archived_done`)."""
    now = now or datetime.now(timezone.utc)
    today = local_day(now)
    data = row.data or {}
    all_lists = data.get("lists") or []
    done, auto = done_set(all_lists, row.done_lists)
    archived_done = bool(row.archived_done)
    cards = cards_of(data, done, archived_done)

    label_by = {l["id"]: l for l in data.get("labels") or []}
    member_by = {m["id"]: m.get("name") or "" for m in data.get("members") or []}
    list_by = {l["id"]: l for l in all_lists}

    lab_sel, list_sel = set(labels or ()), set(lists or ())
    if lab_sel:
        no_label = "none" in lab_sel
        cards = [c for c in cards if (set(c.labels) & lab_sel) or (no_label and not c.labels)]
    if list_sel:
        cards = [c for c in cards if c.list_id in list_sel]

    open_ = [c for c in cards if c.state == "open"]
    ages = [_days(c.created, now) for c in open_ if c.created]
    idle = {c.id: (_days(c.activity, now) if c.activity else None) for c in open_}
    stale = [c for c in open_ if (idle[c.id] or 0) >= STALE_DAYS]

    # ── workflow snapshot ────────────────────────────────────────────────
    per_list: dict[str, list[Card]] = {}
    for c in cards:
        if c.state != "archived":
            per_list.setdefault(c.list_id, []).append(c)
    list_rows = []
    for l in sorted(all_lists, key=lambda x: x.get("pos") or 0):
        if l.get("closed"):
            continue
        cs = per_list.get(l["id"], [])
        if list_sel and l["id"] not in list_sel:
            continue
        a = [_days(c.created, now) for c in cs if c.created]
        list_rows.append({
            "id": l["id"], "name": l["name"], "done": l["id"] in done, "cards": len(cs),
            "stale": sum(1 for c in cs if c.state == "open" and (idle.get(c.id) or 0) >= STALE_DAYS),
            "avg_age": _r1(sum(a) / len(a)) if a else None,
        })

    lab_count = Counter()
    unlabelled = 0
    for c in open_:
        if c.labels:
            lab_count.update(c.labels)
        else:
            unlabelled += 1
    label_rows = [{"id": lid, "name": label_by[lid].get("name") or "", "color": label_by[lid].get("color"),
                   "cards": n} for lid, n in lab_count.most_common() if lid in label_by]
    if unlabelled:
        label_rows.append({"id": "none", "name": None, "color": None, "cards": unlabelled})

    bands = []
    for lo, hi in AGE_BANDS:
        n = sum(1 for a in ages if a >= lo and (hi is None or a < hi + 1))
        bands.append({"from": lo, "to": hi, "cards": n})

    # ── the oldest open cards ────────────────────────────────────────────
    oldest = sorted(open_, key=lambda c: c.created or now)
    oldest_rows = []
    for c in oldest[:MAX_OLDEST]:
        lst = list_by.get(c.list_id) or {}
        oldest_rows.append({
            "id": c.id, "name": c.name, "url": c.url, "short": c.short,
            "list": lst.get("name"), "list_id": c.list_id,
            "labels": [{"name": label_by[i].get("name") or "", "color": label_by[i].get("color")}
                       for i in c.labels if i in label_by],
            "members": [member_by[i] for i in c.members if member_by.get(i)],
            "created": local_day(c.created).isoformat() if c.created else None,
            "age": int(_days(c.created, now)) if c.created else None,
            "idle": int(idle[c.id]) if idle.get(c.id) is not None else None,
            "due": local_day(c.due).isoformat() if c.due else None,
            "overdue": bool(c.due and not c.due_done and c.due < now),
        })

    # ── flow over time ───────────────────────────────────────────────────
    d0, d1 = window(date_from, date_to, today)
    grain, keys = buckets(d0, d1)
    made, fin = Counter(), Counter()
    leads, approx = [], 0
    for c in cards:
        if c.created:
            day = local_day(c.created)
            if d0 <= day <= d1:
                made[_bucket_of(day, grain)] += 1
        if c.finished and c.finished_at:
            day = local_day(c.finished_at)
            if d0 <= day <= d1:
                fin[_bucket_of(day, grain)] += 1
                if c.created:
                    leads.append(_days(c.created, c.finished_at))
                if c.approx:
                    approx += 1
    flow = {
        "grain": grain,
        "points": [{"start": k.isoformat(), "created": made.get(k, 0), "finished": fin.get(k, 0)} for k in keys],
        "created": sum(made.values()),
        "finished": sum(fin.values()),
        "lead_avg": _r1(sum(leads) / len(leads)) if leads else None,
        "lead_median": _r1(median(leads)) if leads else None,
        "lead_n": len(leads),
        "approx": approx,
    }

    return {
        "date_from": d0.isoformat(),
        "date_to": d1.isoformat(),
        "stale_days": STALE_DAYS,
        "done_lists": [{"id": l["id"], "name": l["name"]} for l in all_lists if l["id"] in done],
        "done_auto": auto,
        "archived_done": archived_done,
        "totals": {
            "cards": len(cards),
            "open": len(open_),
            "done": sum(1 for c in cards if c.state == "done"),
            "archived": sum(1 for c in cards if c.state == "archived"),
            "stale": len(stale),
            "age_avg": _r1(sum(ages) / len(ages)) if ages else None,
            "age_median": _r1(median(ages)) if ages else None,
            "age_max": int(max(ages)) if ages else None,
        },
        "lists": list_rows,
        "labels": label_rows,
        "age_bands": bands,
        "oldest": oldest_rows,
        "oldest_total": len(open_),
        "flow": flow,
        "history_from": data.get("history_from"),
        "history_truncated": bool(data.get("actions_truncated")),
        "options": {
            "lists": [{"id": l["id"], "name": l["name"], "done": l["id"] in done}
                      for l in sorted(all_lists, key=lambda x: x.get("pos") or 0) if not l.get("closed")],
            "labels": [{"id": l["id"], "name": l.get("name") or "", "color": l.get("color")}
                       for l in data.get("labels") or []],
        },
    }
