"""TEMPORARY, READ-ONLY report (2026-10-29): why «abbos.m» cannot sign in on
the website.

The browser shows «Could not reach the server» — which the login form prints
ONLY when its request got no answer at all — while the same person signs in
through the bot, and the site answers a sign-in from anywhere else. Only
production knows whether those presses ever arrived, so this report reads,
once, and DMs the answer to the operator:

  1. the «abbos.m» browser login itself — enabled, lockout, last successful
     sign-in, whether its profile still resolves (never a password column);
  2. every browser sign-in request the action register recorded in the last
     72 hours — real client IP, status, duration, who it signed in;
  3. what that profile did on the platform in the same window, and through
     which door (Telegram or the browser);
  4. the app log's WEB-LOGIN lines, and nginx's own access and error logs for
     the sign-in paths, if this process may read them.

Text first, then everything in one .txt file. Nothing is written but the
flag `_send_report_once` keeps. Delete this module, `startup.report_weblogin`,
`startup._weblogin_job` and both entrypoint calls once it has landed.
"""
from __future__ import annotations

import glob
import os
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.config import settings

TZ = ZoneInfo("Asia/Tashkent")
USERNAME = "abbos.m"
WINDOW_H = 72
SEND_RETRIES = 3
_API = "https://api.telegram.org"

_LOG_DIR = os.environ.get("LOG_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
_NGINX = ("/var/log/nginx/production.safiacorporate.uz.access.log",
          "/var/log/nginx/production.safiacorporate.uz.access.log.1",
          "/var/log/nginx/access.log")
_NGINX_ERR = ("/var/log/nginx/production.safiacorporate.uz.error.log",
              "/var/log/nginx/error.log")
_TAIL_BYTES = 40 * 1024 * 1024


def _t(dt) -> str:
    if not dt:
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ).strftime("%d.%m %H:%M:%S")


def _tail_lines(path: str, needles: tuple[str, ...], limit: int) -> tuple[str, list[str]]:
    """The last `limit` lines of `path` holding any needle. (state, lines)."""
    if not os.path.exists(path):
        return "missing", []
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as fh:
            if size > _TAIL_BYTES:
                fh.seek(size - _TAIL_BYTES)
                fh.readline()
            raw = fh.read()
    except PermissionError:
        return "not readable (permission)", []
    except Exception as exc:  # pragma: no cover — a report must not die on a log
        return f"not readable ({type(exc).__name__})", []
    out = []
    for line in raw.decode("utf-8", "replace").splitlines():
        if any(n in line for n in needles):
            out.append(line[:600])
    return f"read ({len(out)} matching)", out[-limit:]


def collect(db: Session) -> dict:
    from app import web_auth
    from app.identity import profile_display_name

    since = datetime.now(timezone.utc) - timedelta(hours=WINDOW_H)
    rep: dict = {"at": datetime.now(timezone.utc), "since": since}

    creds = db.execute(sql(
        "SELECT id, profile_key, username, enabled, token_version, failed_attempts, "
        "locked_until, last_login_at, password_set_at, created_at "
        "FROM web_credentials WHERE username = :u OR username ILIKE 'abbos%' "
        "ORDER BY id"), {"u": USERNAME}).mappings().all()
    rep["creds"] = []
    for c in creds:
        c = dict(c)
        try:
            ident = web_auth.session_identity(db, c["profile_key"])
        except Exception as exc:
            ident = {"error": type(exc).__name__}
        try:
            c["profile_name"] = profile_display_name(db, c["profile_key"])
        except Exception:
            c["profile_name"] = None
        c["identity"] = ident
        c["lock_left_s"] = None
        if c["locked_until"]:
            lu = c["locked_until"]
            if lu.tzinfo is None:
                lu = lu.replace(tzinfo=timezone.utc)
            c["lock_left_s"] = max(0, int((lu - rep["at"]).total_seconds()))
        rep["creds"].append(c)
    keys = [c["profile_key"] for c in rep["creds"]]

    rep["requests"] = [dict(r) for r in db.execute(sql(
        "SELECT created_at, action, outcome, status, duration_ms, ip, app_version, "
        "target_id, target_name, details "
        "FROM action_logs WHERE path LIKE '/api/auth/web/%' AND created_at >= :s "
        "ORDER BY created_at DESC LIMIT 400"), {"s": since}).mappings().all()]

    rep["activity"] = []
    rep["last_web"] = {}
    for k in keys:
        rep["activity"] += [dict(r, key=k) for r in db.execute(sql(
            "SELECT created_at, source, action, outcome, status, path, ip, app_version "
            "FROM action_logs WHERE actor_profile_key = :k AND created_at >= :s "
            "ORDER BY created_at DESC LIMIT 40"), {"k": k, "s": since}).mappings().all()]
        rep["last_web"][k] = db.execute(sql(
            "SELECT max(created_at) FROM action_logs "
            "WHERE actor_profile_key = :k AND source = 'web'"), {"k": k}).scalar()

    needles = ("WEB-LOGIN", "/api/auth/web", USERNAME)
    rep["applog"] = []
    for path in sorted(glob.glob(os.path.join(_LOG_DIR, "app.log*")), reverse=True):
        state, lines = _tail_lines(path, needles, 150)
        rep["applog"].append((path, state, lines))
    rep["nginx"] = [(p, *_tail_lines(p, ("/api/auth/web/",), 200)) for p in _NGINX]
    rep["nginx_err"] = [(p, *_tail_lines(p, ("auth/web", "upstream"), 60)) for p in _NGINX_ERR]
    db.rollback()
    return rep


