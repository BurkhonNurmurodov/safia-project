"""The in-app notification centre — THE definition (2026-10-01).

The bell lost to the Telegram bot because it was a worse copy of it: the newest
fifty rows (four to five hours of an admin's day), every row a dead end, read
state kept in whichever browser happened to be open, and nothing it said ever
learned that the request it announced had been decided. The centre gives it the
two jobs Telegram cannot do:

1. **The QUEUE** («Sizdan kutilmoqda») — what is waiting on THIS viewer right
   now, read from the live records and never from bell rows, so an item leaves
   the moment anybody deals with it. The red badge counts this and nothing
   else, which is what lets it reach zero. Built in ``services.notif_queue``.
2. **The FEED** — what happened, newest first. Each row opens the record it is
   about (``subject_kind`` + ``subject_id`` → ``link_for``), repeats of one
   kind on one day fold into one line (``FOLD``), every update about one record
   folds into one thread, and read state is kept per PERSON on the server
   (``notification_reads`` + ``notification_read_marks``).

Plus per-category delivery (``notification_prefs``): the app always shows
everything; a person may ask the bot to stop DMing a category of their own
(``telegram_muted``). No row = Telegram on, so nothing changed for anybody who
never opened the settings.

Bell rows written before 2026-10-01 carry display text and no subject: they
stay readable history, link nowhere and fold only by kind. Every row at or below
``notif_read_floor_id`` (written once at the first boot) counts as read.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import (
    AppSetting, Notification, NotificationPref, NotificationRead,
    NotificationReadMark,
)

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")

# ── categories ────────────────────────────────────────────────────────────────
# Every notification key belongs to exactly one. A category is what the
# settings switch and the page filter speak in — eighty-six keys are not
# something a person can choose between. Order = the order both lists show.
CATEGORIES = (
    "approvals", "day", "concerns", "tasks", "checklist", "appeals", "idle",
    "learning", "other",
)

_EXACT = {
    # HR requests and documents — what an admin or shift manager decides.
    "new_edit_request": "approvals", "new_delete_request": "approvals",
    "bulk_delete_request": "approvals", "new_role_change": "approvals",
    "worker_exchange_created": "approvals", "worker_exchange_approved": "approvals",
    "worker_exchange_cancelled": "approvals", "role_change_approved": "approvals",
    "request_approved_others": "approvals", "request_approved_supervisor": "approvals",
    "request_rejected_others": "approvals", "request_rejected_supervisor": "approvals",
    "request_undone": "approvals", "document_rejected": "approvals",
    # Attendance and the day close.
    "day_closed": "day", "day_reopened": "day", "verifix_uploaded": "day",
    "admin_record_edited": "day", "admin_record_deleted": "day",
    "idle_request_new": "idle",
    "education_lesson_new": "learning",
    "call_forecast": "other",
}
_PREFIX = (
    ("concern_", "concerns"),
    ("task_", "tasks"),
    ("leader_dispute_", "appeals"),
    ("late_proof_", "appeals"),
    ("leader_", "checklist"),
    ("exam_", "learning"),
)


def category_of(nkey: Optional[str]) -> str:
    """The category a notification key belongs to. A free-form row (an admin
    broadcast, a legacy row) and a key nobody mapped are «other» — shown, never
    dropped."""
    if not nkey:
        return "other"
    cat = _EXACT.get(nkey)
    if cat:
        return cat
    for prefix, cat in _PREFIX:
        if nkey.startswith(prefix):
            return cat
    return "other"


def unmapped_keys() -> list[str]:
    """Template keys that fall through to «other» without being listed there on
    purpose — printed at boot, because a new key belongs somewhere deliberate."""
    from app.routers.staff import _NOTIF_STRINGS
    return sorted(k for k in _NOTIF_STRINGS
                  if category_of(k) == "other" and k not in _EXACT)


# ── delivery preferences ──────────────────────────────────────────────────────

def prefs_for(db: Session, profile: Optional[str]) -> dict[str, bool]:
    """Category → «also DM it in Telegram» for one profile. Absent = True."""
    out = {c: True for c in CATEGORIES}
    if not profile:
        return out
    for p in db.query(NotificationPref).filter(NotificationPref.profile == profile).all():
        if p.category in out:
            out[p.category] = bool(p.telegram)
    return out


def set_prefs(db: Session, profile: str, changes: dict) -> dict[str, bool]:
    """Write the switches named in ``changes``; returns the full map. A switch
    turned back ON deletes its row, so «on» is always the absence of a record."""
    for cat, on in (changes or {}).items():
        if cat not in CATEGORIES:
            continue
        row = db.get(NotificationPref, (profile, cat))
        if on:
            if row is not None:
                db.delete(row)
        elif row is None:
            db.add(NotificationPref(profile=profile, category=cat, telegram=False))
        else:
            row.telegram = False
    db.flush()
    return prefs_for(db, profile)


def telegram_muted(db: Session, profile: Optional[str], nkey: Optional[str]) -> bool:
    """True when ``profile`` asked the bot not to DM this key's category. The
    bell row is written either way — this decides the DM alone."""
    if not profile:
        return False
    row = db.get(NotificationPref, (profile, category_of(nkey)))
    return row is not None and not row.telegram


# ── subjects and links ────────────────────────────────────────────────────────
# A subject is (kind, id) — the record a bell row is ABOUT. The link is derived
# here at READ time, never stored, so a route that moves moves every row with it.

def subject_cols(subject) -> tuple[Optional[str], Optional[str]]:
    if not subject:
        return None, None
    kind, sid = subject
    if not kind or sid is None or str(sid) == "":
        return None, None
    return str(kind), str(sid)


def link_for(kind: Optional[str], sid: Optional[str]) -> Optional[str]:
    """The in-app path a subject opens, or None. Every route here is one the
    page itself reads — the deep-link params are named beside each, and the
    page that reads them says so where it reads them."""
    if not kind or not sid:
        return None
    if kind == "concern":                      # Concerns.jsx reads ?open=
        return f"/concerns?open={sid}"
    if kind == "task":                         # Tasks.jsx reads ?open=
        return f"/tasks?open={sid}"
    if kind == "leader_report":                # the day report, by its uid
        return f"/leaders/report/{quote(sid, safe='')}"
    if kind == "unit_report":                  # "<manager id>:<YYYY-MM-DD>"
        mid, _, d = sid.partition(":")
        return f"/leaders/unit-report/{mid}/{d}" if mid.isdigit() and d else None
    if kind == "dispute":                      # the appeal chat
        return f"/leaders/appeal/dispute/{sid}"
    if kind == "late_proof":
        return f"/leaders/appeal/late/{sid}"
    if kind == "checklist":                    # "<leader profile id>:<date>:<task id>"
        pid, d, task = (sid.split(":") + ["", "", ""])[:3]
        if not pid.isdigit():
            return "/leaders?tab=checklist"
        url = f"/leaders?tab=checklist&leader={pid}"
        if d:
            url += f"&date={d}"
        if task.isdigit():
            url += f"&open={task}"
        return url
    if kind == "leaders_tab" and sid in ("monitor", "checklist", "disputes", "lateproof"):
        return f"/leaders?tab={sid}"
    if kind in ("hr_doc", "edit_request", "edit_batch"):   # Staff.jsx reads ?tab=
        return "/staff?tab=requests"
    if kind == "unit_day":                     # "<manager id>:<YYYY-MM-DD>"
        mid, _, d = sid.partition(":")
        if not mid.isdigit() or not d:
            return "/staff"
        return f"/staff?tab=workers&unit={mid}&date={d}"
    if kind == "idle":                         # IdleCell.jsx reads ?date=
        return f"/idle-cell?date={sid}"
    if kind == "page" and sid in ("/production", "/concerns"):
        return sid
    if kind == "lesson":
        return "/education"
    if kind == "exam":
        return "/exam"
    if kind == "forecast":
        return "/trudoyomkost"
    return None


# ── read state ────────────────────────────────────────────────────────────────

_FLOOR: Optional[int] = None


def read_floor(db: Session) -> int:
    """Every row at or below this id is read for everybody (see the module
    docstring). Cached once known — it is written once and never moves."""
    global _FLOOR
    if _FLOOR is not None:
        return _FLOOR
    row = db.get(AppSetting, "notif_read_floor_id")
    if row is None:
        return 0
    try:
        _FLOOR = int(row.value)
    except (TypeError, ValueError):
        _FLOOR = 0
    return _FLOOR


def reader_key(db: Session, payload: dict) -> str:
    """WHO is reading: the session's active PROFILE (the person), so a phone,
    a desktop and the Android app give one answer. ``acct:<id>`` only for a
    session that resolves to no profile (a legacy unbound admin)."""
    from app.identity import viewer_profile_key
    return viewer_profile_key(db, payload) or f"acct:{payload.get('sub')}"


def marks(db: Session, reader: str) -> tuple[int, int]:
    """(read watermark, seen watermark) — both at least the floor."""
    floor = read_floor(db)
    m = db.get(NotificationReadMark, reader)
    if m is None:
        return floor, floor
    return max(floor, m.upto_id or 0), max(floor, m.seen_upto or 0)


def _mark_row(db: Session, reader: str) -> NotificationReadMark:
    m = db.get(NotificationReadMark, reader)
    if m is None:
        m = NotificationReadMark(reader=reader, upto_id=0, seen_upto=0)
        db.add(m)
    return m


def viewer_clause(db: Session, payload: dict):
    """THE rule for which bell rows a session reads: broadcasts, the account's
    own legacy rows, and rows addressed to its ACTIVE profile — never another
    profile the same account holds."""
    from app.identity import viewer_profile_key
    telegram_id = int(payload["sub"])
    conds = [and_(
        Notification.recipient_profile.is_(None),
        or_(Notification.recipient_telegram_id.is_(None),
            Notification.recipient_telegram_id == telegram_id),
    )]
    pk = viewer_profile_key(db, payload)
    if pk:
        conds.append(Notification.recipient_profile == pk)
    return or_(*conds)


def read_set(db: Session, reader: str, ids: Iterable[int]) -> set[int]:
    """Which of ``ids`` the reader marked read one by one."""
    ids = [i for i in ids if i is not None]
    if not ids:
        return set()
    rows = db.query(NotificationRead.notification_id).filter(
        NotificationRead.reader == reader,
        NotificationRead.notification_id.in_(ids),
    ).all()
    return {r[0] for r in rows}


def mark_read(db: Session, payload: dict, ids: Iterable[int]) -> int:
    """Mark the viewer's own rows read. Ids the viewer cannot see are ignored —
    a typed id must not plant a mark on somebody else's row."""
    reader = reader_key(db, payload)
    upto, _ = marks(db, reader)
    want = {int(i) for i in ids if str(i).lstrip("-").isdigit() and int(i) > upto}
    if not want:
        return 0
    visible = {r[0] for r in db.query(Notification.id).filter(
        Notification.id.in_(want), viewer_clause(db, payload)).all()}
    have = read_set(db, reader, visible)
    added = 0
    for nid in sorted(visible - have):
        db.add(NotificationRead(notification_id=nid, reader=reader))
        added += 1
    db.flush()
    return added


