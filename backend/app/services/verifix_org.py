"""Verifix's org structure, read and classified — THE permanent home of the
rules the 4–8 Oct one-shots carried (2026-10-12, Verifix live sync).

Two halves:

* **the read** — `read` / `refresh` / `stored`: every division, every job and
  every employee of EVERY status (W working, D dismissed, U taken on, not
  started), in `verifix_explore`'s shapes, stored as `live_verifix_reads` key
  "org" and re-read by the sync's own job every `ORG_TTL_S`. It is a SECOND
  key beside the live attendance's "dir" (working people only) on purpose: the
  live /staff reads iterate "dir" every minute and inside requests, and three
  times the people there would put dismissed workers on today's lists. The
  sync, which needs every status, reads "org" and nothing else does.
* **the rules** — lifted, unchanged, from the one-shots so those can be
  deleted: which subdivision is a cell (`classify`, `cell_nodes`, name-coded
  «4711 Зона отправки» included), where a person stands (`people`), the
  brigadir over a subdivision (`brigadirs_over`), the seat (`seats`), the
  strict name match (`match`, `SURE_HOW`), «two spellings of one person»
  (`same_person`), the cell's name from Verifix's (`vx_name`, `renamed`) and a
  Verifix name the way the register spells a person (`profile_name`).

Nothing here writes a register row; `services/verifix_sync.py` does.
"""
from __future__ import annotations

import difflib
import logging
import re
import threading
import time as _time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.services import supervisor_kind, verifix
from app.services.latin_code import latin_code
from app.services.name_map import _name_tokens, _pair_score
from app.translit import transliterate

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
ORG_KEY = "org"
ORG_TTL_S = 600              # the sync's job re-reads the org this often
READ_BUDGET_S = 300.0        # a background read: ~18 employee pages + divisions + jobs
# A Verifix answer this thin is a cut answer (a role that changed, a server
# answering half): nothing is applied on it.
MIN_DIVISIONS = 100
MIN_EMPLOYEES = 1000
MIN_JOBS = 10                # an empty job list would flip every person's kind
SHRINK_MAX = 0.10            # a read this much smaller than the last is refused
ARCHIVED_BY = "Verifix (avtomatik)"
SURE_HOW = ("full", "two", "pin")
SURNAME_MIN = 0.75
PATRONYMIC_MIN = 0.6
BRIGADIR_DEPTH = 4

_org_lock = threading.Lock()


# ── the read ──────────────────────────────────────────────────────────────────

def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _d_iso(raw) -> Optional[str]:
    s = _s(raw)
    if not s:
        return None
    m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)", s)
    return m.group(0) if m else None


def _div(d: dict) -> Optional[dict]:
    did = _s(d.get("division_id"))
    if not did:
        return None
    raw = _s(d.get("code"))
    return {"id": did, "name": _s(d.get("name")) or f"#{did}",
            "parent": _s(d.get("parent_id")) or None,
            "code": verifix._code_key(raw) if raw else None, "raw_code": raw or None,
            "state": _s(d.get("state")) or "A", "opened": _d_iso(d.get("opened_date")),
            "closed": _d_iso(d.get("closed_date"))}


def _emp(e: dict) -> Optional[dict]:
    eid = _s(e.get("employee_id"))
    if not eid:
        return None
    photos = [_s(p.get("photo_sha")) for p in (e.get("identification_photos") or [])
              if isinstance(p, dict) and _s(p.get("photo_sha"))]
    main_ = next((_s(p.get("photo_sha")) for p in (e.get("identification_photos") or [])
                  if isinstance(p, dict) and _s(p.get("is_main")) == "Y" and _s(p.get("photo_sha"))),
                 "")
    photo = _s(e.get("photo_sha")) or main_ or (photos[0] if photos else "")
    name = " ".join(_s(e.get(k)) for k in ("last_name", "first_name", "middle_name") if _s(e.get(k)))
    return {"id": eid, "name": name or f"#{eid}", "status": _s(e.get("status")) or "W",
            "hired": _d_iso(e.get("hiring_date")), "dismissed": _d_iso(e.get("dismissal_date")),
            "job": _s(e.get("job_id")), "div": _s(e.get("division_id")),
            "unit": _s(e.get("org_unit_id")), "photo": photo or None}


