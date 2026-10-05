"""What the assistant may call, and the door it calls through.

THE rule of «Yordamchi»: it does the user's work THROUGH THE USER'S OWN
SESSION. Every read and every change is an ordinary request to an ordinary
endpoint of this app, made in-process with the very headers the user's own
request carried (their token, their Telegram initData, their ghost mode). So
every permission check, factory lock, row scope and closed-day lock the
endpoint already applies is applied to the assistant too, by the same code —
it can never reach further than the person typing, and an «open as» tab acts
exactly as the profile it shows. There is no second permission model here.

On top of the user's own permissions sits ONE narrowing, the operator's
(2026-10-05), and this module is its only spelling — ``access_of``:

* ``read``    — every GET. Runs without asking.
* ``export``  — a file the page itself would hand over (``…export.xlsx`` and
                friends). Runs without asking; in a browser the file comes back
                as a download, in Telegram the endpoint DMs it, as always.
* ``write``   — any other change. NEVER runs directly: the assistant must put
                it in a plan the user confirms (services/assistant.py).
* ``blocked`` — off-limits even with a Confirm: the danger zone; logins, keys
                and platform settings; mass messages; deleting records; people
                and access; the exam; and any route the action register cannot
                classify (an unknown effect is not one to guess at).
* ``hidden``  — plumbing nobody asks for (auth, telemetry, the exam sandbox,
                the camera's upload doors, the assistant's own endpoints).

A new endpoint lands in the right class by its action-register category the
day it ships — the register must classify every mutating route anyway.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.services import action_log

# ── the classes ──────────────────────────────────────────────────────────────

_HIDDEN_PREFIXES = (
    "/api/exam/", "/admin/exam/attempts", "/api/auth/", "/api/activity/",
    "/api/ui-prefs/", "/api/boot-report", "/api/crash-report", "/bot/",
    "/api/android/", "/api/assistant/", "/api/push/", "/api/leader-proof/",
    "/api/translations", "/api/education/seen/", "/api/education/progress",
    "/api/education/resolve", "/api/version", "/health", "/docs", "/openapi",
    # Reads that are not data: the database-dump inventory, a raw Telegram file
    # fetcher that takes any file id, the reviewer's key card.
    "/admin/db-dump", "/admin/tg-file", "/api/leader-ai/key",
)

# A file the page itself would hand over. Reading, not changing.
_EXPORT = re.compile(r"(\.xlsx|\.pptx|\.csv|\.pdf|/export)$")

# Why a route is off-limits, in the words the assistant explains it with.
REASONS = ("danger", "credentials", "settings", "mass_message", "delete",
           "people_access", "exam", "unknown")

_CAT_BLOCK = {
    "danger": "danger",
    "sessions": "credentials",
    "identity": "people_access",
    "training": "exam",
    "other": "unknown",
}

# First match wins. Specific routes the category alone would place wrongly.
_RULES: list[tuple[Optional[tuple[str, ...]], str, str]] = [
    # — always fine: the bell's own read marks and the reader's own channels —
    (("POST",), r"/api/notifications/(read|read-all|seen)", "write"),
    (("PUT",), r"/api/notifications/prefs", "write"),
    # A worker's concern, filed on the cell PC (category «other» by accident).
    (("POST",), r"/api/cell-concerns", "write"),
    # — deletions dressed as approvals: a deletion request APPROVED deletes rows —
    (("POST",), r"/api/staff(-live)?/requests/batch/[^/]+/approve", "blocked:delete"),
    # — the danger zone that is not filed under «danger» —
    (("POST",), r"/api/admin/logs/[^/]+/undo", "blocked:danger"),
    (None, r"/admin/delete-attendance", "blocked:delete"),
    # — logins, keys and platform-wide settings —
    (None, r"/api/leader-ai/(key|model)", "blocked:credentials"),
    (None, r"/api/admin/verifix(/.*)?", "blocked:credentials"),
    (None, r"/api/admin/translations(/.*)?", "blocked:settings"),
    (None, r"/admin/sheet-sources/[^/]+", "blocked:settings"),
    # — anything that messages many people at once —
    (None, r"/api/broadcast(/.*)?", "blocked:mass_message"),
    (None, r"/api/education/lessons(/.*)?", "blocked:mass_message"),
    (("POST",), r"/api/notifications", "blocked:mass_message"),
    (None, r"/api/production/trudoyomkost/(call-notify|autocall)", "blocked:mass_message"),
    # — who may see what —
    (None, r"/api/idle-owner/admin/owners", "blocked:people_access"),
    (None, r"/api/factories/assign/.*", "blocked:people_access"),
    (None, r"/admin/capabilities(/.*)?", "blocked:people_access"),
    (None, r"/admin/page-access", "blocked:people_access"),
]
_COMPILED_RULES = [(m, re.compile("^" + rx + "/?$"), v) for m, rx, v in _RULES]

# An action key that names a removal. Archiving is NOT one (it deletes nothing).
_DELETE_WORDS = re.compile(r"(delete|deleted|removed|_cleanup|wiped|discarded|purge|cleared)")


def _band_keys() -> set[str]:
    """The colour-band settings — «Rules & configuration», which the operator
    allowed — out of everything ``PUT /admin/settings`` can write."""
    keys = {"status_bands"}
    try:
        from app.routers.settings import ZAGRUZKA_BANDS
        for fields in ZAGRUZKA_BANDS.values():
            for setting_key, _default in fields.values():
                keys.add(setting_key)
    except Exception:
        pass
    return keys


def access_of(method: str, path: str, body: Any = None) -> tuple[str, str]:
    """(class, reason) for one concrete request. THE policy — every caller
    (the catalog, the read tool, the plan validator, the executor) asks it."""
    m = (method or "").upper()
    p = urlsplit(path or "").path or "/"
    if not (p.startswith("/api/") or p.startswith("/admin/")):
        return "hidden", "hidden"
    if p.startswith(_HIDDEN_PREFIXES):
        return "hidden", "hidden"
    if m == "GET":
        return "read", ""
    if m not in ("POST", "PUT", "PATCH", "DELETE"):
        return "hidden", "hidden"
    for methods, rx, verdict in _COMPILED_RULES:
        if methods and m not in methods:
            continue
        if rx.match(p):
            if verdict == "write":
                return "write", ""
            return "blocked", verdict.split(":", 1)[1]
    if m in ("POST", "GET") and _EXPORT.search(p):
        return "export", ""
    if m == "DELETE":
        return "blocked", "delete"
    cat, act = action_log.classify(m, p)
    if _DELETE_WORDS.search(act or ""):
        return "blocked", "delete"
    if cat in _CAT_BLOCK:
        return "blocked", _CAT_BLOCK[cat]
    if cat == "comms":
        return "blocked", "mass_message"
    if cat == "config":
        if p == "/admin/settings":
            keys = set(body.keys()) if isinstance(body, dict) else set()
            if keys and keys <= _band_keys():
                return "write", ""
            return "blocked", "settings"
        if p == "/api/downtime/wage-rates":
            return "write", ""
        return "blocked", "settings"
    return "write", ""


# ── the catalog ──────────────────────────────────────────────────────────────

@dataclass
class Endpoint:
    method: str
    path: str
    name: str
    summary: str
    doc: str
    params: list[dict] = field(default_factory=list)
    body: Optional[dict] = None
    files: list[str] = field(default_factory=list)
    access: str = "read"
    reason: str = ""
    regex: Any = None


_lock = threading.Lock()
_catalog: list[Endpoint] = []


def _walk(routes):
    from fastapi.routing import APIRoute
    for r in routes:
        if isinstance(r, APIRoute):
            yield r
        elif hasattr(r, "effective_route_contexts"):
            try:
                yield from r.effective_route_contexts()
            except Exception:
                continue


def _summary(doc: str, name: str) -> str:
    text = re.sub(r"\s+", " ", (doc or "").replace("`", "")).strip()
    if not text:
        return name.replace("_", " ")
    m = re.match(r"(.{20,180}?[.!?])(\s|$)", text)
    s = m.group(1) if m else text[:150]
    return s if len(s) <= 160 else s[:157] + "…"


def _type_name(field_obj) -> str:
    ann = getattr(getattr(field_obj, "field_info", None), "annotation", None)
    n = getattr(ann, "__name__", None) or str(ann or "")
    return n.replace("typing.", "").replace("Optional", "")[:30] or "any"


def _schema_of(ctx) -> tuple[Optional[dict], list[str]]:
    """The JSON body's schema (compact) and any multipart FILE field names."""
    files: list[str] = []
    body = getattr(ctx, "body_field", None)
    dep = getattr(ctx, "dependant", None)
    for bp in (getattr(dep, "body_params", None) or []):
        tn = _type_name(bp)
        if "UploadFile" in tn or "bytes" in tn.lower():
            files.append(bp.name)
    if body is None:
        return None, files
    try:
        from pydantic import TypeAdapter
        ann = body.field_info.annotation
        schema = TypeAdapter(ann).json_schema()
    except Exception:
        return {"type": "object"}, files
    return _compact_schema(schema), files


