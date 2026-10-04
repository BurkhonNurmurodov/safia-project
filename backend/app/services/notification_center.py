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
import re
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
    "live_all_left": "day",
    "admin_record_edited": "day", "admin_record_deleted": "day",
    "idle_request_new": "idle",
    "education_lesson_new": "learning",
    "call_forecast": "other",
    "push_test": "other",
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

CHANNELS = ("telegram", "push")


def _channel_on(row: NotificationPref, channel: str) -> bool:
    if channel == "push":
        return row.push is None or bool(row.push)
    return bool(row.telegram)


def prefs_for(db: Session, profile: Optional[str], channel: str = "telegram") -> dict[str, bool]:
    """Category → is ``channel`` on for one profile: «telegram» = the bot also
    DMs it, «push» = the Android app also shows it as a phone notification.
    Absent = True."""
    out = {c: True for c in CATEGORIES}
    if not profile:
        return out
    for p in db.query(NotificationPref).filter(NotificationPref.profile == profile).all():
        if p.category in out:
            out[p.category] = _channel_on(p, channel)
    return out


def set_prefs(db: Session, profile: str, changes: dict,
              channel: str = "telegram") -> dict[str, bool]:
    """Write the ``channel`` switches named in ``changes``; returns the full map
    for that channel. A row with every channel on is deleted, so «on» is always
    the absence of a record."""
    if channel not in CHANNELS:
        raise ValueError(channel)
    for cat, on in (changes or {}).items():
        if cat not in CATEGORIES:
            continue
        row = db.get(NotificationPref, (profile, cat))
        if row is None:
            if on:
                continue
            row = NotificationPref(profile=profile, category=cat, telegram=True)
            db.add(row)
        if channel == "push":
            row.push = None if on else False
        else:
            row.telegram = bool(on)
        if row.telegram and row.push is None:
            db.delete(row)
    db.flush()
    return prefs_for(db, profile, channel)


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
    if kind == "page" and sid in ("/production", "/concerns", "/notifications"):
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

# The headline of a folded group, per viewer language — rendered HERE so the
# bell, the notifications page and the Android app's phone notifications say
# one thing. «Kun yopildi» lines count what they are ABOUT (a unit closed,
# reopened and closed again is one unit), every other group counts rows.
FOLD_TITLES = {
    "day_closed": ("Yopilgan kunlar: {n} ta", "Ёпилган кунлар: {n} та", "Закрытых дней: {n}", "Days closed: {n}"),
    "day_reopened": ("Qayta ochilgan kunlar: {n} ta", "Қайта очилган кунлар: {n} та", "Переоткрытых дней: {n}", "Days reopened: {n}"),
    "new_role_change": ("Lavozim o'zgarishi hujjatlari: {n} ta", "Лавозим ўзгариши ҳужжатлари: {n} та", "Документы о смене должности: {n}", "Role change documents: {n}"),
    "worker_exchange_created": ("Xodim almashinuvi hujjatlari: {n} ta", "Ходим алмашинуви ҳужжатлари: {n} та", "Документы обмена сотрудниками: {n}", "Worker exchange documents: {n}"),
    "worker_exchange_approved": ("Tasdiqlangan almashinuvlar: {n} ta", "Тасдиқланган алмашинувлар: {n} та", "Одобренные обмены: {n}", "Exchanges approved: {n}"),
    "worker_exchange_cancelled": ("Bekor qilingan almashinuvlar: {n} ta", "Бекор қилинган алмашинувлар: {n} та", "Отменённые обмены: {n}", "Exchanges cancelled: {n}"),
    "role_change_approved": ("Tasdiqlangan lavozim o'zgarishlari: {n} ta", "Тасдиқланган лавозим ўзгаришлари: {n} та", "Одобренные смены должности: {n}", "Role changes approved: {n}"),
    "request_approved_others": ("Tasdiqlangan so'rovlar: {n} ta", "Тасдиқланган сўровлар: {n} та", "Одобренные запросы: {n}", "Requests approved: {n}"),
    "request_rejected_others": ("Rad etilgan so'rovlar: {n} ta", "Рад этилган сўровлар: {n} та", "Отклонённые запросы: {n}", "Requests rejected: {n}"),
    "new_edit_request": ("Tahrirlash so'rovlari: {n} ta", "Таҳрирлаш сўровлари: {n} та", "Запросы на изменение: {n}", "Edit requests: {n}"),
    "new_delete_request": ("O'chirish so'rovlari: {n} ta", "Ўчириш сўровлари: {n} та", "Запросы на удаление: {n}", "Deletion requests: {n}"),
    "admin_record_edited": ("Admin tahrirlagan yozuvlar: {n} ta", "Админ таҳрирлаган ёзувлар: {n} та", "Записи, изменённые админом: {n}", "Records edited by an admin: {n}"),
    "admin_record_deleted": ("Admin o'chirgan yozuvlar: {n} ta", "Админ ўчирган ёзувлар: {n} та", "Записи, удалённые админом: {n}", "Records deleted by an admin: {n}"),
    "leader_day_report_clean": ("Toza lider hisobotlari: {n} ta", "Тоза лидер ҳисоботлари: {n} та", "Чистые отчёты лидеров: {n}", "Clean leader reports: {n}"),
    "idle_request_new": ("Yangi kutishlar: {n} ta", "Янги кутишлар: {n} та", "Новые ожидания: {n}", "New waiting entries: {n}"),
}
_LANG_AT = {"uz": 0, "uz_cyrl": 1, "ru": 2, "en": 3}
_COUNT_DISTINCT = ("day_closed", "day_reopened")