def read(cfg: dict) -> dict:
    """Divisions, jobs and EVERY employee, read side by side (each list is a
    chain of cursor pages). A cut read raises — never half an answer."""
    from app.services.verifix_live import _side_by_side
    deadline = _time.monotonic() + READ_BUDGET_S

    def pages(cl, path, body):
        # Every page until Verifix's own cursor says the list is over: an empty
        # page with a next cursor is not the end (each_page raises at its page
        # cap rather than hand back half a list).
        for page in verifix.each_page(cl, path, body, limit=verifix.LIMIT_LIST, deadline=deadline):
            yield page or []

    def read_divs(cl):
        out = {}
        for page in pages(cl, "core/division$list", {"division_ids": []}):
            for d in page:
                r = _div(d)
                if r:
                    out[r["id"]] = r
        return out

    def read_jobs(cl):
        out = {}
        for page in pages(cl, "core/job$list", {"job_ids": []}):
            for j in page:
                jid = _s(j.get("job_id"))
                if jid:
                    out[jid] = {"id": jid, "name": _s(j.get("name")) or f"#{jid}"}
        return out

    def read_emps(cl):
        out = {}
        for page in pages(cl, "core/employee$list",
                          {"employee_ids": [], "statuses": [], "npins": []}):
            for e in page:
                r = _emp(e)
                if r:
                    out[r["id"]] = r
        return out

    divs, jobs, emps = _side_by_side(cfg, read_divs, read_jobs, read_emps)
    return {"divs": divs, "jobs": jobs, "emps": emps}


# The stored org is a few MB of JSON (every employee of every status): it is
# decoded once per READ, not once per request — the admin page polls it, the
# pair picker searches it per keystroke, the manager pool reads it per open.
# Keyed by `read_at`, which every successful read moves. READ-ONLY to callers.
_stored_lock = threading.Lock()
_stored: dict = {"at": None, "data": None, "toks": None}


def stored(db: Session) -> tuple[Optional[dict], Optional[datetime]]:
    from app.models import LiveVerifixRead
    at = (db.query(LiveVerifixRead.read_at)
          .filter(LiveVerifixRead.key == ORG_KEY).scalar())
    with _stored_lock:
        if at is not None and _stored["at"] == at and _stored["data"] is not None:
            return _stored["data"], at
    row = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == ORG_KEY).first()
    if not row or not row.data:
        return None, None
    with _stored_lock:
        _stored.update(at=row.read_at, data=row.data, toks=None)
    return row.data, row.read_at


def emp_tokens(org: dict, at) -> dict:
    """{employee id: folded name tokens} of the stored org — built once per read."""
    with _stored_lock:
        if _stored["at"] == at and _stored["toks"] is not None and _stored["data"] is org:
            return _stored["toks"]
    toks = {eid: _name_tokens(e.get("name") or "") for eid, e in (org.get("emps") or {}).items()}
    with _stored_lock:
        if _stored["at"] == at and _stored["data"] is org:
            _stored["toks"] = toks
    return toks


def guard(org: Optional[dict]) -> Optional[str]:
    """Why this answer is too thin to act on, or None."""
    if not org:
        return "no_read"
    if len(org.get("divs") or {}) < MIN_DIVISIONS:
        return "divisions"
    if len(org.get("emps") or {}) < MIN_EMPLOYEES:
        return "employees"
    if len(org.get("jobs") or {}) < MIN_JOBS:
        return "jobs"
    return None