def mark_all_read(db: Session, payload: dict) -> int:
    """«Hammasini o'qildi»: one watermark at the newest row the viewer has.
    Returns the watermark. Individual marks under it are now redundant."""
    reader = reader_key(db, payload)
    top = db.query(func.max(Notification.id)).filter(viewer_clause(db, payload)).scalar() or 0
    m = _mark_row(db, reader)
    m.upto_id = max(m.upto_id or 0, int(top))
    m.seen_upto = max(m.seen_upto or 0, int(top))
    db.query(NotificationRead).filter(
        NotificationRead.reader == reader,
        NotificationRead.notification_id <= m.upto_id,
    ).delete(synchronize_session=False)
    db.flush()
    return m.upto_id


def mark_seen(db: Session, payload: dict, upto: int) -> None:
    """The bell was opened with rows up to ``upto`` on screen: its «something
    new» dot is measured from here. Never moves backwards."""
    reader = reader_key(db, payload)
    top = db.query(func.max(Notification.id)).filter(viewer_clause(db, payload)).scalar() or 0
    upto = min(int(upto or 0), int(top))
    m = _mark_row(db, reader)
    m.seen_upto = max(m.seen_upto or 0, upto)
    db.flush()


def counts(db: Session, payload: dict) -> dict:
    """{unread, fresh} for the polled badge — both capped at 99, both cheap:
    only rows above the reader's watermarks are ever looked at."""
    reader = reader_key(db, payload)
    upto, seen = marks(db, reader)
    clause = viewer_clause(db, payload)
    above = db.query(Notification.id).filter(clause, Notification.id > upto) \
        .order_by(Notification.id.desc()).limit(500).all()
    ids = [r[0] for r in above]
    read = read_set(db, reader, ids)
    unread = sum(1 for i in ids if i not in read)
    fresh = sum(1 for i in ids if i > seen and i not in read)
    return {"unread": min(unread, 99), "fresh": min(fresh, 99)}


