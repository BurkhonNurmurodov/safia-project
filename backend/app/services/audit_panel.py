"""THE audit-panel client — the panel the KRU and the technologists file their
audits in, read with a login and a password (docs/audits.md).

Phase 1, built 2026-11-21: the operator's «make one admin page to insert the
login and password», then «panel now, page later based on the data». So this
module stores the connection and runs a DISCOVERY test — nothing on the
platform reads an audit from the panel yet. The «Auditlar» page (KRU / Texnik,
each with «Ro'yxat» / «Tahlil») is built once the test has shown what the
panel hands out; until then `public.audit` stays the only audit source
(services/tech_audit.py).

The panel's address never reached the code's author. What IS known: the
Service Desk dashboard (Tasker, ARC's new app) sits behind
``POST /base/api/v1/v2/login`` (username + password → a JWT, 404 «Invalid
Credentials» to a wrong password — services/arc_legacy_client.py), its API on
``api.<the panel's host>``. The test therefore:

  1. **panel** — reads the panel's own web page and its JavaScript (no
     credential is sent there) and lists the API paths its screens call that
     name an audit, the KRU, a checklist or an inspection, plus the API hosts
     it talks to and the login path it uses;
  2. **login** — logs in, on the Service Desk path first, then on a login path
     the panel's code names;
  3. **spec** — asks each API module the panel calls for its OpenAPI document
     (ARC's answered 401 even with the bearer; another module may not);
  4. **sample** — calls up to eight audit-shaped GET endpoints for five rows
     each and keeps their field names and three masked example rows, so the
     page can be designed off the real shape.

**The password is SEALED at rest** (``web_auth.seal_password``) and never comes
back out — the Verifix model: the card says only whether one is stored. It goes
in a JSON body (or a form) to the login path only; the JWT rides in the
``Authorization`` header only. Neither is ever logged, stored in the test result
or put in an exception message.

**The address is an allow-list** — ``*.safiabakery.uz`` / ``*.safiacorporate.uz``
over https, or localhost with a port — because it decides where the password is
sent. Redirects are followed by hand and each hop is checked against the same
list; the API calls follow none.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy.orm import Session

from app.services.verifix import TZ, _get, _put

log = logging.getLogger(__name__)

DEFAULT_URL = "https://dashboard.service.safiabakery.uz"
LOGIN_PATH = "/base/api/v1/v2/login"
_SUFFIXES = ("safiabakery.uz", "safiacorporate.uz")
_LOCAL_HOSTS = {"localhost", "127.0.0.1"}

K_URL = "audit_panel_url"
K_LOGIN = "audit_panel_login"
K_PASSWORD = "audit_panel_password"   # SEALED — web_auth.seal_password
K_LAST_TEST = "audit_panel_last_test"  # JSON: shapes, paths and masked samples

# Inside Cloudflare's 100 s (the Verifix / Tasker test's arithmetic).
BUDGET_S = 75.0
PANEL_BUDGET_S = 28.0
CALL_TIMEOUT_S = 20.0

# The panel's JavaScript: how much of it is read, at most.
MAX_FILES = 60
MAX_FILE_BYTES = 8_000_000
MAX_TOTAL_BYTES = 60_000_000
MAX_SAMPLES = 8
MAX_SPECS = 10

# What an audit-shaped thing is called in such a system (en + ru + uz).
KEYWORDS = ("audit", "kru", "revision", "revizi", "checklist", "check-list", "check_list",
            "inspection", "inspect", "rating", "аудит", "кру", "ревиз", "чек-лист",
            "tekshir", "nazorat")
_KW = re.compile("|".join(re.escape(k) for k in KEYWORDS), re.IGNORECASE)

# Path literals in a bundle. Quotes of all three kinds; `${…}` kept as written.
_Q = r"[\"'`]"
_RE_API = re.compile(_Q + r"((?:https?://[a-z0-9.-]+)?/?(?:[a-z][a-z0-9_-]{1,30}/)?api/v\d+(?:/[^\"'`\s<>\\]{0,160})?)" + _Q,
                     re.IGNORECASE)
_RE_KW_PATH = re.compile(_Q + r"(/[A-Za-z0-9_${}./:-]{0,80}(?:" + "|".join(re.escape(k) for k in KEYWORDS[:12])
                         + r")[A-Za-z0-9_${}./:-]{0,80})" + _Q, re.IGNORECASE)
_RE_ORIGIN = re.compile(r"https?://[a-z0-9.-]+\.(?:safiabakery|safiacorporate)\.uz", re.IGNORECASE)
_RE_SCRIPT = re.compile(r"<script\b[^>]*\bsrc=[\"']([^\"']+)[\"']", re.IGNORECASE)
_RE_LINK_JS = re.compile(r"<link\b[^>]*\bhref=[\"']([^\"']+\.m?js(?:\?[^\"']*)?)[\"']", re.IGNORECASE)
_RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
# A further chunk a bundle loads: Vite's «assets/Name-hash.js», webpack's
# «static/js/…chunk.js», Next's «_next/static/…», or a bare «./Name-hash.js».
_RE_CHUNK = re.compile(_Q + r"((?:\.{0,2}/)?(?:[A-Za-z0-9_./-]*/)?[A-Za-z0-9_.-]{1,120}\.m?js)" + _Q)
_LOGINISH = re.compile(r"^(v\d+/)?(login|signin|sign-in|sign_in|token|auth|authenticate)$", re.IGNORECASE)


class PanelError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None):
        super().__init__(message or code)
        self.code, self.message, self.status = code, message, status


# ── the stored connection ─────────────────────────────────────────────────────

def _host_ok(scheme: str, host: str, port: Optional[int]) -> bool:
    if host in _LOCAL_HOSTS:
        return scheme in ("http", "https") and bool(port)
    return (scheme == "https" and port in (None, 443)
            and any(host == s or host.endswith("." + s) for s in _SUFFIXES))


def norm_url(raw: Optional[str]) -> dict:
    """The panel's address as pasted from a browser — blank → the Service Desk
    dashboard. Returns ``url`` (origin + the pasted path, a hint of where the
    audits sit), ``ui`` (the panel's origin) and ``api`` (its API's origin:
    ``api.<host>``, the Service Desk convention, or the host itself when the
    API's own address was pasted). Raises ValueError off the allow-list."""
    s = (raw or "").strip()
    if not s:
        s = DEFAULT_URL
    if "://" not in s:
        s = ("http://" if s.split(":", 1)[0].split("/", 1)[0].lower() in _LOCAL_HOSTS else "https://") + s
    try:
        u = urlsplit(s)
        port = u.port
    except ValueError:
        raise ValueError("not an address")
    host = (u.hostname or "").lower().rstrip(".")
    scheme = (u.scheme or "").lower()
    if u.username or u.password:
        raise ValueError("the address must not carry a login")
    if not host or not _host_ok(scheme, host, port):
        raise ValueError("the address must be https on safiabakery.uz or safiacorporate.uz "
                         "(or localhost with a port)")
    origin = f"{scheme}://{host}" + (f":{port}" if port else "")
    # A hash router keeps its route in the fragment — that is the hint too.
    path = (u.path or "").rstrip("/")
    if u.fragment.startswith("/"):
        path = f"{path}/#{u.fragment.rstrip('/')}"
    if host in _LOCAL_HOSTS:
        ui = api = origin
    elif host.startswith("api."):
        api = origin
        ui = f"{scheme}://{host[4:]}" + (f":{port}" if port else "")
    else:
        ui = origin
        api = f"{scheme}://api.{host}" + (f":{port}" if port else "")
    return {"url": origin + path, "ui": ui, "api": api}


def config(db: Session) -> dict:
    """What the card shows — and, for the test, the password (``_password``,
    never sent to a browser: the router drops it)."""
    from app.web_auth import open_password

    sealed = _get(db, K_PASSWORD)
    pw = open_password(sealed) if sealed else None
    try:
        where = norm_url(_get(db, K_URL))
    except ValueError:
        where = norm_url(None)
    return {
        **where,
        "default_url": DEFAULT_URL,
        "login": _get(db, K_LOGIN) or "",
        "password_set": bool(sealed),
        # A sealed value that no longer opens must be re-entered — say so
        # rather than let the test fail as «rejected».
        "password_readable": (pw is not None) if sealed else None,
        "_password": pw,
    }


def public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items() if not k.startswith("_")}