def refresh(db: Session, max_age: float = ORG_TTL_S,
            force: bool = False) -> tuple[Optional[dict], Optional[datetime], bool]:
    """(org, read_at, fresh) — the stored org, read from Verifix again when
    older than `max_age` (or `force`). A failed read keeps the stored one and
    records the failure. One read at a time per process; the caller's session
    is committed / rolled back here (no transaction held across Verifix)."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models import LiveVerifixRead
    org, at = stored(db)
    # A minute of slack: the job fires every ORG_TTL_S, and a read a hair
    # younger than the TTL would otherwise wait a whole second interval.
    if org and at and not force and \
            (datetime.now(timezone.utc) - at).total_seconds() < max(60.0, max_age - 60.0):
        return org, at, False
    cfg = verifix.config(db, with_password=True)
    if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
        return org, at, False
    if not _org_lock.acquire(blocking=False):
        return org, at, False
    try:
        db.rollback()
        t0 = _time.monotonic()
        try:
            data = read(cfg)
            # Every list is a chain of pages and one that ends early (an empty
            # page handed back mid-list) does not raise — a list much shorter
            # than the last one is refused like a failed read.
            if org:
                for part in ("emps", "divs"):
                    was, now_n = len(org.get(part) or {}), len(data.get(part) or {})
                    if was and now_n < was * (1 - SHRINK_MAX):
                        raise RuntimeError(f"shrunk: {part} {was} → {now_n}")
        except Exception as exc:  # noqa: BLE001 — recorded, the stored read serves
            db.rollback()
            db.execute(pg_insert(LiveVerifixRead).values(key=ORG_KEY, data={})
                       .on_conflict_do_nothing(index_elements=["key"]))
            row = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == ORG_KEY).with_for_update().first()
            row.error = (f"{getattr(exc, 'code', '')}: {getattr(exc, 'message', '') or exc}")[:300]
            row.error_at = datetime.now(timezone.utc)
            db.commit()
            log.warning("verifix sync: the org read failed (%s)", row.error)
            return org, at, False
        db.execute(pg_insert(LiveVerifixRead).values(key=ORG_KEY, data={})
                   .on_conflict_do_nothing(index_elements=["key"]))
        row = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == ORG_KEY).with_for_update().first()
        row.data, row.read_at = data, datetime.now(timezone.utc)
        row.ms, row.error, row.error_at = int((_time.monotonic() - t0) * 1000), None, None
        db.commit()
        return data, row.read_at, True
    finally:
        _org_lock.release()


# ── codes and names ───────────────────────────────────────────────────────────

_NAME_CODE = re.compile(r"^\s*(\d{4})(?!\d)")
_WS = re.compile(r"\s+")
_LEAD = re.compile(r"^(\S+)\s+(.+)$")
_FOUR = re.compile(r"\d{4}")
_NAMELESS = re.compile(r"#?\d+")
_TWIN = str.maketrans({"А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
                       "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "а": "a", "е": "e",
                       "о": "o", "р": "p", "с": "c", "х": "x", "у": "y"})
_APOS = str.maketrans({"’": "'", "‘": "'", "ʻ": "'", "ʼ": "'", "`": "'"})
_LAT = re.compile(r"[A-Za-z]")
_CYR = re.compile(r"[А-Яа-яЁёЎўҚқҒғҲҳ]")


def code_key(code) -> Optional[str]:
    """THE comparison key of a code, ours or Verifix's: Latin, '0028' = '28'."""
    s = latin_code(str(code or "").strip()) or ""
    return verifix._code_key(s) if s else None


def vx_name(raw: Optional[str], code: str) -> Optional[str]:
    """Verifix's name without the code in front: «0811 Горячий пирож» →
    «Горячий пирож»; a leading four-digit number goes too (A0061 is «0611
    Обработка яиц»). A name that is nothing but a number is no name."""
    s = _WS.sub(" ", raw or "").strip()
    m = _LEAD.match(s)
    if m and (m.group(1).upper() == (code or "").upper() or _FOUR.fullmatch(m.group(1))):
        s = m.group(2).strip()
    if not s or s.upper() == (code or "").upper() or _NAMELESS.fullmatch(s):
        return None
    return s


