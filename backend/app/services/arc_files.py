"""THE door for an ARC ticket's attachments — photos and files, both of IT's apps.

Why this exists: the page's Content-Security-Policy is ``img-src 'self'`` (plus
three video CDNs, `main._CSP`), so a browser may never draw a picture straight
off IT's host. Every ``<img src="https://…safiabakery.uz/…">`` the ticket modal
rendered was refused and fell back to a bare link — which is how the operator
came to report «the image is not being displayed». Widening the policy to IT's
hosts would not have been enough either: the Android app ships the policy frozen
inside the APK, and the new app's files may sit behind its login. So the bytes
come through here, same-origin, page-gated like every other ARC read.

Where each app keeps them:

* **old app** (internal API, frozen 2026-10-05) — ``arc_requests.files``, paths
  relative to ``settings.internal_api_url`` («files/AgAC….jpg»), served
  unauthenticated (``arc_client.file_url``).
* **new app** (login API) — ``photo_report`` (the crew's report) and
  ``document_url`` on every list item, and the filer's attachments, which only
  the SINGLE-ticket endpoint carries (``GET /arc/api/v1/requests/factory/{id}``
  → ``files``, each ``{id, request_id, file_path, created_at}`` with a
  ``file_path`` «misc/YYYY/MM/DD/<uuid>.jpg»). The mirror never stores that
  card, so it is read on demand when somebody opens the ticket (:func:`card`,
  cached). All of them are served at ``<api host>/base/<path>`` (confirmed on
  production 2026-10-17; a «.heic» there arrives as JPEG bytes).

A relative path on the new app's host does not say which URL serves it, so
:func:`fetch` walks a short list of bases (`_new_bases`) and remembers the one
that answered with real bytes (`_WIN`) — every later file goes straight there.
What every attempt answered is kept in :func:`trace` for the diagnostic.

Safety: an attachment's URL is IT's data, so it is fetched only over https — a
relative path only from a ``*.safiabakery.uz`` base, an absolute URL or a
redirect only from a public name (never an IP literal or a private name) — with
IT's own credential only on IT's own host, at most ``MAX_BYTES``. Nothing here is a URL a viewer typed: the router resolves the
ticket from the mirror first and addresses a file by its position.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import threading
import time
from collections import OrderedDict
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import settings
from app.services import arc_client, arc_legacy_client

log = logging.getLogger(__name__)

MAX_BYTES = 20 * 1024 * 1024
# One file's walk over the candidate bases. Each miss is usually a fast 404;
# the cap keeps a host that hangs inside Cloudflare's 100 s.
_WALK_BUDGET_S = 40.0
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_CARD_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
_CARD_TTL_S = 10 * 60
_CARD_FAIL_TTL_S = 60
_CACHE_BYTES = 64 * 1024 * 1024

_UUID_RE = re.compile(r"^[0-9A-Za-z-]{8,64}$")
_IMAGE_EXT = re.compile(r"\.(jpe?g|png|webp|gif|bmp|heic|heif)$", re.I)

# The image types a browser draws — served inline. Everything else (a PDF, a
# HEIC, an unknown blob) is an attachment, never rendered in our origin.
INLINE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"}


# ── what a ticket carries ────────────────────────────────────────────────────

def is_image_name(path: str) -> bool:
    return bool(_IMAGE_EXT.search((path or "").split("?", 1)[0]))


def _basename(path: str) -> str:
    p = (path or "").split("?", 1)[0].rstrip("/")
    return p.rsplit("/", 1)[-1] or p


def _item(path: str, name: Optional[str], app: str, role: str) -> dict:
    path = str(path).strip()
    nm = (str(name).strip() if name else "") or _basename(path)
    return {"path": path, "name": nm, "app": app, "role": role,
            "kind": "image" if (is_image_name(path) or is_image_name(nm)) else "file"}


def old_files(files: Any) -> list[dict]:
    """``arc_requests.files`` (``arc_client._files`` shape: {id, url, href})."""
    out = []
    for f in files or []:
        if isinstance(f, dict):
            p = f.get("href") or f.get("url")
            if p:
                out.append(_item(p, None, "old", "file"))
        elif isinstance(f, str) and f.strip():
            out.append(_item(f, None, "old", "file"))
    return out


# Where a card's file entry may keep its address and its name — the API has
# not been read on this box, so every spelling it might use is accepted.
_PATH_KEYS = ("url", "file_url", "href", "link", "file_path", "path", "file", "src")
_NAME_KEYS = ("file_name", "filename", "original_name", "name", "title")


def card_files(card: Optional[dict], report: Optional[str]) -> list[dict]:
    """The filer's attachments off the single-ticket card, the crew's report
    photo left out (it is shown on its own, under «Foto-hisobot»)."""
    if not isinstance(card, dict):
        return []
    raw = card.get("files")
    if not isinstance(raw, list):
        raw = card.get("file") if isinstance(card.get("file"), list) else []
    skip = _basename(report or "") if report else ""
    out, seen = [], set()
    for f in raw:
        path, name = None, None
        if isinstance(f, dict):
            for k in _PATH_KEYS:
                v = f.get(k)
                if isinstance(v, str) and v.strip():
                    path = v
                    break
            for k in _NAME_KEYS:
                v = f.get(k)
                if isinstance(v, str) and v.strip() and v.strip() != path:
                    name = v
                    break
        elif isinstance(f, str):
            path = f
        if not path or path in seen or (skip and _basename(path) == skip):
            continue
        seen.add(path)
        out.append(_item(path, name, "new", "file"))
    return out


def report_item(photo_report: Optional[str], role: str = "report") -> Optional[dict]:
    """A one-path field of the new app — ``photo_report`` (role report) or
    ``document_url`` (role document); both are relative «misc/…» paths."""
    if not photo_report or not str(photo_report).strip():
        return None
    return _item(photo_report, None, "new", role)


# ── the new app's single-ticket card ─────────────────────────────────────────

_cards: dict[str, tuple[float, Optional[dict], Optional[str]]] = {}
_cards_lock = threading.Lock()


def card(remote_id: str, force: bool = False) -> tuple[Optional[dict], Optional[str]]:
    """``(card, error)`` for one new-app ticket — ``error`` is
    ``not_configured`` · ``bad_id`` · ``failed`` (with the card None). Kept
    ``_CARD_TTL_S`` (a failure ``_CARD_FAIL_TTL_S``), so the thumbnails a modal
    asks for next do not each read it again."""
    if not _UUID_RE.match(remote_id or ""):
        return None, "bad_id"
    if not arc_legacy_client.configured():
        return None, "not_configured"
    now = time.monotonic()
    with _cards_lock:
        hit = _cards.get(remote_id)
    if hit and not force:
        ts, c, err = hit
        if now - ts < (_CARD_TTL_S if err is None else _CARD_FAIL_TTL_S):
            return c, err
    c, err = None, None
    try:
        with httpx.Client() as client:
            body = arc_legacy_client.get_json(
                client, f"{arc_legacy_client._REQUESTS_PATH}/{remote_id}", timeout=_CARD_TIMEOUT)
        c = body if isinstance(body, dict) else None
        if c is None:
            err = "failed"
    except arc_legacy_client.ArcError as exc:
        log.warning("ARC card %s: %s", remote_id, str(exc)[:200])
        err = "failed"
    except Exception:
        log.exception("ARC card %s", remote_id)
        err = "failed"
    with _cards_lock:
        if len(_cards) > 500:
            _cards.clear()
        _cards[remote_id] = (time.monotonic(), c, err)
    return c, err


# ── fetching the bytes ───────────────────────────────────────────────────────

def _host(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower()
    except Exception:
        return ""


def _ours(url: str) -> bool:
    """IT's host family — the only place an attachment URL may point at."""
    h = _host(url)
    return url.startswith("https://") and (h == "safiabakery.uz" or h.endswith(".safiabakery.uz"))