# ── rendering ─────────────────────────────────────────────────────────────────

def render(r: Notification, lang: str) -> tuple[str, str]:
    """(title, body) in the VIEWER's language — the template re-rendered when
    the row has one, the stored text transliterated when it does not."""
    from app.routers.staff import _mk_notif
    from app.translit import transliterate_text
    if r.nkey:
        try:
            return _mk_notif(r.nkey, r.params or {}, lang)
        except Exception:
            return r.title or r.nkey, r.body or ""
    return transliterate_text(r.title or "", lang), transliterate_text(r.body or "", lang)


def local_day(ts: Optional[datetime]) -> Optional[date]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(TZ).date()


def today_local() -> date:
    return datetime.now(TZ).date()


def _day_bounds(d: date) -> datetime:
    """The UTC instant the Tashkent day ``d`` starts."""
    return datetime.combine(d, time.min, tzinfo=TZ).astimezone(timezone.utc)


# ── folding ───────────────────────────────────────────────────────────────────
# Keys whose rows on one day fold into ONE feed line — bursts nobody reads one
# by one (an admin's 28 «kun yopildi» a day). Value: the param naming who each
# folded row is about (listed under the line), and the param summed into a
# second figure (people moved), either may be None.
FOLD = {
    "day_closed":                ("closer_name",     None),
    "day_reopened":              ("reopener_name",   None),
    "new_role_change":           ("actor_name",      "count"),
    "worker_exchange_created":   ("actor_name",      "count"),
    "worker_exchange_approved":  ("target",          "count"),
    "worker_exchange_cancelled": ("target",          "count"),
    "role_change_approved":      ("new_role",        "count"),
    "request_approved_others":   ("supervisor_name", None),
    "request_rejected_others":   ("supervisor_name", None),
    "new_edit_request":          ("supervisor_name", None),
    "new_delete_request":        ("supervisor_name", None),
    "admin_record_edited":       ("worker_name",     None),
    "admin_record_deleted":      ("worker_name",     None),
    "leader_day_report_clean":   ("leader",          None),
    "idle_request_new":          ("leader_name",     None),
}