def save(db: Session, *, url: Optional[str] = None, login: Optional[str] = None,
         password: Optional[str] = None, clear_password: bool = False) -> dict:
    """Write what was sent; ``None`` leaves a field alone. Returns what changed,
    for the action register — the password's LENGTH, never the password."""
    from app.web_auth import seal_password

    changed: dict[str, Any] = {}
    if url is not None:
        new = norm_url(url)["url"]
        try:
            old = norm_url(_get(db, K_URL))["url"]
        except ValueError:
            old = norm_url(None)["url"]
        if new != old:
            _put(db, K_URL, None if new == norm_url(None)["url"] else new)
            changed["url"] = (old, new)
    if login is not None:
        new = login.strip()
        if len(new) > 120 or any(ord(ch) < 32 for ch in new):
            raise ValueError("the login is not a login")
        old = _get(db, K_LOGIN) or ""
        if new != old:
            _put(db, K_LOGIN, new or None)
            changed["login"] = (old, new)
    if clear_password:
        if _get(db, K_PASSWORD):
            _put(db, K_PASSWORD, None)
            changed["password"] = "cleared"
    elif password:
        if len(password) > 200 or any(ord(ch) < 32 for ch in password):
            raise ValueError("the password holds a character that cannot be sent")
        _put(db, K_PASSWORD, seal_password(password))
        changed["password"] = len(password)
    if changed:
        _put(db, K_LAST_TEST, None)
    db.commit()
    return changed