def _public(url: str) -> bool:
    """Where a redirect from IT's host may lead: https, a real name, not an IP
    literal and not a private/local name."""
    h = _host(url)
    if not url.startswith("https://") or not h or "." not in h:
        return False
    if h in ("localhost",) or h.endswith((".local", ".internal", ".lan")):
        return False
    try:
        ipaddress.ip_address(h.strip("[]"))
        return False
    except ValueError:
        return True


def _new_host() -> str:
    return (settings.arc_legacy_api_url or "").rstrip("/")


def _new_bases() -> list[str]:
    """Where a relative new-app path may be served, most likely first. The
    winner of an earlier file is put in front (`_WIN`)."""
    b = _new_host()
    # «/base» is where production answered on 2026-10-17 (the deploy probe:
    # every other tail 404) — first, so a restart costs no walk.
    tails = ("/base", "", "/arc", "/files", "/arc/files", "/media", "/static",
             "/uploads", "/storage", "/arc/static", "/arc/media", "/arc/api/v1/files")
    out = [b + t for t in tails]
    if settings.internal_api_url:
        i = settings.internal_api_url.rstrip("/")
        out += [i, i + "/files"]
    return out


_WIN: dict[str, str] = {}          # first path segment → the base that served it
_win_lock = threading.Lock()


def _seg(rel: str) -> str:
    return rel.split("/", 1)[0] if "/" in rel else ""


def candidates(item: dict) -> list[str]:
    """Every URL one attachment may live at, in the order they are tried."""
    p = str(item.get("path") or "").strip()
    if p.startswith("//"):
        p = "https:" + p
    if p.startswith(("http://", "https://")):
        if p.startswith("http://") and _host(p).endswith("safiabakery.uz"):
            p = "https://" + p[len("http://"):]
        # An absolute address is IT's own word for where the file is — kept
        # when it names a public https host (their storage may not be on
        # safiabakery.uz); never an IP literal or a private name.
        return [p] if _public(p) else []
    rel = p.lstrip("/")
    if not rel:
        return []
    if item.get("app") == "old":
        u = arc_client.file_url(rel)
        return [u] if u and _ours(u) else []
    bases = _new_bases()
    with _win_lock:
        won = _WIN.get(_seg(rel))
    if won:
        bases = [won] + [x for x in bases if x != won]
    out: list[str] = []
    for base in bases:
        u = base.rstrip("/") + "/" + rel
        if u not in out and _ours(u):
            out.append(u)
    return out