def _compact_schema(schema: dict, depth: int = 0) -> dict:
    """Inline $refs one level and keep only what a caller needs."""
    defs = schema.get("$defs") or {}

    def walk(node, d):
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            ref = node["$ref"].split("/")[-1]
            if d > 3 or ref not in defs:
                return {"type": "object", "ref": ref}
            return walk(defs[ref], d + 1)
        out = {}
        for k, v in node.items():
            if k in ("title", "$defs"):
                continue
            if k == "properties" and isinstance(v, dict):
                out[k] = {pk: walk(pv, d) for pk, pv in v.items()}
            elif k in ("items", "additionalProperties") and isinstance(v, dict):
                out[k] = walk(v, d)
            elif k in ("anyOf", "allOf", "oneOf") and isinstance(v, list):
                out[k] = [walk(x, d) for x in v]
            elif k == "description" and isinstance(v, str):
                out[k] = v[:200]
            else:
                out[k] = v
        return out

    return walk(schema, depth)


def catalog() -> list[Endpoint]:
    if _catalog:
        return _catalog
    with _lock:
        if _catalog:
            return _catalog
        from app.main import app
        seen = set()
        out: list[Endpoint] = []
        for ctx in _walk(app.routes):
            path = getattr(ctx, "path", "") or ""
            if ":path" in path:
                continue
            for method in sorted((getattr(ctx, "methods", None) or set()) - {"HEAD", "OPTIONS"}):
                probe = re.sub(r"\{[^}]+\}", "1", path)
                acc, why = access_of(method, probe)
                if acc == "hidden":
                    continue
                if (method, path) in seen:
                    continue
                seen.add((method, path))
                if method == "PUT" and path == "/admin/settings":
                    # Off-limits as a whole, open for the colour bands alone —
                    # «Rules & configuration», which the operator allowed. The
                    # executor re-asks access_of WITH the body every time.
                    acc, why = "write", "bands_only"
                fn = getattr(ctx, "endpoint", None)
                doc = (getattr(fn, "__doc__", None) or getattr(ctx, "description", "") or "")
                doc = re.sub(r"\n\s+", "\n", doc).strip()
                dep = getattr(ctx, "dependant", None)
                params = []
                for kind, plist in (("path", getattr(dep, "path_params", None) or []),
                                    ("query", getattr(dep, "query_params", None) or [])):
                    for pf in plist:
                        fi = getattr(pf, "field_info", None)
                        default = getattr(fi, "default", None)
                        params.append({
                            "in": kind, "name": pf.alias or pf.name,
                            "type": _type_name(pf),
                            "required": bool(getattr(pf, "required", False)),
                            **({"default": default} if default not in (None, Ellipsis)
                               and isinstance(default, (str, int, float, bool)) else {}),
                        })
                body, files = (None, [])
                if method != "GET":
                    body, files = _schema_of(ctx)
                regex = getattr(ctx, "path_regex", None)
                out.append(Endpoint(method, path, getattr(ctx, "name", "") or "",
                                    _summary(doc, getattr(ctx, "name", "") or ""), doc[:3000],
                                    params, body, files, acc, why, regex))
        out.sort(key=lambda e: (e.path, e.method))
        _catalog[:] = out
        return _catalog


