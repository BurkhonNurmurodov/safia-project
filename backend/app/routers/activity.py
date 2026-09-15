"""
User-activity tracking + the admin "Users Activity & Usage Statistics" dashboard.

ONE ledger, TWO readings. `user_activity` holds one row per (Telegram account,
PROFILE, day), and the dashboard reads it on two tabs:

  • by PROFILE — a profile IS a person (`app/identity.py`), so every account
    working as one profile folds into one row, their time summed;
  • by ACCOUNT — the Telegram login itself, whatever profiles it worked as.

Every figure that counts DAYS counts distinct days. A profile held by three
accounts writes three rows for one day, and counting rows read as 69 active
days in a 30-day month.

The web app pings POST /api/activity/ping every ~60 s while it is open and
visible; each ping folds into today's row (`_fold`). Reads are page-gated and
derive every metric per request from those rollups — nothing derived is stored.
"""
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from jwt import PyJWTError as JWTError
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import identity
from app.config import settings
from app.database import get_db
from app.models import Admin, Manager, RoleProfile, TelegramUser, TelegramUserRole, UserActivity
from app.permissions import require_page
from app.translit import transliterate

router = APIRouter(prefix="/api/activity", tags=["activity"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

# Two consecutive pings closer than this count as one continuous stretch of use,
# so the gap between them is added to active time. A larger gap (app backgrounded,
# tab hidden, walked away) starts a fresh stretch — a new VISIT — and adds
# nothing: that's how idle time is kept out of "time in app". Sized at ~2.5× the
# 60 s client ping.
PING_MAX_GAP = 150

# "Online now" / "active" recency window.
ONLINE_SECONDS = 5 * 60

# How far back the contribution calendar reaches (53 weeks, GitHub-style).
CALENDAR_DAYS = 371

# The ledger's DAY is the plant's wall-clock day (Tashkent), like every other
# date on the platform. Until 2026-09-15 it was the UTC day, so everything done
# between 00:00 and 05:00 landed on the day before, and «active today» answered
# for yesterday for the first five hours of every morning. Rows written before
# then keep the UTC label they were written under: a row stores a day's total,
# not its hours, so it cannot be re-cut honestly.
TZ = timezone(timedelta(hours=5))

BY_PROFILE = "profile"
BY_ACCOUNT = "account"

_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Heartbeat ────────────────────────────────────────────────────────────────

def _heartbeat_owner(db: Session, payload: dict
                     ) -> tuple[int, Optional[str], Optional[str], Optional[str]]:
    """(account, profile, name, role) a heartbeat is recorded under.

    Normally the token's own. An admin's «open as this profile» browser session
    is the exception: its token carries the HOLDER's account in `sub` (so every
    page behaves exactly as that person's does) and the admin in `imp`. The
    person at the keyboard is the admin, so that is who the time belongs to —
    recorded as the token reads, it showed a leader in the app while they were
    not, on both tabs, and the admin out of it while they were.
    """
    imp = payload.get("imp")
    if isinstance(imp, dict) and imp.get("sub"):
        tid = int(imp["sub"])
        admin = db.query(Admin).filter_by(telegram_id=tid).first()
        pkey = identity.profile_key("admin", admin.profile_id if admin else None)
        return tid, pkey, (imp.get("name") or None), "admin"
    return (int(payload["sub"]), identity.viewer_profile_key(db, payload),
            payload.get("full_name"), payload.get("role"))


def _fold(row: UserActivity, now: datetime,
          name: Optional[str], role: Optional[str]) -> None:
    """Fold one heartbeat into its (account, profile, day) row.

    A ping within PING_MAX_GAP of the one before continues the stretch and adds
    the gap to active time; a longer gap adds nothing and opens a new VISIT, as
    a row's first ping does. `session_count` is NULL on rows written before
    visits were counted and STAYS NULL — a count started halfway through a day
    would be a count of part of it.
    """
    if row.last_seen is None:
        row.first_seen = row.first_seen or now
        if row.session_count is not None:
            row.session_count += 1
    else:
        gap = (now - row.last_seen).total_seconds()
        if 0 < gap <= PING_MAX_GAP:
            row.active_seconds = (row.active_seconds or 0) + int(gap)
        elif gap > PING_MAX_GAP and row.session_count is not None:
            row.session_count += 1
    if row.last_seen is None or now > row.last_seen:
        row.last_seen = now
    row.event_count = (row.event_count or 0) + 1
    row.full_name = name or row.full_name
    row.role = role or row.role


@router.post("/ping")
def ping(token: Annotated[str, Depends(_oauth2)], db: Session = Depends(get_db)):
    """Record a heartbeat for the calling user. Open to every authenticated role
    (no page gate) — it only ever writes the caller's own row."""
    payload = _decode(token)
    try:
        tid, pkey, name, role = _heartbeat_owner(db, payload)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="No user id in token")

    now = datetime.now(timezone.utc)
    day = now.astimezone(TZ).date()

    def todays_row():
        return db.query(UserActivity).filter_by(
            telegram_id=tid, profile_key=pkey, day=day).first()

    def touch_account():
        # Keep the account's global "last seen" fresh so it reflects real use,
        # not just the last login (a missing row is fine for seeded admins).
        db.query(TelegramUser).filter_by(telegram_id=tid).update({"last_seen": now})

    row = todays_row()
    if row is None:
        row = UserActivity(telegram_id=tid, profile_key=pkey, day=day,
                           active_seconds=0, event_count=0, session_count=0)
        db.add(row)
    _fold(row, now, name, role)
    touch_account()

    try:
        db.commit()
    except IntegrityError:
        # A concurrent ping (another tab or device of this account) inserted
        # today's row first — fold this ping into that row, gap and all,
        # instead of 500-ing the client.
        db.rollback()
        row = todays_row()
        if row is not None:
            _fold(row, now, name, role)
            touch_account()
            try:
                db.commit()
            except Exception:
                db.rollback()
    return {"ok": True}


# ── Read helpers ─────────────────────────────────────────────────────────────

def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _key_role(key: Optional[str]) -> Optional[str]:
    return identity.parse_profile_key(key)[0]


def _fold_name(name: Optional[str]) -> str:
    """A name reduced to what survives both alphabets and every apostrophe, so
    «Талипова Мамура» and «Talipova Mamura» compare equal. Applied to BOTH
    sides, so it only ever merges spellings of one name."""
    s = (transliterate(name or "", "uz") or "").casefold()
    s = re.sub(r"[’ʻʼ'`‘]", "", s)
    s = s.replace("kh", "x").replace("ye", "e").replace("q", "k")
    return " ".join(re.sub(r"[^\w]+", " ", s).split())


def _profile_names(db: Session, keys) -> dict[str, str]:
    """Current display names for many profile keys in two queries — the rule
    `identity.profile_display_name` applies, without a query per person."""
    sup_ids, prof_ids = set(), set()
    for k in keys:
        role, ref = identity.parse_profile_key(k)
        if ref:
            (sup_ids if role == "supervisor" else prof_ids).add(ref)
    managers = dict(db.query(Manager.id, Manager.name).filter(Manager.id.in_(sup_ids)).all()) \
        if sup_ids else {}
    profiles = dict(db.query(RoleProfile.id, RoleProfile.name).filter(RoleProfile.id.in_(prof_ids)).all()) \
        if prof_ids else {}
    out = {}
    for k in keys:
        role, ref = identity.parse_profile_key(k)
        name = (managers if role == "supervisor" else profiles).get(ref)
        if name:
            out[k] = name
    return out


def _legacy_profiles(db: Session, legacy: set[tuple]) -> dict[tuple, Optional[str]]:
    """The profile behind heartbeats written before the ledger knew it.

    Rows from before 2026-07-25 (and a handful of unresolvable identities up to
    2026-08-19) carry NULL `profile_key` — only the account, and the role and
    name its token held. Read as identities of their own they listed one human
    twice on the profile tab: once under their profile, once under their
    Telegram account. Nothing is written; each (account, role, name) is resolved
    on read, and only where the answer is not a guess:

      1. admin — the admins row's profile, where one is bound;
      2. the ONE profile of that role the account holds whose name matches the
         snapshot in either alphabet;
      3. the ONE profile of that role anywhere that carries the snapshot's name
         — an account handed to somebody else holds the new person's profile
         today, while its old rows still name the person who pinged;
      4. a DIRECT role (whose role_id IS the profile) the account holds exactly
         once — its snapshot is often a slot name («Shift Admin 3») or a
         spelling the fold cannot bridge («Уразов Аскар» / «O'razov Asqar»).
         Never for a leader: a leader account's profile today says nothing
         about whose rows these were.
      Otherwise None, and the rows stay with their account, marked as such.
    """
    if not legacy:
        return {}
    tids = {tid for tid, _, _ in legacy}
    admins = dict(db.query(Admin.telegram_id, Admin.profile_id)
                  .filter(Admin.telegram_id.in_(tids)).all())

    held: dict[tuple, dict[str, set]] = defaultdict(dict)   # (tid, role) → key → names
    # The five columns `role_row_profile_key` reads, not the entity: heal=False
    # never assigns, and a read has no business loading the rest of the row.
    for r in db.query(TelegramUserRole.telegram_id, TelegramUserRole.role,
                      TelegramUserRole.role_id, TelegramUserRole.full_name,
                      TelegramUserRole.profile_key).filter(
            TelegramUserRole.telegram_id.in_(tids),
            TelegramUserRole.status == "approved"):
        key = identity.role_row_profile_key(db, r, heal=False)
        if key:
            held[(r.telegram_id, r.role)].setdefault(key, set()).add(_fold_name(r.full_name))
    names = _profile_names(db, {k for keys in held.values() for k in keys})
    for keys in held.values():
        for k, folded in keys.items():
            if names.get(k):
                folded.add(_fold_name(names[k]))

    # Every profile of the roles these rows name, by folded name — answer 3.
    roles = {role for _, role, _ in legacy if role}
    by_name: dict[tuple, set] = defaultdict(set)          # (role, folded name) → keys
    if "supervisor" in roles:
        for mid, mname in db.query(Manager.id, Manager.name):
            by_name[("supervisor", _fold_name(mname))].add(f"supervisor:{mid}")
    if roles - {"supervisor"}:
        for pid, prole, pname in db.query(RoleProfile.id, RoleProfile.role, RoleProfile.name
                                          ).filter(RoleProfile.role.in_(roles - {"supervisor"})):
            by_name[(prole, _fold_name(pname))].add(f"{prole}:{pid}")

    out = {}
    for tid, role, name in legacy:
        want = _fold_name(name)
        key = identity.profile_key("admin", admins.get(tid)) if role == "admin" else None
        if key is None:
            keys = held.get((tid, role), {})
            match = [k for k, folded in keys.items() if want and want in folded]
            named = by_name.get((role, want), set()) if want else set()
            if len(match) == 1:
                key = match[0]
            elif len(named) == 1:
                key = next(iter(named))
            elif role in identity._DIRECT_ROLES and len(keys) == 1:
                key = next(iter(keys))
        out[(tid, role, name)] = key
    return out


def _records(db: Session, since: date) -> list[dict]:
    """The ledger from `since` on, one dict per row, legacy profiles resolved."""
    rows = db.query(
        UserActivity.telegram_id, UserActivity.profile_key, UserActivity.day,
        UserActivity.full_name, UserActivity.role, UserActivity.last_seen,
        UserActivity.active_seconds, UserActivity.event_count, UserActivity.session_count,
    ).filter(UserActivity.day >= since).all()
    legacy = _legacy_profiles(
        db, {(r.telegram_id, r.role, r.full_name) for r in rows if not r.profile_key})
    return [{
        "tid": r.telegram_id,
        "pkey": r.profile_key or legacy.get((r.telegram_id, r.role, r.full_name)),
        "day": r.day,
        "name": r.full_name,
        "role": r.role,
        "last_seen": r.last_seen,
        "secs": int(r.active_seconds or 0),
        "events": int(r.event_count or 0),
        "visits": r.session_count,
    } for r in rows]


def _pid(rec: dict, by: str) -> str:
    """The identity a ledger row counts toward on a tab: its profile, or its
    account. A legacy row no profile could be resolved for stays with its
    account on both."""
    if by == BY_PROFILE and rec["pkey"]:
        return rec["pkey"]
    return f"tg:{rec['tid']}"


def _seen_before(db: Session, before: date, by: str) -> set[str]:
    """Identities with any row older than the calendar span — so «new» means
    first seen in the last 7 days, not first seen inside the span."""
    rows = (db.query(UserActivity.telegram_id, UserActivity.profile_key,
                     UserActivity.role, UserActivity.full_name)
            .filter(UserActivity.day < before).distinct().all())
    if not rows:
        return set()
    legacy = _legacy_profiles(
        db, {(r.telegram_id, r.role, r.full_name) for r in rows if not r.profile_key})
    return {_pid({"tid": r.telegram_id,
                  "pkey": r.profile_key or legacy.get((r.telegram_id, r.role, r.full_name))}, by)
            for r in rows}


def _accounts(db: Session, tids: set[int]) -> dict[int, dict]:
    """telegram_id → {tg_name, username, reg_name, created_at, is_admin}."""
    out: dict[int, dict] = {tid: {} for tid in tids}
    if not tids:
        return out
    for u in db.query(TelegramUser.telegram_id, TelegramUser.tg_name, TelegramUser.username,
                      TelegramUser.full_name, TelegramUser.created_at
                      ).filter(TelegramUser.telegram_id.in_(tids)):
        out[u.telegram_id].update({"tg_name": u.tg_name, "username": u.username,
                                   "reg_name": u.full_name, "created_at": u.created_at})
    for tid, created in db.query(Admin.telegram_id, Admin.created_at
                                 ).filter(Admin.telegram_id.in_(tids)):
        out[tid]["is_admin"] = True
        # The admins row supplies a join date only when there is no richer
        # telegram_users record.
        if not out[tid].get("created_at"):
            out[tid]["created_at"] = created
    return out


def _account_label(info: dict, tid: int, fallback: Optional[str] = None) -> str:
    """How an ACCOUNT is named: its Telegram name, then its @handle, then the
    name it registered with — never a profile's name, which is who it works as,
    not what it is."""
    return (info.get("tg_name") or (f"@{info['username']}" if info.get("username") else None)
            or info.get("reg_name") or fallback or f"#{tid}")


# ── Reads ────────────────────────────────────────────────────────────────────

@router.get("/overview")
def overview(
    days: int = 30,
    by: str = BY_PROFILE,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("activity")),
):
    """Everything one tab of the dashboard needs, in one payload. `by` names the
    tab — "profile" (the default, which is also what a tab still open on the
    one-view bundle asks for) or "account":

      • kpis     — headline counters over the tab's identities
      • daily    — active identities + minutes per day of the last ``days``
      • users    — one row per identity (a profile, or an account)
      • calendar — everyone's minutes per day for the 53-week grid
    """
    by = BY_ACCOUNT if by == BY_ACCOUNT else BY_PROFILE
    days = max(1, min(days, 365))
    now = datetime.now(timezone.utc)
    today = now.astimezone(TZ).date()
    window_start = today - timedelta(days=days - 1)
    cal_start = today - timedelta(days=CALENDAR_DAYS - 1)

    # One bounded scan (small table) covers both the window and the calendar;
    # the window always sits inside the calendar span.
    recs = _records(db, cal_start)

    people: dict[str, dict] = {}
    day_ids: dict[date, set] = defaultdict(set)      # window: day → identities
    day_secs: dict[date, int] = defaultdict(int)     # window: day → seconds
    cal_ids: dict[date, set] = defaultdict(set)      # calendar: day → identities
    cal_secs: dict[date, int] = defaultdict(int)     # calendar: day → seconds

    for r in recs:
        pid, d, secs, seen = _pid(r, by), r["day"], r["secs"], r["last_seen"]
        cal_ids[d].add(pid)
        cal_secs[d] += secs

        p = people.get(pid)
        if p is None:
            p = people[pid] = {
                "pkey": r["pkey"] if by == BY_PROFILE else None,
                "name": None, "role": None, "named_at": None, "last_seen": None,
                "first_day": d, "last_day": d, "days": set(),
                "secs": 0, "events": 0, "visits": 0, "visits_known": False,
                # What the identity is made of: the accounts behind a profile,
                # or the profiles an account worked as.
                "parts": {},
            }
        if seen and (p["last_seen"] is None or seen > p["last_seen"]):
            p["last_seen"] = seen
        if seen and (p["named_at"] is None or seen >= p["named_at"]):
            p["named_at"] = seen
            p["name"] = r["name"] or p["name"]
            p["role"] = r["role"] or p["role"]
        p["first_day"] = min(p["first_day"], d)
        p["last_day"] = max(p["last_day"], d)

        part_key = r["tid"] if by == BY_PROFILE else (r["pkey"] or f"?{r['role']}|{r['name']}")
        part = p["parts"].get(part_key)
        if part is None:
            part = p["parts"][part_key] = {
                "tid": r["tid"], "pkey": r["pkey"], "name": r["name"], "role": r["role"],
                "secs": 0, "last_seen": None,
            }
        if seen and (part["last_seen"] is None or seen > part["last_seen"]):
            part["last_seen"] = seen

        if d >= window_start:
            p["days"].add(d)
            p["secs"] += secs
            p["events"] += r["events"]
            if r["visits"] is not None:
                p["visits"] += r["visits"]
                p["visits_known"] = True
            part["secs"] += secs
            day_ids[d].add(pid)
            day_secs[d] += secs

    accounts = _accounts(db, {r["tid"] for r in recs})
    pkeys = {r["pkey"] for r in recs if r["pkey"]}
    names = _profile_names(db, pkeys)
    photos = identity.photo_versions(db, pkeys) if by == BY_PROFILE else {}
    older = _seen_before(db, cal_start, by)

    users = []
    for pid, p in people.items():
        parts = sorted(p["parts"].values(),
                       key=lambda x: (x["secs"], x["last_seen"] or _EPOCH), reverse=True)
        lead_tid = parts[0]["tid"]
        info = accounts.get(lead_tid, {})
        active_days = len(p["days"])
        if by == BY_PROFILE:
            label = names.get(p["pkey"]) or p["name"] or _account_label(info, lead_tid)
            role = _key_role(p["pkey"]) or p["role"]
        else:
            label = _account_label(info, lead_tid, p["name"])
            role = _key_role(parts[0]["pkey"]) or parts[0]["role"]
        entry = {
            "id":            pid,
            "kind":          by,
            "telegram_id":   lead_tid,
            "profile_key":   p["pkey"],
            # False only for a profile-tab row no profile could be resolved for.
            "resolved":      by == BY_ACCOUNT or bool(p["pkey"]),
            "full_name":     label,
            "username":      info.get("username"),
            "role":          role,
            "is_admin":      (role == "admin") if by == BY_PROFILE else bool(info.get("is_admin")),
            "created_at":    _iso(info.get("created_at")),
            "photo":         photos.get(p["pkey"]),
            "last_seen":     _iso(p["last_seen"]),
            "online":        bool(p["last_seen"]
                                  and (now - p["last_seen"]).total_seconds() <= ONLINE_SECONDS),
            "first_day":     p["first_day"].isoformat(),
            "active_days":   active_days,
            "total_minutes": round(p["secs"] / 60, 1),
            "avg_minutes":   round(p["secs"] / active_days / 60, 1) if active_days else 0,
            # None = no visit in the window was counted (rows before 2026-09-15).
            "sessions":      p["visits"] if p["visits_known"] else None,
            "event_count":   p["events"],
        }
        if by == BY_PROFILE:
            entry["accounts"] = [{
                "telegram_id": a["tid"],
                "name":        _account_label(accounts.get(a["tid"], {}), a["tid"]),
                "username":    accounts.get(a["tid"], {}).get("username"),
                "minutes":     round(a["secs"] / 60, 1),
            } for a in parts]
        else:
            entry["profiles"] = [{
                "key":      x["pkey"],
                "name":     names.get(x["pkey"]) or x["name"] or "—",
                "role":     _key_role(x["pkey"]) or x["role"],
                "resolved": bool(x["pkey"]),
                "minutes":  round(x["secs"] / 60, 1),
            } for x in parts]
        users.append(entry)
    # Most-recently-active first.
    users.sort(key=lambda x: (x["last_seen"] or ""), reverse=True)

    person_days = sum(len(s) for s in day_ids.values())
    window_secs = sum(day_secs.values())
    kpis = {
        "online_now":      sum(1 for u in users if u["online"]),
        "active_today":    len(day_ids.get(today, ())),
        "active_7d":       sum(1 for p in people.values() if p["last_day"] >= today - timedelta(days=6)),
        "active_30d":      sum(1 for p in people.values() if p["last_day"] >= today - timedelta(days=29)),
        "tracked":         len(people),
        "tracked_users":   len(people),   # the one-view bundle's name for it
        "new_7d":          sum(1 for pid, p in people.items()
                               if p["first_day"] >= today - timedelta(days=6) and pid not in older),
        "avg_minutes_day": round(window_secs / person_days / 60, 1) if person_days else 0,
        "total_minutes":   round(window_secs / 60, 1),
        "total_hours":     round(window_secs / 3600, 1),
        "window_days":     days,
    }

    daily = []
    for i in range(days):
        d = window_start + timedelta(days=i)
        daily.append({"day": d.isoformat(), "active_users": len(day_ids.get(d, ())),
                      "minutes": round(day_secs.get(d, 0) / 60, 1)})

    calendar = []
    for i in range(CALENDAR_DAYS):
        d = cal_start + timedelta(days=i)
        calendar.append({"day": d.isoformat(), "minutes": round(cal_secs.get(d, 0) / 60, 1),
                         "users": len(cal_ids.get(d, ()))})

    visits_from = (db.query(func.min(UserActivity.day))
                   .filter(UserActivity.session_count.isnot(None)).scalar())

    return {
        "by": by,
        "today": today.isoformat(),
        "kpis": kpis,
        "daily": daily,
        "users": users,
        "calendar": calendar,
        # The first day visits were counted on; None until one has been.
        "sessions_from": visits_from.isoformat() if visits_from else None,
    }