def last_test(db: Session) -> Optional[dict]:
    raw = _get(db, K_LAST_TEST)
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


# ── reading the panel's own code ──────────────────────────────────────────────

def _same_site(url: str, ui: str) -> bool:
    try:
        a, b = urlsplit(url), urlsplit(ui)
    except ValueError:
        return False
    return (a.scheme, a.hostname, a.port) == (b.scheme, b.hostname, b.port)


def _fetch(c: httpx.Client, url: str, max_bytes: int) -> httpx.Response:
    """GET with redirects followed BY HAND, each hop on the allow-list."""
    for _ in range(4):
        try:
            u = urlsplit(url)
            ok = _host_ok((u.scheme or "").lower(), (u.hostname or "").lower(), u.port)
        except ValueError:
            ok = False
        if not ok:
            raise PanelError("off_list", url[:200])
        try:
            with c.stream("GET", url) as res:
                if 300 <= res.status_code < 400 and res.headers.get("location"):
                    url = urljoin(url, res.headers["location"])
                    continue
                body = b""
                for chunk in res.iter_bytes():
                    body += chunk
                    if len(body) > max_bytes:
                        raise PanelError("too_big", url[:200], res.status_code)
                res._content = body  # read once, in full or not at all
                return res
        except httpx.TimeoutException:
            raise PanelError("timeout", url[:200])
        except httpx.HTTPError as exc:
            raise PanelError("network", type(exc).__name__)
    raise PanelError("redirects", url[:200])


def scan_code(texts: list[str]) -> dict:
    """What a set of JavaScript (and HTML) texts says about the API: every
    ``…/api/vN/…`` path, the audit-shaped paths and routes, the API hosts and
    the login-ish paths. Pure — the unit tests feed it strings."""
    api_paths: Counter = Counter()
    kw_paths: Counter = Counter()
    origins: Counter = Counter()
    for t in texts:
        for m in _RE_API.finditer(t):
            api_paths[m.group(1)] += 1
        for m in _RE_KW_PATH.finditer(t):
            p = m.group(1)
            if not p.lower().endswith((".js", ".css", ".png", ".svg", ".jpg", ".woff", ".woff2")):
                kw_paths[p] += 1
        for m in _RE_ORIGIN.finditer(t):
            origins[m.group(0).lower()] += 1

    def rel(p: str) -> str:
        p = re.sub(r"^https?://[^/]+", "", p)
        return p if p.startswith("/") else "/" + p

    modules: Counter = Counter()
    for p, n in api_paths.items():
        seg = rel(p).split("/")
        if len(seg) > 2 and seg[2] == "api":
            modules[seg[1]] += n
    audit_api = sorted({rel(p) for p in api_paths if _KW.search(p)})
    login = sorted({rel(p) for p in api_paths if "${" not in p and _LOGINISH.search(p.rstrip("/").rsplit("/", 1)[-1] or "")})
    routes = sorted({p for p in kw_paths if "/api/" not in p})
    return {
        "modules": [{"name": k, "count": v} for k, v in modules.most_common(20)],
        "audit_api": audit_api[:300],
        "routes": routes[:200],
        "login": login[:20],
        "origins": [o for o, _ in origins.most_common(10)],
        "api_total": len(api_paths),
    }