def match(method: str, path: str) -> Optional[Endpoint]:
    """The catalog entry a CONCRETE path belongs to (``/api/tasks/12``)."""
    m = (method or "").upper()
    p = urlsplit(path or "").path
    for e in catalog():
        if e.method == m and e.regex is not None and e.regex.match(p):
            return e
    return None


def index_text() -> str:
    """The compact list the system prompt carries: the paths it may use, by
    area. Off-limits routes are left out — they are not tools."""
    groups: dict[str, list[str]] = {}
    for e in catalog():
        if e.access == "blocked":
            continue
        parts = e.path.split("/")
        head = "/".join(parts[:3]) if e.path.startswith("/api/") else "/".join(parts[:3])
        tail = e.path[len(head):] or "/"
        mark = {"read": "GET", "export": "FILE", "write": e.method + "*"}[e.access]
        if e.access == "export":
            mark = "FILE " + e.method
        groups.setdefault(head, []).append(f"{mark} {tail}")
    return "\n".join(f"{h}: " + " · ".join(v) for h, v in sorted(groups.items()))


_WORD = re.compile(r"[0-9A-Za-zЀ-ӿ]+")


def find(query: str, limit: int = 14) -> list[dict]:
    """Endpoints whose path, name or description match the words asked for."""
    words = [w.lower() for w in _WORD.findall(query or "") if len(w) >= 2]
    if not words:
        return []
    scored = []
    for e in catalog():
        hay_path = (e.path + " " + e.name).lower()
        hay_doc = e.doc.lower()
        score = 0.0
        for w in words:
            if w in hay_path:
                score += 3
            if w in hay_doc:
                score += 1 + min(hay_doc.count(w), 5) * 0.2
        if score:
            scored.append((score - (0.5 if e.access == "blocked" else 0), e))
    scored.sort(key=lambda x: -x[0])
    return [card(e, brief=True) for _, e in scored[:limit]]