def _row_json(r: Notification, lang: str, unread: bool) -> dict:
    title, body = render(r, lang)
    return {
        "id": r.id,
        "title": title,
        "body": body,
        "type": r.type or "info",
        "nkey": r.nkey,
        "category": category_of(r.nkey),
        "link": link_for(r.subject_kind, r.subject_id),
        "at": r.created_at.isoformat() if r.created_at else None,
        "unread": unread,
    }


def fold(rows: list[Notification], lang: str, unread_ids: set[int]) -> list[dict]:
    """Rows (newest first) → feed entries (newest first). Three shapes:

    * ``group``  — every row of one FOLD key on one Tashkent day, one line;
    * ``thread`` — every row about one subject (a concern's create → comment →
      resolve), shown as its newest row with the count;
    * ``single`` — everything else.
    """
    from app.routers.staff import _NAME_PARAMS
    entries: dict[str, dict] = {}
    order: list[str] = []
    for r in rows:
        day = local_day(r.created_at)
        unread = r.id in unread_ids
        if r.nkey in FOLD:
            key = f"g:{r.nkey}:{day}"
        elif r.subject_kind and r.subject_id:
            key = f"t:{r.subject_kind}:{r.subject_id}"
        else:
            key = f"n:{r.id}"
        e = entries.get(key)
        if e is None:
            e = _row_json(r, lang, unread)
            e.update({
                "key": key,
                "kind": "single" if key.startswith("n:") else ("group" if key.startswith("g:") else "thread"),
                "day": day.isoformat() if day else None,
                "count": 0,
                "ids": [],
            })
            if e["kind"] == "group":
                name_p = FOLD[r.nkey][0]
                # Raw values: the client spells them — a PERSON through its
                # name rules (tl, with the Translations overrides keyed by the
                # raw spelling), anything else as ordinary text (tx).
                e["items"], e["names"], e["sum"] = [], [], 0
                e["names_kind"] = "people" if name_p in _NAME_PARAMS else "text"
                e["_distinct"] = set()
            entries[key] = e
            order.append(key)
        e["count"] += 1
        e["ids"].append(r.id)
        e["unread"] = e["unread"] or unread
        if e["kind"] == "group":
            name_p, sum_p = FOLD[r.nkey]
            params = r.params or {}
            if name_p:
                v = params.get(name_p)
                if v and str(v) not in e["names"]:
                    e["names"].append(str(v))
            # What the rows are ABOUT, counted once each: a unit whose day was
            # reopened and closed again is one unit, not two. A row written
            # before subjects existed names no unit; a «kun yopildi» row is
            # closed by the unit's own brigadir, so (closer, day) stands in for
            # it, and every other old row counts as itself — never fewer.
            if r.subject_id:
                e["_distinct"].add(f"s:{r.subject_id}")
            elif r.nkey == "day_closed":
                e["_distinct"].add(f"p:{params.get('closer_name')}:{params.get('date')}")
            else:
                e["_distinct"].add(f"r:{r.id}")
            if sum_p:
                try:
                    e["sum"] += int(params.get(sum_p) or 0)
                except (TypeError, ValueError):
                    pass
            if len(e["items"]) < 60:
                e["items"].append(_row_json(r, lang, unread))
    out = [entries[k] for k in order]
    for e in out:
        if "_distinct" in e:
            e["distinct"] = len(e.pop("_distinct"))
        if e["kind"] == "group" and e["count"] == 1:
            # A burst of one is just a row — no «1 ta» line wrapping it.
            only = e["items"][0]
            e.update(kind="single", items=None, names=None, names_kind=None, sum=None,
                     title=only["title"], body=only["body"], link=only["link"])
    return out


