"""«Verifix (test)» — what Verifix's API can tell, laid out as pages (admin-only).

From 2026-10-03 (the operator: "build pages to different things we can get from
Verifix API — absolutely everything possible") a sidebar section of its own
reads Verifix through the login on the admin «Verifix» card and SHOWS it. It
writes nothing anywhere — not to Verifix (only the read methods of
`verifix_catalog` can be called) and not to the platform's data (the one table
it owns, `verifix_probes`, is a cache of what each method answered: counts and
field names, never a row).

Phase 1 pages, each served by one builder here:

* **API xaritasi** — `methods` + `method_rows`: every read method, what it
  answered the last time (works · empty · no access · not on this Verifix ·
  needs a value · switched off), and any method's first page as a raw table;
* **Tuzilma** — `structure`: the division tree, which node is one of OUR cells
  (a division `code` IS a verifix cell code — connection test, 2026-10-01) and
  how many working people sit in each;
* **Xodimlar** — `employees` + `person`: the people, and one person's card;
* **Lavozim va grafiklar** — `jobs` + `schedule_days`;
* **Davomat hisoboti** — `timesheet`: «Отчёт по посещениям» for one day, every
  row read through `verifix_live._person`, the live page's own rule, so the two
  pages can never call one person's day two different things;
* **Belgilar** — `marks` + `track_detail`: the raw marks of a time window;
* **Hozir ishda** — `locations` + `onsite`: who is inside a location now.

**Private records never leave the server.** `scrub` drops passport fields,
PINFL, the tax and pension ids and the person_* sub-lists (family, education,
previous jobs, languages), and masks a card number to its last four digits —
the operator opened wages and photos on 2026-10-03, not these. The methods
that serve nothing else are `blocked` in the catalog and never called.

**Photos** (opened 2026-10-03): a person's own photos (`identification_photos`)
and the photo taken at a mark (`photo_sha` on the last mark of a day and on
«who is inside»). `photo` streams them through this server, resized, from
Verifix's file door; it serves only a hash this process has itself handed out
as a PHOTO (`_ALLOWED`), so it cannot be turned into a fetcher for any other
file Verifix keeps. Nothing is stored — a small in-memory cache of the resized
copies only.

Every Verifix read is cached here for a few minutes (`_CACHE`; the page's
«Yangilash» reloads), so moving between pages does not re-read 18 pages of
employees each time.
"""
from __future__ import annotations

import io
import logging
import re
import threading
import time
from collections import Counter, OrderedDict
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Callable, Optional

import httpx
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import VerifixProbe
from app.services import cell_lookup, verifix, verifix_catalog as catalog, verifix_live, verifix_parity

log = logging.getLogger(__name__)

TZ = verifix.TZ

TTL_DIR = 600            # the directory lists: employees, divisions, jobs, …
TTL_TODAY = 90           # today's report / marks / who is inside
TTL_PAST = 600           # a finished day barely changes
REQUEST_BUDGET_S = 72.0  # one request's Verifix time: + one 25 s call stays under Cloudflare's 100 s
MAX_PAGES = 60
MARKS_PAGES = 12         # one marks window holds at most 12,000 marks
PROBE_LIMIT = 20         # rows a probe asks for
VIEW_LIMIT = 50          # rows the raw viewer asks for per page
PERSON_DAYS = 14         # days of a person's card
PHOTO_SMALL, PHOTO_LARGE = 96, 960


class NotConfigured(Exception):
    """No login / password / organization on the admin «Verifix» card."""


def config(db: Session) -> dict:
    c = verifix.config(db, with_password=True)
    if not (c["login"] and c.get("password") and c["filial_id"]):
        raise NotConfigured()
    return c


def meta(db: Session) -> dict:
    c = verifix.config(db)
    last = verifix.last_test(db) or {}
    return {
        "configured": bool(c["login"] and c["password_set"] and c["password_readable"] is not False
                           and c["filial_id"]),
        "host": c["host"], "login": c["login"], "filial_id": c["filial_id"],
        "last_test": {"at": last.get("at"), "verdict": last.get("verdict")} if last else None,
        "method_count": len(catalog.METHODS),
    }


# ── a cache that loads each key once ──────────────────────────────────────────

class _Cache:
    """Values younger than their ttl are reused; ttl 0 reloads. Two requests
    asking for one cold key load it ONCE: the second waits for the first,
    because the employee list alone is eighteen Verifix pages."""

    def __init__(self, max_items: int = 60):
        self._max = max_items
        self._lock = threading.Lock()
        self._data: "OrderedDict[tuple, tuple[float, datetime, Any]]" = OrderedDict()
        self._loading: dict[tuple, threading.Lock] = {}

    def get(self, key: tuple, ttl: float, fn: Callable[[], Any]) -> tuple[Any, datetime]:
        started = time.monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit and ttl > 0 and started - hit[0] < ttl:
                self._data.move_to_end(key)
                return hit[2], hit[1]
            gate = self._loading.setdefault(key, threading.Lock())
        with gate:
            with self._lock:
                hit = self._data.get(key)
            # Loaded by somebody else while this request waited — reuse it,
            # even on a forced reload: that reload is exactly what just ran.
            if hit and (hit[0] >= started or (ttl > 0 and time.monotonic() - hit[0] < ttl)):
                return hit[2], hit[1]
            val = fn()
            stamp = verifix_live.now_local()
            with self._lock:
                self._data[key] = (time.monotonic(), stamp, val)
                self._data.move_to_end(key)
                while len(self._data) > self._max:
                    old, _ = self._data.popitem(last=False)
                    self._loading.pop(old, None)
            return val, stamp


_CACHE = _Cache()


def _deadline() -> float:
    return time.monotonic() + REQUEST_BUDGET_S