def _chunks(text: str, base: str, ui: str) -> list[str]:
    out = []
    for m in _RE_CHUNK.finditer(text):
        ref = m.group(1)
        if "/" not in ref and not re.search(r"[-.][A-Za-z0-9_]{6,}\.m?js$", ref):
            continue  # a bare word ending in .js, not a hashed chunk
        url = urljoin(base, ref)
        if _same_site(url, ui):
            out.append(url.split("#", 1)[0])
    return out


def _priority(url: str) -> int:
    name = url.rsplit("/", 1)[-1]
    return 0 if _KW.search(name) else 1


def read_panel(c: httpx.Client, cfg: dict, deadline: float) -> dict:
    """The panel's page and the JavaScript it loads, read breadth-first —
    audit-named chunks first — within the caps."""
    start = cfg["url"].split("/#", 1)[0] or cfg["ui"]
    res = _fetch(c, start, 2_000_000)
    if res.status_code >= 400 and start.rstrip("/") != cfg["ui"]:
        # A server that answers a deep link with 404 still serves the app at /.
        res = _fetch(c, cfg["ui"] + "/", 2_000_000)
    if res.status_code >= 400:
        raise PanelError("http", f"{res.status_code} on the panel's page", res.status_code)
    html = res.text or ""
    title = _RE_TITLE.search(html)
    queue = [urljoin(str(res.url), s) for s in _RE_SCRIPT.findall(html) + _RE_LINK_JS.findall(html)]
    queue = [u for u in queue if _same_site(u, cfg["ui"])]
    seen: set[str] = set()
    texts, files, total, skipped = [html], 0, 0, 0
    while queue and files < MAX_FILES and total < MAX_TOTAL_BYTES and time.monotonic() < deadline:
        queue.sort(key=_priority)
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            r = _fetch(c, url, MAX_FILE_BYTES)
        except PanelError:
            skipped += 1
            continue
        if r.status_code != 200:
            skipped += 1
            continue
        body = r.text or ""
        files += 1
        total += len(r.content)
        texts.append(body)
        queue.extend(u for u in _chunks(body, url, cfg["ui"]) if u not in seen)
    left = len({u for u in queue if u not in seen})
    found = scan_code(texts)
    return {"ok": True, "status": res.status_code,
            "title": re.sub(r"\s+", " ", title.group(1)).strip()[:120] if title else None,
            "files": files, "bytes": total, "skipped": skipped, "unread": left, **found}


# ── the API ───────────────────────────────────────────────────────────────────

def api_client(cfg: dict) -> httpx.Client:
    return httpx.Client(base_url=cfg["api"], headers={"Accept": "application/json"},
                        timeout=httpx.Timeout(CALL_TIMEOUT_S, connect=10.0),
                        # A redirect would re-send the password or the bearer.
                        follow_redirects=False)


def _detail(res: httpx.Response) -> str:
    try:
        body = res.json()
    except ValueError:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", res.text or "")).strip()[:300]
    if isinstance(body, dict) and body.get("detail") is not None:
        v = body["detail"]
        return (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))[:300]
    return json.dumps(body, ensure_ascii=False)[:300]


def _token_of(body: Any) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    for k in ("access_token", "accessToken", "token", "access", "jwt"):
        v = body.get(k)
        if isinstance(v, str) and len(v) > 10:
            return v
    for k in ("data", "result"):
        v = _token_of(body.get(k))
        if v:
            return v
    return None