def card(e: Endpoint, brief: bool = False) -> dict:
    out = {"method": e.method, "path": e.path,
           "access": "off-limits" if e.access == "blocked" else e.access,
           "summary": e.summary}
    if e.access == "blocked":
        out["why"] = e.reason
    if e.reason == "bands_only":
        out["note"] = ("Only the colour-band keys may be written: "
                       + ", ".join(sorted(_band_keys())))
    if brief:
        return out
    out["description"] = e.doc
    out["params"] = e.params
    if e.body is not None:
        body_txt = json.dumps(e.body, ensure_ascii=False)
        out["body_schema"] = e.body if len(body_txt) < 6000 else body_txt[:6000] + "…"
    if e.files:
        out["file_fields"] = e.files
    return out


# ── the in-process door ──────────────────────────────────────────────────────

# Headers carried from the user's own request onto every call the assistant
# makes for them. Nothing else: never the exam header (the assistant refuses
# exam sessions outright), never a cookie.
FORWARD = ("authorization", "x-telegram-init-data", "x-ghost-mode", "user-agent",
           "cf-connecting-ip", "x-real-ip", "accept-language")

RUN_HEADER = "X-Assistant-Run"


def sign_run(run_id: int) -> str:
    """The value of the header that marks a request as the assistant's. Signed,
    so the Jurnal's «Yordamchi orqali» is a fact and not a claim anybody could
    attach to their own requests."""
    mac = hmac.new(settings.secret_key.encode(), f"assistant:{run_id}".encode(),
                   hashlib.sha256).hexdigest()[:20]
    return f"{run_id}.{mac}"