def _pages(cl: httpx.Client, path: str, body: dict, limit: Optional[int], deadline: float,
           cap: int = MAX_PAGES):
    """Every page of one method. Raises VerifixError("slow") past the deadline
    or the page cap, so a caller can say a list is partial."""
    cursor = None
    for _ in range(cap):
        if time.monotonic() > deadline:
            raise verifix.VerifixError("slow", "stopped at the time limit")
        data, nxt = verifix.call(cl, path, body, limit=limit, cursor=cursor)
        yield _as_rows(data)
        if not nxt or nxt == cursor:
            return
        cursor = nxt
    raise verifix.VerifixError("slow", "stopped at the page limit")


def _list(c: dict, path: str, body: dict, deadline: float, limit: Optional[int] = 500) -> list[dict]:
    out: list[dict] = []
    with verifix.client(c) as cl:
        for page in _pages(cl, path, body, limit, deadline):
            out.extend(page)
    return out


def _as_rows(data: Any) -> list[dict]:
    if data is None:
        return []
    if isinstance(data, dict):
        inner = data.get("data") if "data" in data else data
        if isinstance(inner, list):
            return [x if isinstance(x, dict) else {"value": x} for x in inner]
        return [inner] if isinstance(inner, dict) and inner else []
    if isinstance(data, list):
        return [x if isinstance(x, dict) else {"value": x} for x in data]
    return [{"value": data}]


def _try(fn: Callable[[], Any]) -> tuple[Any, Optional[dict]]:
    """A section of a page that may be closed to the API role: its data, or
    the reason it is missing — never a page that fails over one section."""
    try:
        return fn(), None
    except verifix.VerifixError as exc:
        return None, {"code": _classify(exc), "message": exc.message or exc.code, "status": exc.status}


# ── values ────────────────────────────────────────────────────────────────────

def _s(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _dt(raw: Any) -> Optional[datetime]:
    s = _s(raw)
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt)
        except ValueError:
            continue
    return None


def _d_iso(raw: Any) -> Optional[str]:
    s = _s(raw)[:10]
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat(timespec="minutes") if dt else None