def text(rep: dict) -> tuple[str, str]:
    """(the short message, the full file)."""
    s: list[str] = []
    s.append(f"Web login report — «{USERNAME}»")
    s.append(f"Taken {_t(rep['at'])} (Tashkent), window: last {WINDOW_H} h.")
    s.append("")
    if not rep["creds"]:
        s.append(f"✖ No browser login named «{USERNAME}» (or abbos*) exists.")
    for c in rep["creds"]:
        ident = c["identity"]
        s.append(f"Login «{c['username']}» → {c['profile_key']} ({c.get('profile_name') or '?'})")
        s.append(f"  enabled: {c['enabled']} · failed attempts: {c['failed_attempts']} · "
                 f"locked until: {_t(c['locked_until'])}"
                 + (f" ({c['lock_left_s']} s left)" if c["lock_left_s"] else ""))
        s.append(f"  last successful sign-in: {_t(c['last_login_at'])} · "
                 f"password set: {_t(c['password_set_at'])} · token version: {c['token_version']}")
        if ident is None:
            s.append("  ✖ profile does NOT resolve (no approved holder) → server answers 403")
        elif "error" in (ident or {}):
            s.append(f"  ✖ resolving the profile raised {ident['error']}")
        else:
            s.append(f"  profile resolves: {ident.get('role')} · {ident.get('full_name')} · "
                     f"tg {ident.get('telegram_id')}")
        s.append(f"  last action through the BROWSER ever: {_t(rep['last_web'].get(c['profile_key']))}")

    reqs = rep["requests"]
    logins = [r for r in reqs if r["action"] == "session.web_login"]
    s.append("")
    s.append(f"Browser sign-in requests that REACHED the app in {WINDOW_H} h: {len(logins)}")
    by = Counter(str(r["status"]) for r in logins)
    if by:
        s.append("  by status: " + ", ".join(f"{k}×{v}" for k, v in sorted(by.items())))
    ok = Counter((r["target_name"] or r["target_id"] or "?") for r in logins if r["status"] == 200)
    if ok:
        s.append("  signed in OK: " + ", ".join(f"{k}×{v}" for k, v in ok.most_common(15)))
    mine = [r for r in logins if r["target_id"] in {c["profile_key"] for c in rep["creds"]}]
    s.append(f"  successful ones for «{USERNAME}»: {len(mine)}"
             + (f" (last {_t(mine[0]['created_at'])})" if mine else ""))
    s.append("")
    s.append("Last 15 sign-in requests (time · status · ms · IP · who):")
    for r in logins[:15]:
        s.append(f"  {_t(r['created_at'])} · {r['status']} · {r['duration_ms']} · "
                 f"{r['ip'] or '?'} · {r['target_name'] or '—'}")
    for path, state, _ in rep["nginx"]:
        s.append(f"nginx {os.path.basename(path)}: {state}")

    full: list[str] = list(s)
    full += ["", "=" * 70, f"ALL web-auth requests in the action register ({len(reqs)}):"]
    for r in reqs:
        full.append(f"{_t(r['created_at'])} | {r['action']} | {r['outcome']} | {r['status']} | "
                    f"{r['duration_ms']} ms | ip {r['ip']} | v{r['app_version']} | "
                    f"{r['target_id'] or ''} {r['target_name'] or ''} | {r['details'] or ''}")
    full += ["", "=" * 70, f"What the profile did in {WINDOW_H} h (newest first):"]
    for r in rep["activity"]:
        full.append(f"{_t(r['created_at'])} | {r['source']} | {r['action']} | {r['outcome']} | "
                    f"{r['status']} | {r['path']} | ip {r['ip']} | v{r['app_version']}")
    for title, groups in (("app log", rep["applog"]), ("nginx access", rep["nginx"]),
                          ("nginx error", rep["nginx_err"])):
        for path, state, lines in groups:
            full += ["", "=" * 70, f"{title}: {path} — {state}"]
            full += lines
    return "\n".join(s), "\n".join(full)


def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=120)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    short, full = text(collect(db))
    chunks, cur = [], ""
    for line in short.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    stamp = datetime.now(TZ).strftime("%d.%m.%Y-%H%M")
    _post("sendDocument",
          {"chat_id": chat_id, "caption": f"Web login report «{USERNAME}», full detail"},
          files={"document": (f"weblogin-{stamp}.txt", full.encode("utf-8"), "text/plain")})
    return len(chunks) + 1