def fold_title(nkey: str, n: int, lang: str) -> Optional[str]:
    titles = FOLD_TITLES.get(nkey)
    if not titles:
        return None
    return titles[_LANG_AT.get(lang, 0)].replace("{n}", str(n))


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


def fold(rows: list[Notification], lang: str, unread_ids: set[int],
         unfold: frozenset = frozenset()) -> list[dict]:
    """Rows (newest first) → feed entries (newest first). Three shapes:

    * ``group``  — every row of one FOLD key on one Tashkent day, one line;
    * ``thread`` — every row about one subject (a concern's create → comment →
      resolve), shown as its newest row with the count;
    * ``single`` — everything else.

    ``unfold``: subject keys («hr_doc:12») whose rows must stay a thread of
    their own even when their kind folds — the phone's decision notifications,
    where one Accept button cannot stand for five documents.
    """
    from app.routers.staff import _NAME_PARAMS
    entries: dict[str, dict] = {}
    order: list[str] = []
    for r in rows:
        day = local_day(r.created_at)
        unread = r.id in unread_ids
        subj = f"{r.subject_kind}:{r.subject_id}" if r.subject_kind and r.subject_id else None
        if r.nkey in FOLD and subj not in unfold:
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
        elif e["kind"] == "group":
            n = e["distinct"] if e["nkey"] in _COUNT_DISTINCT else e["count"]
            e["title"] = fold_title(e["nkey"], n, lang) or f"{e['title']} · {n}"
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


# ── phone notifications (the Android app) ─────────────────────────────────────
# The app has no push service behind it (no Firebase project): it ASKS — every
# ~15 minutes from Android's job scheduler (android/…/Push.java), GET
# /api/push/poll. What it shows is this feed, cut three ways: rows not read
# yet, from the last day, in a category the person keeps on the phone (the
# «push» pref). An entry is shown when it holds a row newer than the phone's
# cursor and than the bell's «seen» mark — so nothing already looked at in the
# app or a browser buzzes — and it shows ALL its unread rows, so a later poll
# REPLACES a folded line («Yopilgan kunlar: 5 ta») instead of stacking a
# second one. ``active`` is every unread entry's key: a phone notification
# whose key is gone was read somewhere, and the phone takes it down.
PUSH_WINDOW = timedelta(hours=24)
PUSH_MAX_ITEMS = 8
_MORE = ("Yana {n} ta bildirishnoma", "Яна {n} та билдиришнома",
         "Ещё уведомлений: {n}", "{n} more notifications")