def _int(v: Any) -> Optional[int]:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _dmy(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%d.%m.%Y %H:%M:%S")


# ── what never leaves the server ──────────────────────────────────────────────

_PRIVATE = {
    "npin", "npins", "tin", "iapa",
    "person_edu_stages", "person_family_members", "person_familty_members", "person_langs",
    "person_experiences", "person_expiences", "person_work_places", "person_marital_statuses",
}


def _mask(v: Any) -> str:
    digits = re.sub(r"\D", "", str(v))
    return f"•••• {digits[-4:]}" if len(digits) >= 4 else "••••"


def scrub(v: Any) -> Any:
    """Drop passport / PINFL / tax / family records, mask card numbers."""
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            kl = str(k).lower()
            if kl in _PRIVATE or kl.startswith("passport_"):
                continue
            if kl == "card_number" and x:
                out[k] = _mask(x)
                continue
            out[k] = scrub(x)
        return out
    if isinstance(v, list):
        return [scrub(x) for x in v]
    return v


def _fields(rows: list[dict]) -> list[str]:
    """Field names a page carries, one level deep («days[].input_time»)."""
    seen: dict[str, None] = {}
    for r in rows[:200]:
        for k, v in r.items():
            if isinstance(v, dict):
                for sk in v:
                    seen.setdefault(f"{k}.{sk}", None)
            elif isinstance(v, list) and v and isinstance(v[0], dict):
                for item in v[:5]:
                    for sk in item:
                        seen.setdefault(f"{k}[].{sk}", None)
            else:
                seen.setdefault(str(k), None)
        if len(seen) > 300:
            break
    return list(seen)[:300]


# ── the API map ───────────────────────────────────────────────────────────────

def _classify(exc: verifix.VerifixError) -> str:
    if exc.code == "forbidden":
        return "forbidden"
    if exc.code == "not_found":
        return "missing"
    if exc.code == "unauthorized":
        return "auth"
    msg = (exc.message or "").lower()
    if any(w in msg for w in ("доступ", "прав", "access", "permission", "forbidden", "not allowed")):
        return "forbidden"
    if exc.code == "http" and exc.status == 400:
        return "bad_request"
    if exc.code in ("timeout", "slow"):
        return "slow"
    return "error"


def _record(db: Session, key: str, actor: str, **vals) -> None:
    try:
        stmt = pg_insert(VerifixProbe).values(method=key, probed_by=actor, probed_at=func.now(), **vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=["method"],
            set_={**vals, "probed_by": actor, "probed_at": func.now()},
        )
        db.execute(stmt)
        db.commit()
    except Exception:                                   # a cache row must never fail the read
        db.rollback()
        log.exception("verifix explore: could not store the probe of %s", key)


def methods(db: Session) -> dict:
    now = verifix_live.now_local()
    probes = {p.method: p for p in db.query(VerifixProbe).all()}
    out = []
    for m in catalog.METHODS:
        d = catalog.describe(m, now)
        d["needs"] = [p["name"] for p in d["params"] if p["required"] and p["default"] is None]
        p = probes.get(m.key)
        d["probe"] = None if p is None else {
            "status": p.status, "rows": p.rows, "more": bool(p.more), "fields": p.fields or [],
            "ms": p.ms, "http": p.http, "error": p.error, "by": p.probed_by,
            "at": p.probed_at.astimezone(TZ).replace(tzinfo=None).isoformat(timespec="minutes")
            if p.probed_at else None,
        }
        out.append(d)
    return {**meta(db), "methods": out}


def method_rows(db: Session, key: str, params: Optional[dict], cursor: Optional[str],
                limit: Optional[int], actor: str) -> dict:
    """One page of one method, as Verifix answers it (scrubbed). The first page
    of a call is also recorded as the method's probe for the map."""
    m = catalog.BY_KEY.get(key)
    if m is None:
        raise LookupError(key)
    now = verifix_live.now_local()
    base = {"key": key, "at": now.isoformat(timespec="seconds")}
    if m.blocked:
        return {**base, "status": "blocked", "rows": [], "fields": []}
    body, missing = catalog.build_body(m, params, now)
    if missing:
        if not cursor:
            _record(db, key, actor, status="needs_input", rows=None, more=False, fields=None,
                    ms=None, http=None, error=None)
        return {**base, "status": "needs_input", "missing": missing, "rows": [], "fields": [], "body": body}
    c = config(db)
    size = None
    if m.limit:
        size = max(1, min(int(limit or VIEW_LIMIT), m.limit))
    t0 = time.monotonic()
    nxt = None
    err = http = None
    try:
        with verifix.client(c) as cl:
            data, nxt = verifix.call(cl, m.key, body, limit=size, cursor=cursor)
        rows = _as_rows(data)
        status = "ok" if rows else "empty"
        http = 200
    except verifix.VerifixError as exc:
        rows, status = [], _classify(exc)
        err, http = (exc.message or exc.code)[:500], exc.status
        if status == "auth":
            # Every other method would fail the same way: say it once, plainly.
            err = err or "unauthorized"
    ms = int((time.monotonic() - t0) * 1000)
    rows = scrub(rows)
    fields = _fields(rows)
    if not cursor:
        _record(db, key, actor, status=status, rows=len(rows), more=bool(nxt), fields=fields,
                ms=ms, http=http, error=err)
    return {**base, "status": status, "rows": rows, "fields": fields, "next_cursor": nxt,
            "ms": ms, "http": http, "error": err, "body": body}


# ── the directory ─────────────────────────────────────────────────────────────

def _key(c: dict, *parts: Any) -> tuple:
    return (c["host"], c["filial_id"]) + parts


def _name(e: dict) -> str:
    return " ".join(_s(e.get(k)) for k in ("last_name", "first_name", "middle_name") if _s(e.get(k)))


def _emp(e: dict) -> Optional[dict]:
    eid = _s(e.get("employee_id"))
    if not eid:
        return None
    photos = [{"sha": _s(p.get("photo_sha")), "main": _s(p.get("is_main")) == "Y"}
              for p in (e.get("identification_photos") or []) if isinstance(p, dict) and _s(p.get("photo_sha"))]
    main = (_s(e.get("photo_sha"))
            or next((p["sha"] for p in photos if p["main"]), "")
            or (photos[0]["sha"] if photos else ""))
    return {
        "id": eid, "code": _s(e.get("employee_code")) or None, "name": _name(e) or f"#{eid}",
        "status": _s(e.get("status")) or "W", "gender": _s(e.get("gender")) or None,
        "birthday": _d_iso(e.get("birthday")), "phone": _s(e.get("phone_number")) or None,
        "hired": _d_iso(e.get("hiring_date")), "dismissed": _d_iso(e.get("dismissal_date")),
        "job": _s(e.get("job_id")), "div": _s(e.get("division_id")), "unit": _s(e.get("org_unit_id")),
        "sched": _s(e.get("schedule_id")), "face": _s(e.get("has_identification_photo")) == "Y",
        "photo": main or None, "photos": len(photos),
        "med_last": _d_iso(e.get("last_medical_check_date")),
        "med_next": _d_iso(e.get("next_medical_check_date")),
        "med": _s(e.get("medical_status")) or None,
    }


def _employees(c: dict, dl: float, force: bool = False) -> tuple[dict, datetime]:
    def load() -> dict:
        out: dict[str, dict] = {}
        with verifix.client(c) as cl:
            body = {"employee_ids": [], "statuses": [], "npins": []}
            for page in _pages(cl, "core/employee$list", body, verifix.LIMIT_LIST, dl):
                for e in page:
                    r = _emp(e)
                    if r:
                        out[r["id"]] = r
        return out
    return _CACHE.get(_key(c, "emps"), 0 if force else TTL_DIR, load)


def _divisions(c: dict, dl: float, force: bool = False) -> tuple[dict, datetime]:
    def load() -> dict:
        out: dict[str, dict] = {}
        for d in _list(c, "core/division$list", {"division_ids": []}, dl):
            did = _s(d.get("division_id"))
            if not did:
                continue
            raw = _s(d.get("code"))
            out[did] = {
                "id": did, "name": _s(d.get("name")) or f"#{did}", "parent": _s(d.get("parent_id")) or None,
                "code": verifix._code_key(raw) if raw else None, "raw_code": raw or None,
                "state": _s(d.get("state")) or "A", "opened": _d_iso(d.get("opened_date")),
                "closed": _d_iso(d.get("closed_date")), "group": _s(d.get("division_group_name")) or None,
                "workplace": _s(d.get("is_workplace")) == "Y",
            }
        return out
    return _CACHE.get(_key(c, "divs"), 0 if force else TTL_DIR, load)


def _named(c: dict, dl: float, force: bool, path: str, body: dict, id_key: str,
           extra: Callable[[dict], dict]) -> tuple[dict, datetime]:
    def load() -> dict:
        out: dict[str, dict] = {}
        for r in _list(c, path, body, dl):
            rid = _s(r.get(id_key))
            if rid:
                out[rid] = {"id": rid, "name": _s(r.get("name")) or f"#{rid}", **extra(r)}
        return out
    return _CACHE.get(_key(c, path), 0 if force else TTL_DIR, load)


def _jobs(c, dl, force=False):
    return _named(c, dl, force, "core/job$list", {"job_ids": []}, "job_id",
                  lambda r: {"code": _s(r.get("code")) or None, "state": _s(r.get("state")) or "A",
                             "group": _s(r.get("job_group_name")) or None})


def _schedules(c, dl, force=False):
    return _named(c, dl, force, "core/schedule$list", {"schedule_ids": []}, "schedule_id",
                  lambda r: {"code": _s(r.get("code")) or None, "state": _s(r.get("state")) or "A",
                             "kind": _s(r.get("kind")) or None})


def _locations(c, dl, force=False):
    return _named(c, dl, force, "core/location$list", {"location_ids": []}, "location_id",
                  lambda r: {"address": _s(r.get("address")) or None, "latlng": _s(r.get("latlng")) or None,
                             "code": _s(r.get("code")) or None, "state": _s(r.get("state")) or "A",
                             "employees": [_s(x) for x in (r.get("employee_ids") or []) if _s(x)],
                             "divisions": [_s(x.get("division_name")) for x in (r.get("divisions") or [])
                                           if isinstance(x, dict) and _s(x.get("division_name"))]})


def _time_kinds(c, dl, force=False):
    return _named(c, dl, force, "core/time_kind$list", {"time_kind_ids": []}, "time_kind_id",
                  lambda r: {"letter": _s(r.get("letter_code")) or None,
                             "digital": _s(r.get("digital_code")) or None})


def _cells(db: Session) -> dict[str, dict]:
    """Our cells by verifix code key — the bridge from Verifix to the platform.
    A cell is its CODE: the workshop name never leaves here."""
    out: dict[str, dict] = {}
    for cell in cell_lookup.by_verifix(db, with_leader=True, with_sup=True).values():
        k = verifix._code_key(cell.get("verifix_code"))
        if k and k not in out:
            out[k] = {"id": cell["id"], "code": cell["verifix_code"], "sup": cell.get("sup"),
                      "leader": cell.get("leader")}
    return out


def _node_cells(divs: dict, cells: dict) -> dict[str, dict]:
    """Verifix node id → our cell, for the nodes whose code names one."""
    return {did: cells[d["code"]] for did, d in divs.items() if d["code"] and d["code"] in cells}


# ── photos ────────────────────────────────────────────────────────────────────

_SHA = re.compile(r"^[A-Za-z0-9]{16,128}$")
_ALLOWED: "OrderedDict[str, None]" = OrderedDict()
_ALLOWED_MAX = 80_000
_THUMBS: "OrderedDict[tuple, bytes]" = OrderedDict()
_THUMBS_MAX = {PHOTO_SMALL: 1500, PHOTO_LARGE: 40}
_photo_lock = threading.Lock()
_downloads = threading.BoundedSemaphore(6)
_photo_http: dict[str, Any] = {"key": None, "client": None}


def _photo_client(c: dict) -> httpx.Client:
    """One pooled client for photo downloads: a page of fifty faces would
    otherwise open fifty TLS connections to Verifix. Rebuilt when the
    credential on the card changes."""
    import hashlib
    key = hashlib.sha256(f"{c['host']}|{c['filial_id']}|{c['login']}|{c['password']}".encode()).hexdigest()
    with _photo_lock:
        if _photo_http["key"] != key:
            old = _photo_http["client"]
            _photo_http.update(key=key, client=verifix.client(c))
            if old is not None:
                try:
                    old.close()
                except Exception:
                    pass
        return _photo_http["client"]


def _allow(*shas: Optional[str]) -> None:
    with _photo_lock:
        for sha in shas:
            if sha and _SHA.match(sha):
                _ALLOWED[sha] = None
                _ALLOWED.move_to_end(sha)
        while len(_ALLOWED) > _ALLOWED_MAX:
            _ALLOWED.popitem(last=False)


def photo(db: Session, sha: str, size: int) -> bytes:
    """A photo Verifix holds, resized to a square avatar (96) or a view (960).
    Only a hash this process has handed out as a photo is served."""
    from PIL import Image, ImageOps

    with _photo_lock:
        known = sha in _ALLOWED
    if not _SHA.match(sha or "") or not known:
        raise LookupError("unknown photo")
    size = PHOTO_SMALL if size <= 200 else PHOTO_LARGE
    with _photo_lock:
        hit = _THUMBS.get((sha, size))
        if hit is not None:
            _THUMBS.move_to_end((sha, size))
            return hit
    c = config(db)
    raw = None
    with _downloads:
        cl = _photo_client(c)
        # The photo door the docs name for a mark's photo, then the general file door.
        for path in ("/b/biruni/m:load_image", "/b/biruni/m:download_file_v2"):
            try:
                res = cl.get(f"https://{c['host']}{path}", params={"sha": sha},
                             headers={"Accept": "image/*,*/*;q=0.5"})
            except httpx.HTTPError:
                continue
            if res.status_code == 200 and res.content and len(res.content) < 20_000_000:
                raw = res.content
                break
    if raw is None:
        raise LookupError("not available")
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        # Not an image: whatever this hash names, it is not served as a photo.
        raise LookupError("not an image")
    if size == PHOTO_SMALL:
        img = ImageOps.fit(img, (size, size), Image.LANCZOS, centering=(0.5, 0.35))
    else:
        img.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82, optimize=True)
    out = buf.getvalue()
    with _photo_lock:
        _THUMBS[(sha, size)] = out
        while sum(1 for k in _THUMBS if k[1] == size) > _THUMBS_MAX[size]:
            for k in list(_THUMBS):
                if k[1] == size:
                    _THUMBS.pop(k)
                    break
    return out