def login(c: httpx.Client, cfg: dict, paths: list[str],
          deadline: Optional[float] = None) -> tuple[Optional[str], list[dict]]:
    """Try each login path — JSON first, a form after a 422 — and return the
    bearer with what each try answered (status, a code, the API's own detail;
    never a credential). Stops at the first token and at the first REJECTION:
    a wrong password tried on five paths is five failed logins on the account."""
    tries: list[dict] = []
    creds = {"username": cfg["login"], "password": cfg["_password"]}
    for path in paths:
        for form in (False, True):
            left = (deadline - time.monotonic()) if deadline else CALL_TIMEOUT_S
            if left < 3:
                tries.append({"path": path, "form": form, "code": "no_time"})
                return None, tries
            try:
                res = c.post(path, timeout=min(CALL_TIMEOUT_S, left),
                             **({"data": creds} if form else {"json": creds}))
            except httpx.TimeoutException:
                tries.append({"path": path, "form": form, "code": "timeout"})
                return None, tries
            except httpx.HTTPError as exc:
                tries.append({"path": path, "form": form, "code": "network", "message": type(exc).__name__})
                return None, tries
            d = _detail(res)
            t = {"path": path, "form": form, "status": res.status_code}
            if 200 <= res.status_code < 300:
                try:
                    tok = _token_of(res.json())
                except ValueError:
                    tok = None
                if tok:
                    tries.append({**t, "code": "ok"})
                    return tok, tries
                tries.append({**t, "code": "no_token", "message": d})
                break
            if res.status_code == 422 and not form:
                tries.append({**t, "code": "shape", "message": d})
                continue  # the same path may want a form
            gone = res.status_code in (404, 405) and not re.search(r"credential|password|user|parol|логин|пароль", d, re.I)
            tries.append({**t, "code": "no_path" if gone else "rejected", "message": d})
            if not gone:
                return None, tries
            break
    return None, tries


def _get_json(c: httpx.Client, path: str, token: Optional[str], params: Optional[dict] = None,
              timeout: Optional[float] = None) -> tuple[int, Any, str]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        res = c.get(path, params=params or None, headers=headers,
                    **({"timeout": timeout} if timeout else {}))
    except httpx.TimeoutException:
        raise PanelError("timeout", path)
    except httpx.HTTPError as exc:
        raise PanelError("network", type(exc).__name__)
    try:
        body = res.json()
    except ValueError:
        body = None
    return res.status_code, body, _detail(res) if res.status_code >= 300 else ""


def read_specs(c: httpx.Client, token: Optional[str], modules: list[str], deadline: float) -> dict:
    """Each module's OpenAPI document: who answers, and the audit-shaped
    endpoints of those that do (method, path, its query parameters)."""
    tried, endpoints = [], []
    for m in modules[:MAX_SPECS]:
        if time.monotonic() > deadline:
            break
        path = f"/{m}/openapi.json" if m else "/openapi.json"
        try:
            status, body, d = _get_json(c, path, token, timeout=15)
        except PanelError as e:
            tried.append({"module": m, "code": e.code})
            continue
        ok = status == 200 and isinstance(body, dict) and isinstance(body.get("paths"), dict)
        tried.append({"module": m, "status": status, "ok": ok, **({} if ok else {"message": d[:160]})})
        if not ok:
            continue
        whole_module = bool(_KW.search(m))
        for p, ops in body["paths"].items():
            if not isinstance(ops, dict) or not (whole_module or _KW.search(p)):
                continue
            for method, op in ops.items():
                if method.lower() not in ("get", "post", "put", "patch", "delete") or not isinstance(op, dict):
                    continue
                params = [{"name": x.get("name"), "in": x.get("in"), "required": bool(x.get("required")),
                           "type": (x.get("schema") or {}).get("type") or (x.get("schema") or {}).get("format")}
                          for x in op.get("parameters") or [] if isinstance(x, dict)]
                endpoints.append({"module": m, "method": method.upper(),
                                  "path": p if p.startswith(f"/{m}/") or not m else f"/{m}{p}",
                                  "summary": (op.get("summary") or "")[:120], "params": params[:30]})
    return {"tried": tried, "endpoints": endpoints[:250]}