def _push_text(text: Optional[str]) -> str:
    """The stored body read as calm lines (notifMeta.displayBody's twin)."""
    return re.sub(r"\n{2,}", "\n", (text or "").replace(" | ", " · ")).strip()


def _names_line(e: dict, lang: str) -> str:
    from app.translit import transliterate, transliterate_text
    names = e.get("names") or []
    spell = transliterate if e.get("names_kind") == "people" else transliterate_text
    shown = [spell(n, lang) for n in names[:4]]
    more = len(names) - len(shown)
    return ", ".join(shown) + (f" +{more}" if more > 0 else "")


def _epoch_ms(iso: Optional[str]) -> int:
    """The phone sorts and dates by epoch milliseconds (Android 7 has no ISO
    parser that reads Python's microseconds)."""
    try:
        return int(datetime.fromisoformat(iso).timestamp() * 1000) if iso else 0
    except ValueError:
        return 0


# The phone's Accept / Reject (Push.java draws them; the confirm runs INSIDE the
# notification, since a notification cannot open a dialog). Words per language:
# uz · uz_cyrl · ru · en.
_ACT_WORDS = {
    "approve": ("Tasdiqlash", "Тасдиқлаш", "Одобрить", "Approve"),
    "reject": ("Rad etish", "Рад этиш", "Отклонить", "Reject"),
    "ask_approve": ("Tasdiqlansinmi? Buni bu yerdan qaytarib bo'lmaydi.",
                    "Тасдиқлансинми? Буни бу ердан қайтариб бўлмайди.",
                    "Одобрить? Отменить это отсюда нельзя.",
                    "Approve? This cannot be undone from here."),
    "ask_reject": ("Rad etilsinmi? Rad etilgan so'rovni qaytarib bo'lmaydi.",
                   "Рад этилсинми? Рад этилган сўровни қайтариб бўлмайди.",
                   "Отклонить? Отклонённый запрос вернуть нельзя.",
                   "Reject? A rejected request cannot be brought back."),
    "yes_approve": ("Ha, tasdiqlash", "Ҳа, тасдиқлаш", "Да, одобрить", "Yes, approve"),
    "yes_reject": ("Ha, rad etish", "Ҳа, рад этиш", "Да, отклонить", "Yes, reject"),
    "cancel": ("Bekor", "Бекор", "Отмена", "Cancel"),
    "done_approve": ("✓ Tasdiqlandi", "✓ Тасдиқланди", "✓ Одобрено", "✓ Approved"),
    "done_reject": ("✕ Rad etildi", "✕ Рад этилди", "✕ Отклонено", "✕ Rejected"),
    "undo": ("Qaytarish", "Қайтариш", "Вернуть", "Undo"),
    "undone": ("Qaytarildi — qaror bekor qilindi", "Қайтарилди — қарор бекор қилинди",
               "Возвращено — решение отменено", "Undone — the decision was taken back"),
    "busy": ("Yuborilmoqda…", "Юборилмоқда…", "Отправка…", "Sending…"),
    "failed": ("Bajarilmadi", "Бажарилмади", "Не выполнено", "Not done"),
}