# ── Tuzilma ───────────────────────────────────────────────────────────────────

def _filial(c: dict, dl: float, force: bool) -> Optional[dict]:
    def load():
        with verifix.client(c) as cl:
            data, _ = verifix.call(cl, "core/filial$info", {})
        rows = _as_rows(data)
        return scrub(rows[0]) if rows else None
    return _CACHE.get(_key(c, "filial"), 0 if force else TTL_DIR, load)[0]


def structure(db: Session, force: bool = False) -> dict:
    c = config(db)
    dl = _deadline()
    divs, t1 = _divisions(c, dl, force)
    emps, t2 = _employees(c, dl, force)
    cells = _cells(db)
    direct: Counter = Counter()
    lost = 0
    for e in emps.values():
        if e["status"] != "W":
            continue
        node = e["unit"] if e["unit"] in divs else (e["div"] if e["div"] in divs else None)
        if node:
            direct[node] += 1
        else:
            lost += 1
    nodes = [{**d, "people": direct.get(d["id"], 0),
              "cell": cells.get(d["code"]) if d["code"] else None} for d in divs.values()]
    theirs = {d["code"] for d in divs.values() if d["code"]}
    missing = sorted(cells[k]["code"] for k in set(cells) - theirs)
    groups, groups_err = _try(lambda: _CACHE.get(
        _key(c, "divgroups"), 0 if force else TTL_DIR,
        lambda: [{"id": _s(g.get("division_group_id")), "name": _s(g.get("name")),
                  "code": _s(g.get("code")) or None, "state": _s(g.get("state")) or "A"}
                 for g in _list(c, "core/division_group$list", {"division_group_ids": []}, dl)])[0])
    filial, filial_err = _try(lambda: _filial(c, dl, force))
    if filial:
        _allow(_s(filial.get("photo_sha")))
    return {
        "nodes": nodes,
        "summary": {
            "total": len(nodes), "active": sum(1 for n in nodes if n["state"] == "A"),
            "coded": sum(1 for n in nodes if n["code"]),
            "cells": len(cells), "cells_found": len(set(cells) & theirs),
            "cells_missing": missing[:40], "cells_missing_n": len(missing),
            "people": sum(direct.values()), "people_lost": lost,
            "unplaced_nodes": sum(1 for n in nodes if n["people"] and not n["cell"]),
        },
        "groups": groups, "groups_error": groups_err,
        "filial": filial, "filial_error": filial_err,
        "fetched_at": _iso(min(t1, t2)),
    }