def cell_vfx_name(cell) -> Optional[str]:
    """The name Verifix gives a TIED cell, its code in front left out — what
    the live sync keeps on the RU name (`renamed`). None for an untied cell
    and for a subdivision Verifix names with a bare number."""
    if not getattr(cell, "vfx_division_id", None):
        return None
    return vx_name((cell.vfx_meta or {}).get("name"), cell.verifix_code)


def ru_differs(cell, v: str) -> bool:
    """The cell's RU name is not Verifix's `v` — from 2026-10-19 the names
    FOLLOW Verifix (the operator: «sync the cell names also»), not only when
    Verifix's own spelling changes, so a name that differs is pulled."""
    return _strip(cell.name_workshop_ru) != v


def _strip(v) -> str:
    return (v or "").strip()


def names_of(cell) -> dict:
    return {"ru": cell.name_workshop_ru, "uz_cyrl": cell.name_workshop_uz_cyrl,
            "uz": cell.name_workshop_uz, "en": cell.name_workshop_en}


def renamed(cell, v: str) -> Optional[dict]:
    """The four name columns once the cell carries Verifix's name `v`: ru takes
    it, a non-empty uz_cyrl takes it, a Latin uz / en that translated the old
    name is cleared. None when every reader already sees exactly `v`."""
    before = names_of(cell)
    after = {
        "ru": v,
        "uz_cyrl": v if _strip(before["uz_cyrl"]) else before["uz_cyrl"],
        "uz": None if _strip(before["uz"]) and _strip(before["uz"]) != v else before["uz"],
        "en": None if _strip(before["en"]) and _strip(before["en"]) != v else before["en"],
    }
    return after if after != before else None


def profile_name(raw: str) -> str:
    """Verifix's «QANOATOV DAVRONBEK SHERMAMAT O'G'LI» the way the register
    spells a person: Latin, Title Case — «Qanoatov Davronbek Shermamat O'g'li»."""
    s = " ".join((raw or "").split()).translate(_APOS)
    if len(_LAT.findall(s)) >= len(_CYR.findall(s)):
        s = s.translate(_TWIN)
    else:
        s = transliterate(s, "uz")
    return " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-"))
                    for w in s.split(" "))


_LEADER_RE = re.compile(r"лидер|lider|leader", re.I)
_NOT_LEADER_RE = re.compile(
    r"помощ|ассист|замест|\bзам\b|\bи\.?\s*о\b|yordamchi|o['’ʻ‘`]?rinbosar|"
    r"assistant|deputy|acting", re.I)


def is_leader_job(job: Optional[str]) -> bool:
    j = job or ""
    return bool(_LEADER_RE.search(j)) and not _NOT_LEADER_RE.search(j)


def is_supervisor_job(job: Optional[str]) -> bool:
    return supervisor_kind.is_supervisor_job(job)


def same_person(a: str, b: str) -> bool:
    """Two spellings of one person (either word order) — a tie whose Verifix
    name stops passing this is HELD, never followed."""
    x, y = _name_tokens(a or ""), _name_tokens(b or "")
    if len(x) < 2 or len(y) < 2:
        return False
    return _pair_score(x, y) > 0 or _pair_score([x[1], x[0]] + x[2:], y) > 0


def sure(how: Optional[str]) -> bool:
    return bool(how) and how.split("+")[0] in SURE_HOW


def job_name(org: dict, job_id: Optional[str]) -> str:
    return ((org.get("jobs") or {}).get(job_id or "") or {}).get("name") or ""


# ── which subdivisions are cells ──────────────────────────────────────────────