def verify_run(value: str) -> Optional[int]:
    try:
        rid, mac = (value or "").split(".", 1)
        rid_i = int(rid)
    except (ValueError, AttributeError):
        return None
    return rid_i if hmac.compare_digest(sign_run(rid_i), value) else None


@dataclass
class Caller:
    headers: dict
    run_id: int
    web: bool


@dataclass
class Result:
    status: int
    ok: bool
    data: Any = None
    text: str = ""
    file: Optional[tuple[str, str, bytes]] = None     # (name, mime, bytes)


_FILENAME = re.compile(r"filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?", re.I)


async def call(caller: Caller, method: str, path: str, *, query: Optional[dict] = None,
               body: Any = None, files: Optional[list[tuple[str, tuple[str, bytes, str]]]] = None,
               export: bool = False, timeout: float = 150.0) -> Result:
    """One request to this app, as the user. Never raises for an HTTP answer —
    a 403 or a 409 is an answer the assistant must relay."""
    from urllib.parse import unquote

    from app.main import app

    headers = dict(caller.headers)
    headers[RUN_HEADER] = sign_run(caller.run_id)
    params: dict = {}
    for k, v in (query or {}).items():
        if v is None:
            continue
        if isinstance(v, bool):
            params[k] = "true" if v else "false"
        elif isinstance(v, (list, tuple)):
            params[k] = [str(x) for x in v]
        else:
            params[k] = str(v)
    if export and caller.web:
        params["download"] = "1"

    # A crashing endpoint answers 500 like it would to the user, rather than
    # raising its exception into the assistant's own loop.
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://ims.internal",
                                 timeout=timeout) as client:
        kw: dict = {"params": params, "headers": headers}
        if files:
            kw["files"] = files
            if isinstance(body, dict):
                kw["data"] = {k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
                              for k, v in body.items() if v is not None}
        elif body is not None and method.upper() != "GET":
            kw["json"] = body
        res = await client.request(method.upper(), path, **kw)

    ctype = (res.headers.get("content-type") or "").lower()
    disp = res.headers.get("content-disposition") or ""
    out = Result(status=res.status_code, ok=200 <= res.status_code < 300)
    if "attachment" in disp.lower() or any(t in ctype for t in (
            "spreadsheetml", "presentationml", "application/pdf", "octet-stream",
            "application/zip", "image/")):
        m = _FILENAME.search(disp)
        name = unquote((m.group(1) or m.group(2)) if m else "") or "file"
        out.file = (name, ctype.split(";")[0] or "application/octet-stream", res.content)
        return out
    if "json" in ctype:
        try:
            out.data = res.json()
            return out
        except ValueError:
            pass
    out.text = res.text[:20000]
    return out


def shrink(obj: Any, max_chars: int) -> tuple[Any, bool]:
    """Fit a JSON answer into the model's budget by cutting LONG LISTS first
    (keeping their head and saying how many were left out), so the shape of
    the answer survives and only volume is lost."""
    def size(o):
        return len(json.dumps(o, ensure_ascii=False, default=str))

    if size(obj) <= max_chars:
        return obj, False

    def cut(o, keep):
        if isinstance(o, list):
            head = [cut(x, keep) for x in o[:keep]]
            if len(o) > keep:
                head.append(f"… {len(o) - keep} more items not shown")
            return head
        if isinstance(o, dict):
            return {k: cut(v, keep) for k, v in o.items()}
        if isinstance(o, str) and len(o) > 2000:
            return o[:2000] + "…"
        return o

    for keep in (80, 40, 20, 10, 5, 2):
        c = cut(obj, keep)
        if size(c) <= max_chars:
            return c, True
    txt = json.dumps(cut(obj, 2), ensure_ascii=False, default=str)
    return txt[:max_chars] + "…", True