# ── Xodimlar ──────────────────────────────────────────────────────────────────

def employees(db: Session, status: str = "W", force: bool = False) -> dict:
    c = config(db)
    dl = _deadline()
    emps, t1 = _employees(c, dl, force)
    divs, t2 = _divisions(c, dl, force)
    jobs, t3 = _jobs(c, dl, force)
    scheds, t4 = _schedules(c, dl, force)
    status = status if status in ("W", "D", "U", "all") else "W"
    rows = [e for e in emps.values() if status == "all" or e["status"] == status]
    _allow(*(e["photo"] for e in rows))
    return {
        "rows": rows,
        "counts": dict(Counter(e["status"] for e in emps.values())),
        "divisions": {k: d["name"] for k, d in divs.items()},
        "jobs": {k: j["name"] for k, j in jobs.items()},
        "schedules": {k: s["name"] for k, s in scheds.items()},
        "cells": _node_cells(divs, _cells(db)),
        "today": verifix_live.now_local().date().isoformat(),
        "fetched_at": _iso(min(t1, t2, t3, t4)),
    }


def person(db: Session, employee_id: str, force: bool = False) -> dict:
    """One person's card: everything Verifix keeps about them that this
    section may show, their last mark today (with its photo), and their last
    two weeks of attendance and marks."""
    if not employee_id.isdigit():
        raise LookupError("unknown employee")
    c = config(db)
    dl = _deadline()
    eid = int(employee_id)
    now = verifix_live.now_local()
    today = now.date()
    divs, _ = _divisions(c, dl, False)
    jobs, _ = _jobs(c, dl, False)
    scheds, _ = _schedules(c, dl, False)
    locs, _ = _locations(c, dl, False)

    def load_profile():
        with verifix.client(c) as cl:
            data, _ = verifix.call(cl, "core/employee$list",
                                   {"employee_ids": [eid], "statuses": [], "npins": []}, limit=5)
        rows = _as_rows(data)
        return rows[0] if rows else None

    raw, _ = _CACHE.get(_key(c, "person", eid), 0 if force else 120, load_profile)
    if not raw:
        raise LookupError("unknown employee")
    row = _emp(raw) or {}
    profile = scrub(raw)
    photos = [{"sha": _s(p.get("photo_sha")), "main": _s(p.get("is_main")) == "Y"}
              for p in (raw.get("identification_photos") or []) if isinstance(p, dict) and _s(p.get("photo_sha"))]
    _allow(row.get("photo"), *(p["sha"] for p in photos))

    def last_mark():
        with verifix.client(c) as cl:
            data, _ = verifix.call(cl, "core/track$search_last_track",
                                   {"employee_id": eid, "track_date": _dmy(today)})
        rows = _as_rows(data)
        if not rows:
            return None
        t = rows[0]
        at = _dt(t.get("track_datetime"))
        sha = _s(t.get("photo_sha")) or None
        _allow(sha)
        return {"id": _s(t.get("track_id")), "at": _iso(at), "type": _s(t.get("track_type")) or None,
                "loc": _s(t.get("location_id")) or None, "device": _s(t.get("device_id")) or None,
                "photo": sha}

    last, last_err = _try(last_mark)

    formula = verifix_live._formula(db)

    def days():
        first = today - timedelta(days=PERSON_DAYS - 1)
        body = {"period_begin_date": _dmy(first), "period_end_date": _dmy(today),
                "division_ids": [], "employee_ids": [eid]}
        with verifix.client(c) as cl:
            data, _ = verifix.call(cl, "core/timesheet$export", body, limit=verifix.LIMIT_TIMESHEET)
        out = []
        for r in _as_rows(data):
            for d in r.get("days") or []:
                day = _dt(f"{_s(d.get('date'))} 00:00:00")
                if not day:
                    continue
                rec = {"name": r.get("employee_name") or "", "job": r.get("job_name") or "",
                       "schedule": r.get("schedule_name") or "", "days": [d]}
                p = verifix_live._person(day.date(), now, rec, [], formula)
                out.append({"date": day.date().isoformat(), "kind": _s(d.get("day_kind")) or None,
                            "plan": _int(d.get("plan_time")), "status": p["status"],
                            "in": _iso(p["in"]), "out": _iso(p["out"]),
                            "begin": _iso(p["begin"]), "end": _iso(p["end"]),
                            "late": p["late"], "early_out": p["early_out"],
                            "hours": round(p["hours"], 2) if p["hours"] is not None else None,
                            "so_far": p["so_far"]})
        return sorted(out, key=lambda x: x["date"], reverse=True)

    ts, ts_err = _try(days)

    def marks():
        body = {"employee_ids": [eid],
                "begin_datetime": _fmt_dt(datetime.combine(today - timedelta(days=2), dtime(0))),
                "end_datetime": _fmt_dt(now)}
        out = []
        with verifix.client(c) as cl:
            for page in _pages(cl, "core/track$list", body, verifix.LIMIT_TRACKS, dl, cap=3):
                for t in page:
                    at = _dt(t.get("track_datetime"))
                    out.append({"id": _s(t.get("track_id")), "at": _iso(at),
                                "type": _s(t.get("track_type")) or None, "mark": _s(t.get("mark_type")) or None,
                                "loc": _s(t.get("location_id")) or None,
                                "by": _s(t.get("created_by_name")) or None})
        return sorted(out, key=lambda x: x["at"] or "", reverse=True)

    mk, mk_err = _try(marks)

    cells = _cells(db)
    node_cells = _node_cells(divs, cells)
    return {
        "row": row,
        "profile": profile,
        "photos": photos,
        "names": {
            "div": divs.get(row.get("div") or "", {}).get("name"),
            "unit": divs.get(row.get("unit") or "", {}).get("name"),
            "job": jobs.get(row.get("job") or "", {}).get("name"),
            "sched": scheds.get(row.get("sched") or "", {}).get("name"),
        },
        "cell": node_cells.get(row.get("unit") or "") or node_cells.get(row.get("div") or ""),
        "last": last, "last_error": last_err,
        "days": ts, "days_error": ts_err,
        "marks": mk, "marks_error": mk_err,
        "locations": {k: v["name"] for k, v in locs.items()},
        "today": today.isoformat(),
    }