def _date_param(r: Notification) -> Optional[date]:
    v = (r.params or {}).get("date")
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def open_units(db: Session, payload: dict, d: date) -> Optional[list[str]]:
    """Units in the viewer's reach that have attendance on ``d`` and have not
    closed it — the live half of a «kun yopildi» line. None when the viewer
    reaches no unit list (a leader) or the question cannot be answered."""
    from app.models import Attendance, DayApproval, Manager
    role = payload.get("role")
    if role == "admin" or role == "top-manager":
        scope = None
    elif role == "shift-manager":
        from app.services import shift_scope
        scope = shift_scope.unit_ids(db, payload.get("role_id"))
        if not scope:
            return []
    elif role == "supervisor" and payload.get("role_id"):
        scope = [int(payload["role_id"])]
    else:
        return None
    q = db.query(Attendance.manager_id).filter(Attendance.date == d).distinct()
    if scope is not None:
        q = q.filter(Attendance.manager_id.in_(scope))
    with_data = {r[0] for r in q.all()}
    if not with_data:
        # No attendance uploaded for the day yet: «all closed» would be a
        # claim nobody can make — no answer, so no chip.
        return None
    closed = {r[0] for r in db.query(DayApproval.manager_id).filter(
        DayApproval.date == d, DayApproval.manager_id.in_(with_data)).all()}
    left = with_data - closed
    if not left:
        return []
    names = db.query(Manager.name).filter(Manager.id.in_(left), Manager.archived.is_(False)).all()
    return sorted(n[0] for n in names if n[0])