def sniff(data: bytes) -> str:
    """The content type the BYTES prove — never what the server claimed."""
    h = data[:16]
    if h.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if h.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if h[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if h[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if h[:2] == b"BM":
        return "image/bmp"
    if h[:5] == b"%PDF-":
        return "application/pdf"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heis", b"hevc"):
        return "image/heic"
    return "application/octet-stream"


def _looks_like_page(data: bytes, ctype: str) -> bool:
    """An HTML page or a JSON error — what a wrong base answers with a 200."""
    head = data[:512].lstrip().lower()
    if "html" in (ctype or "").lower() or head.startswith((b"<!doctype", b"<html")):
        return True
    return "json" in (ctype or "").lower() or head.startswith((b"{", b"["))


def _headers_for(url: str, client: httpx.Client) -> dict:
    h = _host(url)
    if h and h == _host(_new_host()) and arc_legacy_client.configured():
        try:
            return {"Authorization": f"Bearer {arc_legacy_client._get_token(client)}"}
        except arc_legacy_client.ArcError:
            return {}
    if h and h == _host(settings.internal_api_url or "") and settings.internal_api_key:
        return {"X-Internal-Key": settings.internal_api_key}
    return {}


def _get_one(client: httpx.Client, url: str, deadline: float) -> tuple[Optional[bytes], str]:
    """``(bytes, why)`` — bytes only when the answer is a real file."""
    hops = 0
    while True:
        left = deadline - time.monotonic()
        if left <= 1:
            return None, "budget"
        try:
            with client.stream("GET", url, headers=_headers_for(url, client),
                               timeout=httpx.Timeout(min(20.0, left), connect=min(5.0, left))) as res:
                if res.status_code in (301, 302, 303, 307, 308) and hops < 3:
                    nxt = urljoin(url, res.headers.get("location") or "")
                    if not _public(nxt):
                        return None, f"{res.status_code} → refused"
                    url, hops = nxt, hops + 1
                    continue
                if res.status_code != 200:
                    return None, str(res.status_code)
                n = res.headers.get("content-length")
                if n and n.isdigit() and int(n) > MAX_BYTES:
                    return None, "too_big"
                buf = bytearray()
                for chunk in res.iter_bytes():
                    buf += chunk
                    if len(buf) > MAX_BYTES:
                        return None, "too_big"
                data = bytes(buf)
                if not data:
                    return None, "empty"
                if _looks_like_page(data, res.headers.get("content-type", "")):
                    return None, "200 page"
                return data, "200"
        # «net:» = the host did not answer at all — `fetch` then skips every
        # other base on that host.
        except httpx.TimeoutException:
            return None, "net:timeout"
        except httpx.HTTPError as exc:
            return None, f"net:{type(exc).__name__}"


_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()
_cache_size = 0
_cache_lock = threading.Lock()


def _remember(key: str, data: bytes, ctype: str) -> None:
    global _cache_size
    if len(data) > _CACHE_BYTES // 4:
        return
    with _cache_lock:
        if key in _cache:
            return
        _cache[key] = (data, ctype)
        _cache_size += len(data)
        while _cache_size > _CACHE_BYTES and _cache:
            _, (d, _c) = _cache.popitem(last=False)
            _cache_size -= len(d)


_last_trace: list[dict] = []


def trace() -> list[dict]:
    """What the last walks tried — for the deploy diagnostic only."""
    return list(_last_trace)


def fetch(item: dict) -> tuple[Optional[bytes], str]:
    """``(bytes, content_type)`` for one attachment, or ``(None, why)``."""
    urls = candidates(item)
    if not urls:
        return None, "no_url"
    with _cache_lock:
        for u in urls:
            if u in _cache:
                _cache.move_to_end(u)
                return _cache[u]
    deadline = time.monotonic() + _WALK_BUDGET_S
    tried = []
    dead: set[str] = set()     # hosts that did not answer at all
    with httpx.Client(follow_redirects=False) as client:
        for u in urls:
            if _host(u) in dead:
                continue
            data, why = _get_one(client, u, deadline)
            tried.append({"url": u, "answer": why})
            if data is not None:
                ctype = sniff(data)
                _remember(u, data, ctype)
                rel = str(item.get("path") or "").lstrip("/")
                if item.get("app") == "new" and not rel.startswith(("http://", "https://")):
                    base = u[: len(u) - len(rel)].rstrip("/")
                    with _win_lock:
                        _WIN[_seg(rel)] = base
                _note(item, tried)
                return data, ctype
            if why == "budget":
                break
            if why.startswith("net:"):
                dead.add(_host(u))
    _note(item, tried)
    log.warning("ARC file not found: %s — %s", item.get("path"),
                "; ".join(f"{t['url']} {t['answer']}" for t in tried)[:600])
    return None, "unreachable"


def _note(item: dict, tried: list[dict]) -> None:
    _last_trace.append({"path": item.get("path"), "app": item.get("app"), "tried": tried})
    del _last_trace[:-20]