def classify(divs: dict, emps: dict) -> tuple[dict, list, list]:
    """(code → the one coded cell node, coded departments, codes on several open
    subdivisions). A department is anybody's `division_id`, any status."""
    dept_of = Counter(e["div"] for e in emps.values() if e.get("div"))
    workers = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W")
    nodes: dict = defaultdict(list)
    depts: list = []
    for d in divs.values():
        raw = latin_code(_strip(d.get("raw_code")))
        if not raw:
            continue
        parent = divs.get(d.get("parent") or "") or {}
        node = {"id": d["id"], "code": raw, "name": d.get("name") or "",
                "open": (d.get("state") or "A") == "A", "parent": d.get("parent"),
                "parent_name": parent.get("name") or "", "closed": d.get("closed"),
                "workers": workers.get(d["id"], 0)}
        if dept_of.get(d["id"]):
            depts.append({**node, "people": dept_of[d["id"]]})
        else:
            nodes[raw.upper()].append(node)
    cells: dict = {}
    dups: list = []
    for code, ns in nodes.items():
        if len(ns) == 1:
            cells[code] = ns[0]
            continue
        open_ = [n for n in ns if n["open"]]
        if len(open_) <= 1:
            cells[code] = open_[0] if open_ else ns[0]
            continue
        dups.append({"code": ns[0]["code"], "names": [n["name"] for n in open_]})
    return cells, depts, dups


def cell_nodes(divs: dict, emps: dict, jobs: dict) -> dict:
    """Every Verifix cell, coded or name-coded, keyed by `code_key`, and every
    subdivision that is not one — with why (the 4–5 Oct rules, unchanged)."""
    coded, depts, dups = classify(divs, emps)
    dept_of = Counter(e["div"] for e in emps.values() if e.get("div"))
    working = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W")
    leaders = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W"
                      and is_leader_job((jobs.get(e.get("job") or "") or {}).get("name")))
    children: dict = defaultdict(list)
    for d in divs.values():
        if d.get("parent"):
            children[d["parent"]].append(d["id"])

    def node(d: dict, code: str, src: str) -> dict:
        parent = divs.get(d.get("parent") or "") or {}
        return {"id": d["id"], "code": code, "key": code_key(code), "src": src,
                "name": d.get("name") or "", "open": (d.get("state") or "A") == "A",
                "parent": d.get("parent"), "parent_name": parent.get("name") or "",
                "closed": d.get("closed"), "workers": working.get(d["id"], 0)}

    nodes: dict = {}
    unsure: dict = {}
    for n in coded.values():
        n = node(divs[n["id"]], n["code"], "code")
        if n["key"] in nodes:
            dups.append({"code": n["code"], "names": [nodes[n["key"]]["name"], n["name"]]})
        nodes.setdefault(n["key"], n)
    dup_keys = {code_key(d["code"]) for d in dups}
    for d in divs.values():
        if d.get("raw_code") and code_key(d["raw_code"]) in dup_keys:
            unsure[d["id"]] = "dup"
    for k in dup_keys:
        nodes.pop(k, None)
    named_like = {}
    for n in nodes.values():
        m = _NAME_CODE.match(n["name"])
        if m:
            named_like[m.group(1)] = n["code"]

    skipped: list = []
    cands: dict = defaultdict(list)
    for d in divs.values():
        if d.get("raw_code"):
            continue
        m = _NAME_CODE.match(d.get("name") or "")
        if not m:
            continue
        n = node(d, m.group(1), "name")
        if dept_of.get(d["id"]):
            skipped.append({**n, "why": "department"})
            continue
        cands[n["code"]].append(n)
    cell_ids = {n["id"] for n in nodes.values()} | {n["id"] for ns in cands.values() for n in ns}
    for code, ns in sorted(cands.items()):
        keep = []
        for n in ns:
            if any(ch in cell_ids for ch in children.get(n["id"], [])):
                skipped.append({**n, "why": "workshop"})
            else:
                keep.append(n)
        if not keep:
            continue
        k = code_key(code)
        if k in nodes or k in dup_keys:
            skipped += [{**n, "why": "code_taken", "other": (nodes.get(k) or {}).get("code") or code}
                        for n in keep]
            continue
        if code in named_like:
            skipped += [{**n, "why": "named_like", "other": named_like[code]} for n in keep]
            continue
        open_ = [n for n in keep if n["open"]]
        pick = (keep[0] if len(keep) == 1 else open_[0] if len(open_) == 1
                else keep[0] if not open_ else None)
        if pick is None:
            dups.append({"code": code, "names": [n["name"] for n in open_]})
            dup_keys.add(k)
            unsure.update({n["id"]: "dup" for n in keep})
            continue
        nodes[k] = pick
        unsure.update({n["id"]: "twin" for n in keep if n is not pick})
    for s in skipped:
        unsure[s["id"]] = s["why"]
    node_by_id = {n["id"]: n for n in nodes.values()}
    return {"nodes": nodes, "by_id": node_by_id, "unsure": unsure, "skipped": skipped,
            "dups": dups, "dup_keys": dup_keys, "depts": depts,
            "dept_ids": set(dept_of), "leaders_in": leaders}


