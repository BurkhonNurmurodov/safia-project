"""
User-activity tracking + the admin "Users Activity & Usage Statistics" dashboard.

Data model: one UserActivity row per (telegram_id, UTC day). The web app pings
POST /api/activity/ping every ~60 s while open and visible; each ping folds into
today's row (see the folding rule below). Reads are admin/page-gated and derive
every metric — active users, average time-in-app, the GitHub-style contribution
calendar — from these daily rollups.

Everything is computed from data that starts accumulating the day this ships;
there is no historical backfill (only telegram_users.last_seen existed before).
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from jwt import PyJWTError as JWTError
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import UserActivity, TelegramUser, Admin
from app.permissions import require_page

router = APIRouter(prefix="/api/activity", tags=["activity"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

# Two consecutive pings closer than this count as one continuous stretch of use,
# so the gap between them is added to active time. A larger gap (app backgrounded,
# tab hidden, walked away) starts a fresh stretch and adds nothing — that's how
# idle time is kept out of "time in app". Sized at ~2.5× the 60 s client ping.
PING_MAX_GAP = 150

# "Online now" / "active" recency window.
ONLINE_SECONDS = 5 * 60

# How far back the contribution calendar reaches (53 weeks, GitHub-style).
CALENDAR_DAYS = 371


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Heartbeat ────────────────────────────────────────────────────────────────

@router.post("/ping")
def ping(token: Annotated[str, Depends(_oauth2)], db: Session = Depends(get_db)):
    """Record a heartbeat for the calling user. Open to every authenticated role
    (no page gate) — it only ever writes the caller's own row."""
    payload = _decode(token)
    try:
        tid = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="No user id in token")

    now = datetime.now(timezone.utc)
    today = now.date()

    row = db.query(UserActivity).filter_by(telegram_id=tid, day=today).first()
    if row is None:
        row = UserActivity(
            telegram_id=tid, day=today,
            first_seen=now, last_seen=now,
            active_seconds=0, event_count=0,
        )
        db.add(row)
    elif row.last_seen is not None:
        gap = (now - row.last_seen).total_seconds()
        if 0 < gap <= PING_MAX_GAP:
            row.active_seconds = (row.active_seconds or 0) + int(gap)

    row.last_seen = now
    if row.first_seen is None:
        row.first_seen = now
    row.event_count = (row.event_count or 0) + 1
    row.full_name = payload.get("full_name") or row.full_name
    row.role = payload.get("role") or row.role

    # Keep the person's global "last seen" fresh so it reflects real usage, not
    # just the last login (best-effort — a missing row is fine for seeded admins).
    db.query(TelegramUser).filter_by(telegram_id=tid).update({"last_seen": now})

    try:
        db.commit()
    except IntegrityError:
        # A concurrent ping (another tab/device) inserted today's row first —
        # fold this ping into the existing row instead of 500-ing the client.
        db.rollback()
        existing = db.query(UserActivity).filter_by(telegram_id=tid, day=today).first()
        if existing is not None:
            existing.last_seen = now
            existing.event_count = (existing.event_count or 0) + 1
            existing.full_name = payload.get("full_name") or existing.full_name
            existing.role = payload.get("role") or existing.role
            try:
                db.commit()
            except Exception:
                db.rollback()
    return {"ok": True}


# ── Read helpers ─────────────────────────────────────────────────────────────

def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _resolve_identities(db: Session, tids: set[int]) -> dict[int, dict]:
    """telegram_id → {username, created_at, is_admin, reg_name} from the
    registration tables, used to enrich the activity rollups (join date, @handle,
    admin flag). Names ultimately fall back to the JWT snapshot on the rollup."""
    out: dict[int, dict] = {tid: {} for tid in tids}
    if not tids:
        return out

    for u in db.query(TelegramUser).filter(TelegramUser.telegram_id.in_(tids)).all():
        out.setdefault(u.telegram_id, {})
        out[u.telegram_id].update({
            "username":   u.username,
            "created_at": u.created_at,
            "reg_name":   u.full_name,
        })
    for a in db.query(Admin).filter(Admin.telegram_id.in_(tids)).all():
        out.setdefault(a.telegram_id, {})
        out[a.telegram_id]["is_admin"] = True
        # Only let the admins row supply a join date when there's no richer
        # telegram_users record already.
        out[a.telegram_id].setdefault("created_at", a.created_at)

    return out