# ── Lavozim va grafiklar ──────────────────────────────────────────────────────

def jobs(db: Session, force: bool = False) -> dict:
    c = config(db)
    dl = _deadline()
    js, t1 = _jobs(c, dl, force)
    sc, t2 = _schedules(c, dl, force)
    tk, t3 = _time_kinds(c, dl, force)
    emps, t4 = _employees(c, dl, force)
    by_job: Counter = Counter()
    by_sched: Counter = Counter()
    for e in emps.values():
        if e["status"] == "W":
            by_job[e["job"]] += 1
            by_sched[e["sched"]] += 1
    year = verifix_live.now_local().year

    def load_calendar():
        out = []
        for cal in _list(c, "core/calendar$list", {"calendar_ids": [], "year": year}, dl):
            out.append({
                "id": _s(cal.get("calendar_id")), "name": _s(cal.get("name")),
                "rest": [x for x in (cal.get("rest_days") or []) if _int(x)],
                "days": sorted(({"date": _d_iso(d.get("calendar_date")), "name": _s(d.get("name")) or None,
                                 "kind": _s(d.get("day_kind")) or None, "swapped": _d_iso(d.get("swapped_date"))}
                                for d in (cal.get("calendar_days") or []) if isinstance(d, dict)),
                               key=lambda x: x["date"] or ""),
            })
        return out

    cal, cal_err = _try(lambda: _CACHE.get(_key(c, "calendar", year), 0 if force else TTL_DIR,
                                           load_calendar)[0])
    formula = verifix_live._formula(db)
    hours = (verifix_parity.last_parity(db) or {}).get("hours") or {}
    return {
        "jobs": [{**j, "people": by_job.get(k, 0)} for k, j in js.items()],
        "schedules": [{**s, "people": by_sched.get(k, 0)} for k, s in sc.items()],
        "kinds": list(tk.values()),
        "worked_kinds": formula["kinds"] if formula else [],
        "worked_unit": hours.get("unit"),
        "calendar": cal, "calendar_error": cal_err, "year": year,
        "fetched_at": _iso(min(t1, t2, t3, t4)),
    }


def schedule_days(db: Session, schedule_id: str, year: Optional[int] = None) -> dict:
    if not schedule_id.isdigit():
        raise LookupError("unknown schedule")
    c = config(db)
    dl = _deadline()
    today = verifix_live.now_local().date()
    year = year or today.year

    def load():
        rows = _list(c, "core/schedule$list", {"schedule_ids": [int(schedule_id)], "year": year}, dl)
        return rows[0] if rows else None

    row, _ = _CACHE.get(_key(c, "schedule", schedule_id, year), TTL_DIR, load)
    if not row:
        raise LookupError("unknown schedule")
    days = []
    jan1 = date(year, 1, 1)
    for i, d in enumerate(row.get("schedule_days") or []):
        if not isinstance(d, dict):
            continue
        b, e = _dt(d.get("begin_time")), _dt(d.get("end_time"))
        day = b.date() if b else jan1 + timedelta(days=i)
        days.append({"date": day.isoformat(), "kind": _s(d.get("day_kind")) or None,
                     "begin": _iso(b), "end": _iso(e), "plan": _int(d.get("plan_time")),
                     "break": [_iso(_dt(d.get("break_begin_time"))), _iso(_dt(d.get("break_end_time")))]})
    counts = Counter(d["kind"] for d in days)
    lo, hi = today - timedelta(days=3), today + timedelta(days=24)
    return {"id": schedule_id, "year": year, "counts": dict(counts),
            "days": [d for d in days if lo.isoformat() <= d["date"] <= hi.isoformat()],
            "today": today.isoformat()}