def people(divs: dict, emps: dict, jobs: dict, cn: dict) -> list[dict]:
    """Every Verifix employee, any status, placed in a cell by the rule above."""
    out = []
    for e in emps.values():
        uid = e.get("unit") or ""
        d = divs.get(uid) or {}
        n = cn["by_id"].get(uid)
        if n:
            where, cell, cell_raw = "cell", n["key"], n["code"]
        elif not uid:
            where, cell, cell_raw = "none", None, None
        elif uid in cn["dept_ids"]:
            where, cell, cell_raw = "dept", None, d.get("raw_code")
        elif uid in cn["unsure"]:
            where, cell, cell_raw = "unsure", None, d.get("raw_code")
        else:
            where, cell, cell_raw = "codeless", None, None
        toks = _name_tokens(e.get("name") or "")
        out.append({
            "id": e["id"], "name": e.get("name") or "", "status": e.get("status") or "W",
            "job": (jobs.get(e.get("job") or "") or {}).get("name") or "",
            "unit_id": uid, "unit_name": d.get("name") or "", "where": where,
            "node": n["id"] if n else None, "cell": cell, "cell_raw": cell_raw,
            "dismissed": e.get("dismissed"), "hired": e.get("hired"), "photo": e.get("photo"),
            "toks": toks, "full": " ".join(toks), "two": " ".join(toks[:2]),
        })
    return out


def seats(rows: list[dict]) -> dict:
    """division id → the WORKING people with a leader's job whose org unit is
    that cell (the 8 Oct seat rule). One = the seat; two or more = none until
    somebody says which."""
    out: dict = defaultdict(list)
    for p in rows:
        if p["status"] == "W" and p["where"] == "cell" and is_leader_job(p["job"]):
            out[p["node"]].append(p)
    return out


def brigadirs_over(divs: dict, emps: dict, jobs: dict, units_by_vfx: dict):
    """over(division id) → the Verifix brigadir(s) standing nearest above it
    (itself and up to BRIGADIR_DEPTH ancestors), each with `unit` = the units
    here tied to that person (a tuple of ids)."""
    by_unit: dict = defaultdict(list)
    for e in emps.values():
        if ((e.get("status") or "W") == "W" and e.get("unit")
                and is_supervisor_job((jobs.get(e.get("job") or "") or {}).get("name"))):
            by_unit[e["unit"]].append({"id": e["id"], "name": e.get("name") or "",
                                       "unit": tuple(units_by_vfx.get(e["id"]) or ())})
    cache: dict = {}

    def over(nid: Optional[str]) -> list:
        if not nid:
            return []
        if nid not in cache:
            cur, out = nid, []
            for _ in range(BRIGADIR_DEPTH + 1):
                if not cur:
                    break
                if by_unit.get(cur):
                    out = by_unit[cur]
                    break
                cur = (divs.get(cur) or {}).get("parent")
            cache[nid] = out
        return cache[nid]
    return over


# ── the strict name match ─────────────────────────────────────────────────────