@router.get("/overview")
def overview(
    days: int = 30,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("activity")),
):
    """Everything the dashboard's main view needs in one payload:

      • kpis     — headline counters (online now, active today/7d/30d, avg mins/day…)
      • daily    — per-day active-user + minutes series over the last ``days``
      • users    — per-user usage table (active days, total & avg time, last seen…)
      • calendar — aggregate per-day usage for the 53-week contribution grid
    """
    days = max(1, min(days, 365))
    now = datetime.now(timezone.utc)
    today = now.date()
    window_start = today - timedelta(days=days - 1)
    cal_start = today - timedelta(days=CALENDAR_DAYS - 1)

    # One bounded scan (small table) covers both the window metrics and the
    # longer calendar; the window is always inside the calendar span.
    rows = db.query(UserActivity).filter(UserActivity.day >= cal_start).all()

    ids = {r.telegram_id for r in rows}
    ident = _resolve_identities(db, ids)

    # ── per-user aggregation (over the selected window) ──
    per_user: dict[int, dict] = {}
    day_users: dict[str, set[int]] = {}      # window: day → active tids
    day_seconds: dict[str, int] = {}         # window: day → summed seconds
    cal_seconds: dict[str, int] = {}         # calendar: day → summed seconds
    cal_users: dict[str, set[int]] = {}      # calendar: day → active tids

    for r in rows:
        dkey = r.day.isoformat()
        secs = int(r.active_seconds or 0)

        # Calendar (full span)
        cal_seconds[dkey] = cal_seconds.get(dkey, 0) + secs
        cal_users.setdefault(dkey, set()).add(r.telegram_id)

        # Track the freshest identity + global last_seen across the whole span
        u = per_user.setdefault(r.telegram_id, {
            "telegram_id": r.telegram_id, "full_name": None, "role": None,
            "last_seen": None, "active_days": 0, "total_seconds": 0,
            "event_count": 0, "_name_at": None,
        })
        if r.last_seen and (u["last_seen"] is None or r.last_seen > u["last_seen"]):
            u["last_seen"] = r.last_seen
        if r.last_seen and (u["_name_at"] is None or r.last_seen >= u["_name_at"]):
            u["_name_at"] = r.last_seen
            if r.full_name:
                u["full_name"] = r.full_name
            if r.role:
                u["role"] = r.role

        # Window-scoped usage totals
        if r.day >= window_start:
            u["active_days"] += 1
            u["total_seconds"] += secs
            u["event_count"] += int(r.event_count or 0)
            day_users.setdefault(dkey, set()).add(r.telegram_id)
            day_seconds[dkey] = day_seconds.get(dkey, 0) + secs

    users = []
    for tid, u in per_user.items():
        info = ident.get(tid, {})
        last_seen = u["last_seen"]
        online = bool(last_seen and (now - last_seen).total_seconds() <= ONLINE_SECONDS)
        active_days = u["active_days"]
        total_seconds = u["total_seconds"]
        avg_seconds = round(total_seconds / active_days) if active_days else 0
        name = u["full_name"] or info.get("reg_name") or (
            "Admin" if info.get("is_admin") else f"#{tid}")
        role = u["role"] or ("admin" if info.get("is_admin") else None)
        users.append({
            "telegram_id":      tid,
            "full_name":        name,
            "username":         info.get("username"),
            "role":             role,
            "is_admin":         bool(info.get("is_admin")),
            "created_at":       _iso(info.get("created_at")),
            "last_seen":        _iso(last_seen),
            "online":           online,
            "active_days":      active_days,
            "total_minutes":    round(total_seconds / 60, 1),
            "avg_minutes":      round(avg_seconds / 60, 1),
            "event_count":      u["event_count"],
        })
    # Most-recently-active first.
    users.sort(key=lambda x: (x["last_seen"] or ""), reverse=True)

    # ── KPI counters ──
    def active_within(day_cut) -> int:
        return len({tid for tid, u in per_user.items()
                    if u["last_seen"] and u["last_seen"].date() >= day_cut})

    total_user_days = sum(len(s) for s in day_users.values())
    total_window_seconds = sum(day_seconds.values())
    online_now = sum(1 for u in users if u["online"])

    new_7d = db.query(TelegramUser).filter(
        TelegramUser.created_at >= now - timedelta(days=7)
    ).count()

    kpis = {
        "online_now":       online_now,
        "active_today":     len(day_users.get(today.isoformat(), set())),
        "active_7d":        active_within(today - timedelta(days=6)),
        "active_30d":       active_within(today - timedelta(days=29)),
        "tracked_users":    len(per_user),
        "new_7d":           new_7d,
        "avg_minutes_day":  round((total_window_seconds / total_user_days) / 60, 1) if total_user_days else 0,
        "total_minutes":    round(total_window_seconds / 60, 1),
        "total_hours":      round(total_window_seconds / 3600, 1),
        "window_days":      days,
    }

    # ── daily series (window) ──
    daily = []
    for i in range(days):
        d = window_start + timedelta(days=i)
        dkey = d.isoformat()
        daily.append({
            "day":          dkey,
            "active_users": len(day_users.get(dkey, set())),
            "minutes":      round(day_seconds.get(dkey, 0) / 60, 1),
        })

    # ── contribution calendar (full span) ──
    calendar = []
    for i in range(CALENDAR_DAYS):
        d = cal_start + timedelta(days=i)
        dkey = d.isoformat()
        calendar.append({
            "day":     dkey,
            "minutes": round(cal_seconds.get(dkey, 0) / 60, 1),
            "users":   len(cal_users.get(dkey, set())),
        })

    return {"kpis": kpis, "daily": daily, "users": users, "calendar": calendar}


@router.get("/heatmap")
def heatmap(
    telegram_id: Optional[int] = None,
    days: int = CALENDAR_DAYS,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("activity")),
):
    """Per-day usage series for the GitHub-style calendar. With ``telegram_id`` it
    is one person's grid; without it, the aggregate across everyone."""
    days = max(7, min(days, CALENDAR_DAYS))
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)

    q = db.query(UserActivity).filter(UserActivity.day >= start)
    if telegram_id is not None:
        q = q.filter(UserActivity.telegram_id == telegram_id)

    by_day: dict[str, dict] = {}
    for r in q.all():
        dkey = r.day.isoformat()
        b = by_day.setdefault(dkey, {"minutes": 0.0, "count": 0})
        b["minutes"] += (r.active_seconds or 0) / 60
        b["count"] += int(r.event_count or 0)

    series = []
    for i in range(days):
        d = start + timedelta(days=i)
        dkey = d.isoformat()
        b = by_day.get(dkey)
        series.append({
            "day":     dkey,
            "minutes": round(b["minutes"], 1) if b else 0,
            "count":   b["count"] if b else 0,
        })
    return {"telegram_id": telegram_id, "series": series}