# ── Davomat hisoboti ──────────────────────────────────────────────────────────

def _ttl_for(day: date) -> int:
    return TTL_TODAY if day >= verifix_live.now_local().date() - timedelta(days=1) else TTL_PAST


def timesheet(db: Session, day: date, force: bool = False) -> dict:
    """«Отчёт по посещениям» for one day, for everybody the report holds."""
    c = config(db)
    dl = _deadline()
    now = verifix_live.now_local()
    if day > now.date():
        day = now.date()
    emps, t1 = _employees(c, dl, False)
    divs, t2 = _divisions(c, dl, False)
    tk, _ = _time_kinds(c, dl, False)
    locs, _ = _locations(c, dl, False)

    def load():
        rows: dict[str, dict] = {}
        body = {"period_begin_date": _dmy(day), "period_end_date": _dmy(day),
                "division_ids": [], "employee_ids": []}
        with verifix.client(c) as cl:
            for page in _pages(cl, "core/timesheet$export", body, verifix.LIMIT_TIMESHEET, dl):
                for r in page:
                    eid = _s(r.get("employee_id"))
                    if not eid:
                        continue
                    rows[eid] = {"name": _s(r.get("employee_name")), "job": _s(r.get("job_name")),
                                 "schedule": _s(r.get("schedule_name")), "div": _s(r.get("division_id")),
                                 "days": [d for d in (r.get("days") or [])
                                          if isinstance(d, dict) and _d_iso(d.get("date")) == day.isoformat()]}
        return rows

    ts, t3 = _CACHE.get(_key(c, "ts", day.isoformat()), 0 if force else _ttl_for(day), load)
    formula = verifix_live._formula(db)
    hours = (verifix_parity.last_parity(db) or {}).get("hours") or {}
    out = []
    for eid, rec in ts.items():
        p = verifix_live._person(day, now, rec, [], formula)
        d = rec["days"][0] if rec["days"] else {}
        e = emps.get(eid) or {}
        out.append({
            "id": eid, "name": rec["name"] or e.get("name") or f"#{eid}",
            "job": rec["job"] or None, "sched": rec["schedule"] or None,
            "div": rec["div"] or e.get("div") or None, "unit": e.get("unit") or None,
            "photo": e.get("photo"),
            "status": p["status"], "in": _iso(p["in"]), "out": _iso(p["out"]),
            "begin": _iso(p["begin"]), "end": _iso(p["end"]),
            "late": p["late"], "early_out": p["early_out"], "early_in": p["early_in"],
            "hours": round(p["hours"], 2) if p["hours"] is not None else None, "so_far": p["so_far"],
            "kind": _s(d.get("day_kind")) or None, "plan": _int(d.get("plan_time")),
            "facts": {k: v for k, v in p["raw"]["facts"].items()},
            "in_loc": _s(d.get("input_location_id")) or None, "out_loc": _s(d.get("output_location_id")) or None,
            "marks_done": _int(d.get("done_marks")), "marks_planned": _int(d.get("planned_marks")),
        })
    _allow(*(r["photo"] for r in out))
    return {
        "day": day.isoformat(), "today": now.date().isoformat(), "now": _iso(now),
        "rows": out,
        "divisions": {k: d["name"] for k, d in divs.items()},
        "cells": _node_cells(divs, _cells(db)),
        "kinds": {k: {"name": v["name"], "letter": v["letter"]} for k, v in tk.items()},
        "locations": {k: v["name"] for k, v in locs.items()},
        "worked_kinds": formula["kinds"] if formula else [],
        "fact_unit": "min" if hours.get("unit") == "min" else "sec",
        "fetched_at": _iso(t3),
        "directory_at": _iso(min(t1, t2)),
    }


# ── Belgilar ──────────────────────────────────────────────────────────────────

def marks(db: Session, day: date, start: int, hours: int, force: bool = False) -> dict:
    """Every mark of one time window, plant-wide."""
    c = config(db)
    dl = _deadline()
    now = verifix_live.now_local()
    start = max(0, min(23, start))
    hours = max(1, min(24, hours))
    begin = datetime.combine(day, dtime(start))
    end = min(begin + timedelta(hours=hours), now)
    emps, t1 = _employees(c, dl, False)
    divs, _ = _divisions(c, dl, False)
    locs, _ = _locations(c, dl, False)

    def load():
        rows, partial = [], False
        if end <= begin:
            return rows, partial
        body = {"begin_datetime": _fmt_dt(begin), "end_datetime": _fmt_dt(end)}
        try:
            with verifix.client(c) as cl:
                for page in _pages(cl, "core/track$list", body, verifix.LIMIT_TRACKS, dl, cap=MARKS_PAGES):
                    rows.extend(page)
        except verifix.VerifixError as exc:
            if exc.code != "slow" or not rows:
                raise
            partial = True
        return rows, partial

    live = end > now - timedelta(minutes=10)
    (raw, partial), t2 = _CACHE.get(_key(c, "marks", _fmt_dt(begin), _fmt_dt(end) if not live else "live"),
                                    0 if force else (45 if live else TTL_PAST), load)
    out = []
    for t in raw:
        eid = _s(t.get("employee_id"))
        e = emps.get(eid) or {}
        created = _s(t.get("created_by"))
        modified = _s(t.get("modified_by"))
        out.append({
            "id": _s(t.get("track_id")), "at": _iso(_dt(t.get("track_datetime"))),
            "emp": eid, "name": e.get("name") or (f"#{eid}" if eid else None),
            "unit": e.get("unit") or None, "div": _s(t.get("division_id")) or e.get("div") or None,
            "photo": e.get("photo"),
            "type": _s(t.get("track_type")) or None, "mark": _s(t.get("mark_type")) or None,
            "loc": _s(t.get("location_id")) or None,
            "by": _s(t.get("created_by_name")) or None,
            "edited_by": (_s(t.get("modified_by_name")) or None) if modified and modified != created else None,
        })
    out.sort(key=lambda r: r["at"] or "", reverse=True)
    _allow(*(r["photo"] for r in out))
    return {
        "day": day.isoformat(), "start": start, "hours": hours,
        "begin": _iso(begin), "end": _iso(end), "now": _iso(now), "partial": partial,
        "rows": out,
        "divisions": {k: d["name"] for k, d in divs.items()},
        "cells": _node_cells(divs, _cells(db)),
        "locations": {k: v["name"] for k, v in locs.items()},
        "fetched_at": _iso(t2), "directory_at": _iso(t1),
    }