@router.get("/heatmap")
def heatmap(
    telegram_id: Optional[int] = None,
    person: Optional[str] = None,
    by: str = BY_PROFILE,
    days: int = CALENDAR_DAYS,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("activity")),
):
    """Per-day usage for ONE identity's contribution calendar.

    ``person`` is an ``id`` from the users list of the tab ``by`` names: a
    profile ("role:id") — every login that works as it, combined — or an
    account ("tg:<id>"). On the profile tab "tg:<id>" is only the part of an
    account's history no profile could be resolved for; on the account tab it
    is the whole account. ``telegram_id`` alone (the one-view bundle) reads one
    account. Neither: everyone.
    """
    by = BY_ACCOUNT if by == BY_ACCOUNT else BY_PROFILE
    days = max(7, min(days, CALENDAR_DAYS))
    start = datetime.now(TZ).date() - timedelta(days=days - 1)

    recs = _records(db, start)
    if person:
        recs = [r for r in recs if _pid(r, by) == person]
    elif telegram_id is not None:
        recs = [r for r in recs if r["tid"] == telegram_id]

    secs: dict[date, int] = defaultdict(int)
    events: dict[date, int] = defaultdict(int)
    for r in recs:
        secs[r["day"]] += r["secs"]
        events[r["day"]] += r["events"]

    series = []
    for i in range(days):
        d = start + timedelta(days=i)
        series.append({"day": d.isoformat(), "minutes": round(secs.get(d, 0) / 60, 1),
                       "count": events.get(d, 0)})
    return {"telegram_id": telegram_id, "person": person, "by": by, "series": series}