def _short(v: Any, depth: int = 0) -> Any:
    """A sample value cut to what a person needs to recognise it."""
    if isinstance(v, str):
        return v if len(v) <= 120 else v[:117] + "…"
    if isinstance(v, list):
        if depth >= 1:
            return f"[{len(v)}]"
        return [_short(x, depth + 1) for x in v[:3]] + ([f"… +{len(v) - 3}"] if len(v) > 3 else [])
    if isinstance(v, dict):
        if depth >= 2:
            return "{…}"
        return {k: _short(x, depth + 1) for k, x in list(v.items())[:40]}
    return v


def shape_of(body: Any) -> dict:
    """What a list answer holds: its kind, its total, its rows' fields (one
    level deep, with a type), three masked example rows."""
    from app.services.ops_door import mask_json

    items, total, keys = None, None, None
    if isinstance(body, list):
        items = body
    elif isinstance(body, dict):
        keys = sorted(body.keys())[:40]
        for k in ("items", "results", "data", "rows", "content", "records", "list"):
            v = body.get(k)
            if isinstance(v, list):
                items = v
                break
            if isinstance(v, dict):
                for k2 in ("items", "results", "rows", "list"):
                    if isinstance(v.get(k2), list):
                        items = v[k2]
                        break
                if items is not None:
                    break
        for k in ("total", "count", "total_count", "totalCount", "totalElements"):
            if isinstance(body.get(k), int):
                total = body[k]
                break
    out: dict[str, Any] = {"kind": type(body).__name__, "keys": keys, "total": total}
    if items is None:
        out["sample"] = mask_json(_short(body), set()) if isinstance(body, dict) else None
        return out
    rows = [x for x in items if isinstance(x, dict)]
    fields: dict[str, str] = {}
    for r in rows[:20]:
        for k, v in r.items():
            if isinstance(v, dict):
                for k2, v2 in list(v.items())[:30]:
                    fields.setdefault(f"{k}.{k2}", type(v2).__name__)
            else:
                fields.setdefault(k, type(v).__name__ if v is not None else fields.get(k, "null"))
    masked: set = set()
    out.update(count=len(items), fields=[{"name": k, "type": v} for k, v in list(fields.items())[:120]],
               sample=[mask_json(_short(r), masked) for r in rows[:3]])
    if masked:
        out["masked"] = sorted(masked)[:20]
    return out


def _sample_targets(spec: dict, panel: dict) -> list[dict]:
    """GET endpoints without a path parameter — the spec's first, then the
    paths the panel's code names."""
    out, seen = [], set()
    for e in spec.get("endpoints") or []:
        if e["method"] == "GET" and "{" not in e["path"] and e["path"] not in seen:
            seen.add(e["path"])
            out.append({"path": e["path"], "params": [p["name"] for p in e.get("params") or []]})
    for p in panel.get("audit_api") or []:
        p = p.split("?", 1)[0].rstrip("/")
        if "${" in p or "{" in p or ":" in p.split("/")[-1] or p in seen or not re.search(r"/api/v\d+/.+", p):
            continue
        seen.add(p)
        out.append({"path": p, "params": None})
    return out[:MAX_SAMPLES]


def _params_for(declared: Optional[list[str]]) -> dict:
    """Five rows of the last 30 days. Undeclared names are ignored by FastAPI,
    so without a spec every common name is sent."""
    today = datetime.now(TZ).date()
    month_ago = (today - timedelta(days=30)).isoformat()
    every = {"page": 1, "size": 5, "limit": 5, "per_page": 5, "page_size": 5}
    if declared is None:
        return every
    d = set(declared)
    out = {k: v for k, v in every.items() if k in d}
    for k in d:
        if re.fullmatch(r"(date_?from|from_?date|start_?date|begin_?date|date_?start|start)", k, re.I):
            out[k] = month_ago
        elif re.fullmatch(r"(date_?to|to_?date|end_?date|finish_?date|date_?end|end)", k, re.I):
            out[k] = today.isoformat()
    return out


def sample(c: httpx.Client, token: str, targets: list[dict], deadline: float) -> list[dict]:
    out = []
    for t in targets:
        if time.monotonic() > deadline - 3:
            out.append({"path": t["path"], "code": "no_time"})
            continue
        params = _params_for(t["params"])
        try:
            status, body, d = _get_json(c, t["path"], token, params,
                                        timeout=min(CALL_TIMEOUT_S, max(3.0, deadline - time.monotonic())))
        except PanelError as e:
            out.append({"path": t["path"], "code": e.code})
            continue
        row: dict[str, Any] = {"path": t["path"], "status": status, "params": sorted(params)}
        if 200 <= status < 300:
            row.update(ok=True, **shape_of(body))
        else:
            # A 422 names the parameters the endpoint REQUIRES — worth keeping.
            row.update(ok=False, message=d[:300])
        out.append(row)
    return out