def track_detail(db: Session, track_id: str, employee_id: Optional[str], day: Optional[date]) -> dict:
    """One mark as Verifix describes it, and the person's last mark of that
    day — the one mark whose PHOTO the API hands out."""
    if not track_id.isdigit():
        raise LookupError("unknown mark")
    c = config(db)

    def info():
        with verifix.client(c) as cl:
            data, _ = verifix.call(cl, "core/track$track_info", {"track_id": int(track_id)})
        rows = _as_rows(data)
        return scrub(rows[0]) if rows else None

    inf, inf_err = _try(info)
    last, last_err = None, None
    if employee_id and employee_id.isdigit() and day:
        def last_mark():
            with verifix.client(c) as cl:
                data, _ = verifix.call(cl, "core/track$search_last_track",
                                       {"employee_id": int(employee_id), "track_date": _dmy(day)})
            rows = _as_rows(data)
            if not rows:
                return None
            t = rows[0]
            sha = _s(t.get("photo_sha")) or None
            _allow(sha)
            return {"id": _s(t.get("track_id")), "at": _iso(_dt(t.get("track_datetime"))),
                    "type": _s(t.get("track_type")) or None, "photo": sha,
                    "device": _s(t.get("device_id")) or None}
        last, last_err = _try(last_mark)
    return {"info": inf, "info_error": inf_err, "last": last, "last_error": last_err}


# ── Hozir ishda ───────────────────────────────────────────────────────────────

def locations(db: Session, force: bool = False) -> dict:
    c = config(db)
    dl = _deadline()
    locs, t1 = _locations(c, dl, force)
    emps, _ = _employees(c, dl, False)
    rows = []
    for k, loc in locs.items():
        working = sum(1 for eid in loc["employees"] if (emps.get(eid) or {}).get("status") == "W")
        rows.append({"id": k, "name": loc["name"], "address": loc["address"], "latlng": loc["latlng"],
                     "code": loc["code"], "state": loc["state"], "assigned": len(loc["employees"]),
                     "working": working, "divisions": loc["divisions"][:12],
                     "divisions_n": len(loc["divisions"])})
    rows.sort(key=lambda r: (-r["working"], r["name"]))
    return {"rows": rows, "default_id": rows[0]["id"] if rows else None, "fetched_at": _iso(t1)}


def onsite(db: Session, location_id: str, day: date, force: bool = False) -> dict:
    """«Работающие сотрудники в локации» — everybody with an arrival and no
    departure at this location on this day. On a past day that is the people
    who never checked out."""
    if not location_id.isdigit():
        raise LookupError("unknown location")
    c = config(db)
    dl = _deadline()
    now = verifix_live.now_local()
    emps, t1 = _employees(c, dl, False)
    divs, _ = _divisions(c, dl, False)
    locs, _ = _locations(c, dl, False)

    def load():
        out = []
        body = {"location_id": int(location_id), "report_date": _dmy(day)}
        with verifix.client(c) as cl:
            for page in _pages(cl, "rep/currently_working_employees$list", body, None, dl, cap=20):
                out.extend(page)
        return out

    raw, t2 = _CACHE.get(_key(c, "onsite", location_id, day.isoformat()),
                         0 if force else (45 if day >= now.date() else TTL_PAST), load)
    rows = []
    for r in raw:
        eid = _s(r.get("employee_id"))
        e = emps.get(eid) or {}
        last = r.get("last_track") if isinstance(r.get("last_track"), dict) else {}
        at = _dt(last.get("track_datetime"))
        sha = _s(last.get("photo_sha")) or None
        rows.append({
            "emp": eid, "name": _s(r.get("employee_name")) or e.get("name") or f"#{eid}",
            "div_name": _s(r.get("division_name")) or None, "job_name": _s(r.get("job_name")) or None,
            "unit": e.get("unit") or None, "div": _s(r.get("division_id")) or e.get("div") or None,
            "at": _iso(at), "type": _s(last.get("track_type")) or None,
            "device": _s(last.get("device_id")) or None, "track": _s(last.get("track_id")) or None,
            "photo": sha, "face": e.get("photo"),
            "minutes": int((now - at).total_seconds() // 60) if at and day >= now.date() else None,
        })
    rows.sort(key=lambda x: x["at"] or "", reverse=True)
    _allow(*(r["photo"] for r in rows), *(r["face"] for r in rows))
    loc = locs.get(location_id)
    return {
        "location": {"id": location_id, "name": loc["name"], "address": loc["address"],
                     "latlng": loc["latlng"], "assigned": len(loc["employees"])} if loc else None,
        "day": day.isoformat(), "today": now.date().isoformat(), "now": _iso(now),
        "rows": rows,
        "divisions": {k: d["name"] for k, d in divs.items()},
        "cells": _node_cells(divs, _cells(db)),
        "fetched_at": _iso(t2), "directory_at": _iso(t1),
    }