def _decorate_day_groups(db: Session, payload: dict, rows: list[Notification],
                         entries: list[dict], lang: str) -> None:
    """Give the two newest «kun yopildi» lines their live «still open» list —
    unit names RAW, the client spells them (a unit is named after a person)."""
    by_key: dict[str, list[Notification]] = {}
    for r in rows:
        if r.nkey == "day_closed":
            by_key.setdefault(f"g:day_closed:{local_day(r.created_at)}", []).append(r)
    done = 0
    for e in entries:
        if done >= 2 or e.get("nkey") != "day_closed":
            continue
        group_rows = by_key.get(e["key"]) or []
        dates = Counter(d for d in (_date_param(r) for r in group_rows) if d)
        if not dates:
            continue
        d = dates.most_common(1)[0][0]
        try:
            names = open_units(db, payload, d)
        except Exception:
            logger.exception("notification centre: open units for %s", d)
            names = None
        if names is not None:
            e["open_units"] = names
            e["open_for"] = d.isoformat()
        done += 1


# ── the feed ──────────────────────────────────────────────────────────────────

def feed(db: Session, payload: dict, lang: str, *, before: Optional[date] = None,
         days: int = 7, cats: Optional[set[str]] = None, q: str = "",
         unread_only: bool = False, min_entries: int = 12,
         max_windows: int = 12) -> dict:
    """Folded entries over whole Tashkent DAYS — never a row count, so one
    day's «kun yopildi» never splits across two pages. Starts at ``before``
    (exclusive; today + 1 when omitted) and keeps widening by ``days`` until it
    holds ``min_entries`` entries or reaches the oldest row. ``next_before`` is
    where the next page starts, None at the end of history."""
    reader = reader_key(db, payload)
    upto, seen = marks(db, reader)
    clause = viewer_clause(db, payload)
    end_day = before or (today_local() + timedelta(days=1))
    oldest = db.query(func.min(Notification.created_at)).filter(clause).scalar()
    oldest_day = local_day(oldest)
    needle = (q or "").strip().lower()

    picked: list[Notification] = []
    start_day = end_day
    windows = 0
    entries: list[dict] = []
    while windows < max_windows:
        windows += 1
        start_day = start_day - timedelta(days=days)
        rows = db.query(Notification).filter(
            clause,
            Notification.created_at >= _day_bounds(start_day),
            Notification.created_at < _day_bounds(end_day),
        ).order_by(Notification.id.desc()).limit(4000).all()
        picked = rows
        if cats:
            picked = [r for r in picked if category_of(r.nkey) in cats]
        if needle:
            kept = []
            for r in picked:
                t, b = render(r, lang)
                if needle in (t or "").lower() or needle in (b or "").lower():
                    kept.append(r)
            picked = kept
        read = read_set(db, reader, [r.id for r in picked if r.id > upto])
        unread_ids = {r.id for r in picked if r.id > upto and r.id not in read}
        if unread_only:
            picked = [r for r in picked if r.id in unread_ids]
        entries = fold(picked, lang, unread_ids)
        if len(entries) >= min_entries:
            break
        if oldest_day is None or start_day <= oldest_day:
            break
        # Widen to the next day that HAS rows rather than by a fixed step, so a
        # quiet fortnight costs one step, not five empty ones — and a reader
        # whose last notice is a month old still sees it in the bell.
        older = db.query(func.max(Notification.created_at)).filter(
            clause, Notification.created_at < _day_bounds(start_day)).scalar()
        if older is None:
            start_day = oldest_day
            break
        start_day = min(start_day, local_day(older) + timedelta(days=1))
    _decorate_day_groups(db, payload, picked, entries, lang)
    more = oldest_day is not None and start_day > oldest_day
    return {
        "entries": entries,
        "next_before": start_day.isoformat() if more else None,
        "today": today_local().isoformat(),
        "seen_upto": seen,
        "read_upto": upto,
    }