# ── the test ──────────────────────────────────────────────────────────────────

def _fail(e: PanelError) -> dict:
    return {"ok": False, "code": e.code, "message": e.message[:300], "status": e.status}


def run_test(db: Session, actor: str = "") -> dict:
    started = time.monotonic()
    deadline = started + BUDGET_S
    cfg = config(db)
    result: dict[str, Any] = {"at": datetime.now(TZ).isoformat(timespec="seconds"), "by": actor,
                              "url": cfg["url"], "ui": cfg["ui"], "api": cfg["api"], "steps": []}
    if not cfg["login"] or not cfg["password_set"]:
        result.update(ok=False, verdict="not_configured")
        return _finish(db, result, started)
    if cfg["_password"] is None:
        result.update(ok=False, verdict="password_unreadable")
        return _finish(db, result, started)
    steps = result["steps"]

    # 1. the panel's own page and code — no credential goes there.
    panel: dict[str, Any] = {"key": "panel"}
    with httpx.Client(timeout=httpx.Timeout(15.0, connect=8.0), follow_redirects=False,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; SafiaIMS/1.0)"}) as wc:
        try:
            panel.update(read_panel(wc, cfg, min(deadline, started + PANEL_BUDGET_S)))
        except PanelError as e:
            panel.update(_fail(e))
    steps.append(panel)

    with api_client(cfg) as c:
        # 2. log in.
        paths = [LOGIN_PATH] + [p for p in panel.get("login") or [] if p != LOGIN_PATH][:3]
        token, tries = login(c, cfg, paths, deadline - 25)
        lstep = {"key": "login", "ok": bool(token), "tries": tries}
        if not token:
            last = tries[-1] if tries else {}
            lstep.update(code=last.get("code") or "no_path", status=last.get("status"),
                         message=last.get("message"))
        steps.append(lstep)

        # 3. the OpenAPI documents of the modules the panel calls.
        mods = [m["name"] for m in panel.get("modules") or []]
        for m in ("tasker", "audit", "kru", "base", ""):
            if m not in mods:
                mods.append(m)
        spec = {"key": "spec"}
        spec.update(read_specs(c, token, mods, deadline - 20))
        spec["ok"] = any(x.get("ok") for x in spec["tried"])
        steps.append(spec)

        # 4. five rows from each audit-shaped list.
        samples: list[dict] = []
        if token:
            samples = sample(c, token, _sample_targets(spec, panel), deadline)
        steps.append({"key": "sample", "ok": any(s.get("ok") for s in samples),
                      "tried": len(samples), "answered": sum(1 for s in samples if s.get("ok"))})
        result["samples"] = samples

    if not token:
        code = lstep.get("code")
        verdict = ("login_rejected" if code == "rejected"
                   else "unreachable" if code in ("timeout", "network") else "no_login")
    elif any(s.get("ok") and (s.get("count") or s.get("total")) for s in samples):
        verdict = "found"
    elif panel.get("audit_api") or spec.get("endpoints"):
        verdict = "found_empty"
    else:
        verdict = "login_only"
    result.update(ok=verdict == "found", verdict=verdict)
    return _finish(db, result, started)


def _finish(db: Session, result: dict, started: float) -> dict:
    result["ms"] = int((time.monotonic() - started) * 1000)
    raw = json.dumps(result, ensure_ascii=False, default=str)
    if len(raw) > 400_000:  # the samples are what can grow — keep the shape
        for s in result.get("samples") or []:
            s.pop("sample", None)
        result["trimmed"] = True
        raw = json.dumps(result, ensure_ascii=False, default=str)
    try:
        _put(db, K_LAST_TEST, raw)
        db.commit()
    except Exception:
        db.rollback()
        log.exception("audit panel: could not store the test result")
    log.info("audit panel test: %s in %s ms", result.get("verdict"), result["ms"])
    return result