def _push_decisions(db: Session, payload: dict, lang: str) -> dict[str, list[dict]]:
    """Subject key → the buttons a phone notification about it carries: the
    queue's own inline actions (services/notif_queue — the very endpoints,
    rights and confirm rules the bell uses), for the kinds a notification is
    written about. Nothing is offered for a record the viewer may not decide,
    or that somebody has already decided."""
    from app.services import notif_queue
    at = _LANG_AT.get(lang, 0)
    w = {k: v[at] for k, v in _ACT_WORDS.items()}
    out: dict[str, list[dict]] = {}
    for source in (notif_queue._hr_docs, notif_queue._edit_requests, notif_queue._edit_batches):
        try:
            with db.begin_nested():
                items = source(db, payload)
        except Exception:
            logger.exception("push decisions: %s failed", source.__name__)
            continue
        for it in items:
            acts = []
            for a in it.get("actions") or []:
                aid = a["id"]
                if aid not in ("approve", "reject"):
                    continue
                undo = a.get("undo")
                acts.append({
                    "id": aid,
                    "label": w[aid],
                    "method": a.get("method", "post"),
                    "url": a["url"],
                    "body": a.get("body"),
                    "confirm": bool(a.get("confirm")),
                    "ask": w["ask_" + aid],
                    "yes": w["yes_" + aid],
                    "cancel": w["cancel"],
                    "done": w["done_" + aid],
                    "busy": w["busy"],
                    "failed": w["failed"],
                    "undo": ({"url": undo["url"], "method": undo.get("method", "post"),
                              "label": w["undo"], "done": w["undone"]} if undo else None),
                })
            if acts:
                out[it["key"]] = acts
    return out


def push_entries(db: Session, payload: dict, lang: str, after: int) -> dict:
    """{latest, items, active} for one phone poll. ``after`` < 0 asks only for
    ``latest`` — where a phone that has just signed in starts counting, so it
    never replays the backlog."""
    reader = reader_key(db, payload)
    upto, seen = marks(db, reader)
    clause = viewer_clause(db, payload)
    latest = int(db.query(func.max(Notification.id)).filter(clause).scalar() or 0)
    out: dict = {"latest": latest, "items": [], "active": []}
    if after < 0:
        return out
    since = datetime.now(timezone.utc) - PUSH_WINDOW
    rows = db.query(Notification).filter(
        clause, Notification.id > upto, Notification.created_at >= since,
    ).order_by(Notification.id.desc()).limit(400).all()
    read = read_set(db, reader, [r.id for r in rows])
    from app.identity import viewer_profile_key
    off = {c for c, on in prefs_for(db, viewer_profile_key(db, payload), "push").items() if not on}
    rows = [r for r in rows if r.id not in read and category_of(r.nkey) not in off]
    decisions = _push_decisions(db, payload, lang)
    entries = fold(rows, lang, {r.id for r in rows}, frozenset(decisions))
    active = [e["key"] for e in entries]
    floor = max(int(after), seen)
    items = []
    for e in entries:
        if max(e["ids"]) <= floor:
            continue
        group = e["kind"] == "group"
        items.append({
            "key": e["key"],
            "kind": e["kind"],
            "category": e["category"],
            "type": e["type"],
            "title": e["title"],
            "body": _names_line(e, lang) if group else _push_text(e["body"]),
            # A folded line has no ONE record to open: the page lists it.
            "link": "/notifications" if group or not e.get("link") else e["link"],
            "ids": e["ids"][:100],
            "at": e["at"],
            "ts": _epoch_ms(e["at"]),
            "count": e["count"],
            "actions": decisions.get(e["key"][2:], []) if e["kind"] == "thread" else [],
        })
    if len(items) > PUSH_MAX_ITEMS:
        rest = items[PUSH_MAX_ITEMS - 1:]
        items = items[:PUSH_MAX_ITEMS - 1]
        items.append({
            "key": "more", "kind": "more", "category": "other", "type": "info",
            "title": _MORE[_LANG_AT.get(lang, 0)].replace("{n}", str(len(rest))),
            "body": "", "link": "/notifications", "ids": [], "at": rest[0]["at"],
            "ts": rest[0]["ts"], "count": len(rest),
        })
        active.append("more")
    out["items"] = items
    out["active"] = active
    return out