def index(rows: list[dict]) -> tuple[dict, dict]:
    full: dict = defaultdict(list)
    two: dict = defaultdict(list)
    for r in rows:
        if len(r["toks"]) >= 2:
            full[r["full"]].append(r)
            two[r["two"]].append(r)
    return full, two


def _narrow(cands: list, own: set, unit: set, field: str = "cell"):
    if len(cands) == 1:
        return cands[0], None
    for pool, by in ((own, "cell"), (unit, "unit")):
        hits = [c for c in cands if c.get(field) and c[field] in pool]
        if len(hits) == 1:
            return hits[0], by
    return None, None


def _patronymic_clash(a: list, b: list) -> bool:
    if len(a) < 3 or len(b) < 3:
        return False
    return difflib.SequenceMatcher(None, a[2], b[2]).ratio() < PATRONYMIC_MIN


def _near(toks: list, own: set, working_rows: list) -> Optional[dict]:
    if not own:
        return None
    hits = [x for x in working_rows
            if x["cell"] in own and len(x["toks"]) >= 2 and x["toks"][1] == toks[1]
            and not _patronymic_clash(toks, x["toks"])
            and difflib.SequenceMatcher(None, toks[0], x["toks"][0]).ratio() >= SURNAME_MIN]
    return hits[0] if len(hits) == 1 else None


def match(toks: list, own: set, unit: set, working: tuple, gone: tuple,
          working_rows: list) -> dict:
    """The strict match (`leader_verifix_check._match`, unchanged but for the
    pins, which are rows in `verifix_ties` now): full name → surname + first
    name with no clashing patronymic → narrowed by the profile's own cells,
    then its unit's → first-name-first swapped → a surname-only typo in the
    profile's own cell. {"emp", "how"} or {"reason", "cands"}."""
    if len(toks) < 2:
        return {"reason": "short_name"}
    full, two = " ".join(toks), " ".join(toks[:2])
    cands = working[0].get(full) or []
    if cands:
        hit, by = _narrow(cands, own, unit)
        if hit:
            return {"emp": hit, "how": "full" + (f"+{by}" if by else "")}
        return {"reason": "ambiguous", "cands": cands}
    cands = [c for c in (working[1].get(two) or []) if not _patronymic_clash(toks, c["toks"])]
    if cands:
        hit, by = _narrow(cands, own, unit)
        if hit:
            return {"emp": hit, "how": "two" + (f"+{by}" if by else "")}
        return {"reason": "ambiguous", "cands": cands}
    clash = working[1].get(two) or []
    if clash:
        return {"reason": "namesake", "cands": clash}
    swapped = working[1].get(f"{toks[1]} {toks[0]}") or []
    if len(swapped) == 1:
        return {"emp": swapped[0], "how": "swap"}
    near = _near(toks, own, working_rows)
    if near:
        return {"emp": near, "how": "near"}
    cands = (gone[0].get(full) or []) or [c for c in (gone[1].get(two) or [])
                                          if not _patronymic_clash(toks, c["toks"])]
    if cands:
        return {"reason": "not_working", "cands": cands}
    return {"reason": "not_found"}


def two_keys(toks: list) -> set:
    if len(toks) < 2:
        return set()
    return {f"{toks[0]} {toks[1]}", f"{toks[1]} {toks[0]}"}


def similar(a: list, b: list) -> bool:
    """Same first name and a surname at least SURNAME_MIN alike, either order."""
    if len(a) < 2 or len(b) < 2:
        return False
    for sur, first in ((a[0], a[1]), (a[1], a[0])):
        if first == b[1] and difflib.SequenceMatcher(None, sur, b[0]).ratio() >= SURNAME_MIN:
            return True
    return False


def who(p: dict) -> dict:
    """What the sync stores and prints of a Verifix person — never more."""
    return {"id": p["id"], "name": p["name"], "job": p.get("job") or None,
            "status": p.get("status"), "cell": p.get("cell_raw"),
            "unit_name": p.get("unit_name") or None, "dismissed": p.get("dismissed")}
