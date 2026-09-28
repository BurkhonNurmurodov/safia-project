"""One-off: what the NEW ARC app's API (page /arc-legacy) sends today, and
whether an Uchtepa ticket can be tied to a production cell.

The operator, 2026-09-28: the API this repo calls «old»/«legacy»
(api.dashboard.service.safiabakery.uz, login + JWT) belongs to IT's NEW request
app, and the internal API /arc reads belongs to the OLD one. The factory kept
filing in the old app until ~25 Sep and then moved to the new app whole — so
the new app's API is where factory tickets land now, and it may carry
attributes it did not carry in August, when `normalize_item` was written off
it. The old app named the cell at the end of its division («… 0028»,
`arc_cells`); the question is whether the new one names it anywhere.

Production is not readable from the machine that wrote this, so the answer is
DMed from the server: a short text plus a JSON with the detail. It READS — the
stored payloads (`arc_legacy_requests.raw`, the whole item, rewritten by every
sync) and a handful of GETs against the API with the sync's own login — and
writes nothing but its flag.

Temporary: delete this module, `startup.report_arc_new_app_attrs` /
`_arc_attrs_job` and the call in BOTH entrypoints once it has been sent.
"""
from __future__ import annotations

import io
import json
import logging
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Optional

import httpx
import requests
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ArcLegacyRequest, ArcLegacySyncMeta, Cell, Factory, Manager, RoleProfile
from app.services import arc_legacy_client, arc_legacy_discovery, cell_lookup
from app.translit import transliterate

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))           # Tashkent, no DST
PLANT = "Uchtepa"
# Branch names are folded to letters and digits and matched on these stems, so
# «Uchtepa», «Учтепа», «Uch tepa filiali» and «Учтепинский» all hit. Every
# branch is listed in the report anyway, so a spelling this misses is visible.
_PLANT_STEMS = ("uchtep", "учтеп", "ўчтеп")
UCHTEPA_MAX = 5000          # newest Uchtepa tickets scanned in Python
RAW_SAMPLES = 15            # newest Uchtepa payloads carried whole in the JSON
DAYS = 14                   # per-day ticket counts shown
LIVE_PAGE = 50              # the API refuses a large page with a 422
DETAIL_MAX = 4              # single-ticket endpoints knocked on

_CODE = re.compile(r"(?<![0-9])([0-9]{4})(?![0-9])")
_ENDS = re.compile(r"(?<![0-9])([0-9]{4})\s*$")
_ISO = re.compile(r"^\s*\d{4}-\d{2}-\d{2}")
# Schema and property names worth naming when the API's own document is given.
_CELLISH = re.compile(r"cell|yach|divis|depart|section|sector|workshop|ceh|tsex|цех|otdel|bolim|zone|area",
                      re.I)

_API = "https://api.telegram.org"
SEND_RETRIES = 3
TEXT_MAX = 3900


# ── small helpers ────────────────────────────────────────────────────────────

def _n(v) -> str:
    return "—" if v is None else f"{int(v):,}".replace(",", " ")


def _day(v) -> str:
    if not v:
        return "—"
    if isinstance(v, str):
        try:
            v = datetime.fromisoformat(v)
        except ValueError:
            return v[:10]
    if isinstance(v, datetime):
        v = (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(TZ)
    return v.strftime("%d.%m")


def _when(v) -> str:
    if not v:
        return "—"
    v = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ).strftime("%d.%m %H:%M")


def _cut(s, n: int = 90) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[:n - 1] + "…"


def _show(v, n: int = 90) -> str:
    return _cut(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str), n)


def _has(v) -> bool:
    """Python twin of `arc_legacy_discovery._filled`."""
    if v is None:
        return False
    if isinstance(v, str):
        return bool(v.strip())
    if isinstance(v, (list, dict)):
        return bool(v)
    return True


def _walk(raw: dict) -> Iterator[tuple[str, Any]]:
    """(path, value) for every top-level key, every key inside an object value
    and every key inside an array of objects — the census's own three shapes.
    An array yields one pair per element, so callers de-duplicate per ticket."""
    for k, v in raw.items():
        yield k, v
        if isinstance(v, dict):
            for k2, v2 in v.items():
                yield f"{k}.{k2}", v2
        elif isinstance(v, list):
            for el in v:
                if isinstance(el, dict):
                    for k2, v2 in el.items():
                        yield f"{k}[].{k2}", v2


def _top(path: str) -> str:
    return path.split(".")[0].split("[")[0]


def _fold_branch(name: str) -> str:
    return re.sub(r"[\W_]+", "", (name or "").casefold())


def _fold(name) -> str:
    """A person's name reduced to what survives both alphabets — the twin of
    `routers/activity._fold_name`, applied to both sides."""
    s = (transliterate(name or "", "uz") or "").casefold()
    s = re.sub(r"[’ʻʼ`‘]", "'", s)
    s = s.replace("o'", "u").replace("'", "")
    s = s.replace("kh", "x").replace("h", "x").replace("ye", "e").replace("q", "k")
    return " ".join(re.sub(r"[^\w]+", " ", s).split())


# Mapped attributes that never name a person — kept out of the roster lookup so
# a two-word branch or category name is not counted as «not on our roster».
_NOT_PEOPLE = {"branch_name", "category", "normalized_status", "status_color", "description",
               "deny_reason", "comment_report", "photo_report", "document_url", "extra_phone"}


def _name_like(v) -> bool:
    if not isinstance(v, str):
        return False
    s = v.strip()
    return 5 <= len(s) <= 80 and not any(ch.isdigit() for ch in s) and 2 <= len(s.split()) <= 6


# ── the roster a requester's name is looked up in ────────────────────────────

def _roster(db: Session) -> dict[str, set]:
    """Folded name → {(kind, id)}: every profile (by its role) and every live
    brigadir unit. The first two words are keyed too, both ways round, because
    a request form rarely carries the patronymic our register does."""
    idx: dict[str, set] = defaultdict(set)

    def add(names, entry):
        for nm in names:
            f = _fold(nm)
            if not f:
                continue
            idx[f].add(entry)
            t = f.split()
            if len(t) >= 2:
                idx[f"{t[0]} {t[1]}"].add(entry)
                idx[f"{t[1]} {t[0]}"].add(entry)

    for p in db.query(RoleProfile).all():
        add((p.name, p.name_uz_cyrl, p.name_ru, p.name_en), (p.role, p.id))
    for m in db.query(Manager).filter(Manager.archived.is_(False)).all():
        add((m.name,), ("brigadir", m.id))
    return idx


def _who(idx: dict, value: str) -> Optional[tuple]:
    f = _fold(value)
    t = f.split()
    for key in (f, f"{t[0]} {t[1]}" if len(t) >= 2 else None,
                f"{t[1]} {t[0]}" if len(t) >= 2 else None):
        if key and idx.get(key):
            hits = idx[key]
            return next(iter(hits)) if len(hits) == 1 else ("ambiguous", None)
    return None


# ── the API's own document ───────────────────────────────────────────────────

def _resolve(doc: dict, sch, depth: int = 0) -> dict:
    if not isinstance(sch, dict) or depth > 8:
        return {}
    ref = sch.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/"):
        node: Any = doc
        for part in ref[2:].split("/"):
            node = node.get(part) if isinstance(node, dict) else None
        return _resolve(doc, node, depth + 1)
    if isinstance(sch.get("allOf"), list):
        merged: dict = {"properties": {}}
        for s in sch["allOf"]:
            merged["properties"].update(_resolve(doc, s, depth + 1).get("properties") or {})
        return merged
    for key in ("anyOf", "oneOf"):
        if isinstance(sch.get(key), list):
            for s in sch[key]:
                r = _resolve(doc, s, depth + 1)
                if r.get("properties") or r.get("items"):
                    return r
    return sch


def _spec_key(doc: dict, path: str) -> str:
    """``path`` as the document spells it — the ARC service may list its paths
    without the ``/arc`` prefix the gateway puts in front of them."""
    paths = doc.get("paths") or {}
    if path not in paths and path.startswith("/arc/") and path[4:] in paths:
        return path[4:]
    return path


def _item_props(doc: dict, path: str) -> dict:
    """The fields the document declares for ONE item of GET ``path``'s page."""
    op = ((doc.get("paths") or {}).get(_spec_key(doc, path)) or {}).get("get") or {}
    resp = (op.get("responses") or {}).get("200") or {}
    sch = ((resp.get("content") or {}).get("application/json") or {}).get("schema")
    page = _resolve(doc, sch)
    items = (page.get("properties") or {}).get("items")
    item = _resolve(doc, _resolve(doc, items).get("items")) if items else page
    out = {}
    for name, p in (item.get("properties") or {}).items():
        r = _resolve(doc, p)
        sub = sorted((r.get("properties") or {}).keys()) or None
        if not sub and r.get("type") == "array":
            sub = sorted((_resolve(doc, r.get("items")).get("properties") or {}).keys()) or None
        out[name] = {"type": r.get("type") or ("object" if r.get("properties") else None), "fields": sub}
    return out


def _spec_summary(doc: Optional[dict], attempts: list) -> dict:
    if not isinstance(doc, dict):
        return {"available": False, "attempts": attempts}
    props = _item_props(doc, arc_legacy_client._REQUESTS_PATH)
    known, nested = arc_legacy_discovery._KNOWN_FIELDS, arc_legacy_discovery._KNOWN_NESTED
    new = sorted(k for k in props if k not in known)
    new_inner = sorted(f"{k}.{s}" for k, p in props.items() if k in nested
                       for s in (p.get("fields") or []) if s not in nested[k])
    schemas = (doc.get("components") or {}).get("schemas") or {}
    hits = sorted({n for n in schemas if _CELLISH.search(n)}
                  | {f"{n}.{p}" for n, s in schemas.items() if isinstance(s, dict)
                     for p in (s.get("properties") or {}) if _CELLISH.search(p)})
    paths = arc_legacy_discovery.describe_paths(doc)
    return {"available": True, "attempts": attempts, "paths": paths,
            "item_fields": props, "item_new": new, "item_new_inner": new_inner,
            "cellish": hits[:60], "schemas": sorted(schemas)[:300]}


# ── the live half ────────────────────────────────────────────────────────────

def _live(stored_spec: Optional[dict], sample_id: Optional[str]) -> dict:
    """The newest page straight from the API, its own document and its
    single-ticket endpoint. Every call is reported, never raised."""
    out: dict = {"configured": arc_legacy_client.configured()}
    if not out["configured"]:
        return out
    known = arc_legacy_discovery._KNOWN_FIELDS
    list_keys: set[str] = set()
    with httpx.Client(timeout=arc_legacy_client._TIMEOUT) as client:
        try:
            body = arc_legacy_client.get_json(client, arc_legacy_client._REQUESTS_PATH,
                                              {"page": 1, "size": LIVE_PAGE})
            items = [i for i in (body.get("items") or []) if isinstance(i, dict)]
            paths = sorted({p for it in items for p, _v in _walk(it)})
            list_keys = {p for p in paths if p == _top(p)}
            out["page"] = {"ok": True, "total": body.get("total"), "items": len(items),
                           "keys": sorted(list_keys),
                           "new_keys": sorted(k for k in list_keys if k not in known),
                           "paths": paths}
            if not sample_id and items:
                sample_id = str(items[0].get("id") or "") or None
        except Exception as exc:                      # noqa: BLE001 - reported
            out["page"] = {"ok": False, "error": str(exc)[:300]}

        doc, attempts = stored_spec, []
        if doc:
            attempts = [{"path": "stored copy", "ok": True}]
        else:
            try:
                doc, attempts = arc_legacy_client.fetch_spec(client)
            except Exception as exc:                  # noqa: BLE001 - reported
                attempts = [{"path": "fetch", "ok": False, "error": str(exc)[:200]}]
        try:
            out["spec"] = _spec_summary(doc, attempts)
        except Exception as exc:                      # noqa: BLE001 - reported
            out["spec"] = {"available": bool(doc), "error": str(exc)[:300], "attempts": attempts}

        # One ticket on its own: the old app's list left the description off
        # and only its card carried it, so the new app's card may hold more.
        cands = []
        for p in (out.get("spec") or {}).get("paths") or []:
            path = p["path"] if p["path"].startswith("/arc/") else "/arc" + p["path"]
            if p["method"] == "GET" and path.startswith("/arc/api/v1/requests") and "{" in path:
                cands.append(re.sub(r"\{[^}]+\}", "{id}", path, count=1))
        cands += ["/arc/api/v1/requests/{id}", "/arc/api/v1/requests/factory/{id}"]
        detail = []
        if sample_id:
            for tmpl in list(dict.fromkeys(cands))[:DETAIL_MAX]:
                path = tmpl.replace("{id}", sample_id)
                row: dict = {"path": tmpl}
                try:
                    b = arc_legacy_client.get_json(client, path)
                    row["ok"] = True
                    if isinstance(b, dict):
                        keys = sorted(b)
                        row["keys"] = keys
                        row["extra_vs_list"] = sorted(k for k in keys if list_keys and k not in list_keys)
                        row["new_vs_august"] = sorted(k for k in keys if k not in known)
                        row["body"] = b
                    else:
                        row["kind"] = type(b).__name__
                except Exception as exc:              # noqa: BLE001 - reported
                    row["ok"] = False
                    row["error"] = str(exc)[:300]
                detail.append(row)
        out["detail"] = detail
        out["detail_id"] = sample_id
    return out


# ── the stored half ──────────────────────────────────────────────────────────

def _plant_codes(db: Session) -> tuple[Optional[int], set[str]]:
    """The Uchtepa plant's id and its cells' verifix codes (padded + stripped)."""
    wanted = PLANT.casefold()
    fid = None
    for f in db.query(Factory).all():
        if any((n or "").strip().casefold() == wanted
               for n in (f.code, f.name_uz, f.name_uz_cyrl, f.name_ru, f.name_en)):
            fid = f.id
            break
    codes: set[str] = set()
    if fid is not None:
        for (code,) in (db.query(Cell.verifix_code).join(Manager, Manager.id == Cell.manager_id)
                        .filter(Manager.factory_id == fid).all()):
            key = cell_lookup._norm(code)
            if key:
                codes.update({key, key.lstrip("0") or key})
    return fid, codes


def _scan(rows, codes_all: dict, codes_plant: set, roster: dict,
          leader_cells: Counter) -> dict:
    """Every attribute path of the Uchtepa tickets: how often it is filled, how
    often it holds a 4-digit code the cell register knows, and how often it
    names somebody on our roster (and so, for a leader, their cells)."""
    known = arc_legacy_discovery._KNOWN_FIELDS
    filled, code_t, reg_t, plant_t, ends_t = Counter(), Counter(), Counter(), Counter(), Counter()
    types: dict[str, set] = defaultdict(set)
    samples: dict[str, list] = defaultdict(list)
    names_t: Counter = Counter()
    who: dict[str, Counter] = defaultdict(Counter)
    unmatched: dict[str, Counter] = defaultdict(Counter)

    for raw in rows:
        if not isinstance(raw, dict):
            continue
        f_seen, c_seen, r_seen, p_seen, e_seen, n_seen = set(), set(), set(), set(), set(), {}
        for path, v in _walk(raw):
            if _has(v):
                f_seen.add(path)
                types[path].add(type(v).__name__)
            toks, ends = [], None
            if isinstance(v, str) and not _ISO.match(v):
                toks = _CODE.findall(v)
                m = _ENDS.search(v)
                ends = m.group(1) if m else None
            elif (isinstance(v, int) and not isinstance(v, bool) and 0 < v < 10000
                  and _top(path) not in known):
                # A new numeric attribute may carry the code without its zeros.
                toks = [str(v).zfill(4)]
            if toks:
                c_seen.add(path)
                reg = [t for t in toks if t in codes_all or t.lstrip("0") in codes_all]
                if reg:
                    r_seen.add(path)
                    if len(samples[path]) < 3 and _cut(v, 80) not in samples[path]:
                        samples[path].append(_cut(v, 80))
                if any(t in codes_plant for t in reg):
                    p_seen.add(path)
                if ends and (ends in codes_all or ends.lstrip("0") in codes_all):
                    e_seen.add(path)
            if _name_like(v) and path not in n_seen and _top(path) not in _NOT_PEOPLE:
                hit = _who(roster, v)
                if hit is None:
                    n_seen[path] = ("unmatched", v)
                elif hit[0] == "ambiguous":
                    n_seen[path] = ("ambiguous", None)
                elif hit[0] == "leader":
                    k = leader_cells.get(hit[1], 0)
                    n_seen[path] = ("leader_one_cell" if k == 1 else
                                    "leader_several_cells" if k > 1 else "leader_no_cell", None)
                else:
                    n_seen[path] = (hit[0], None)
        filled.update(f_seen)
        code_t.update(c_seen)
        reg_t.update(r_seen)
        plant_t.update(p_seen)
        ends_t.update(e_seen)
        for path, (kind, val) in n_seen.items():
            names_t[path] += 1
            who[path][kind] += 1
            if kind == "unmatched":
                unmatched[path][_cut(val, 60)] += 1

    paths = []
    for path in sorted(set(filled) | set(code_t) | set(names_t)):
        paths.append({
            "path": path, "filled": filled[path], "types": sorted(types[path]),
            "new": _top(path) not in known or (
                "." in path and _top(path) in arc_legacy_discovery._KNOWN_NESTED
                and path.split(".", 1)[1] not in arc_legacy_discovery._KNOWN_NESTED[_top(path)]),
            "code_tickets": code_t[path], "registered_code": reg_t[path],
            "plant_code": plant_t[path], "ends_with_code": ends_t[path],
            "code_samples": samples.get(path, []),
            "name_like": names_t[path], "who": dict(who[path]),
            "unmatched_top": unmatched[path].most_common(10) if names_t[path] else [],
        })
    return {"scanned": len(rows), "paths": paths}


def collect(db: Session) -> dict:
    rep: dict = {"generated_at": datetime.now(TZ).isoformat(timespec="seconds"), "errors": []}
    meta = db.query(ArcLegacySyncMeta).filter_by(id=1).first()
    rep["meta"] = {
        "configured": arc_legacy_client.configured(),
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "ok": meta.ok if meta else None,
        "message": (meta.message or "")[:300] if meta else None,
        "remote_total": meta.remote_total if meta else None,
        "row_count": meta.row_count if meta else None,
        "last_full_at": meta.last_full_at.isoformat() if meta and meta.last_full_at else None,
    }
    stored_spec = meta.spec if meta is not None and isinstance(meta.spec, dict) else None

    try:
        rep["census"] = arc_legacy_discovery.field_census(db)
    except Exception as exc:                          # noqa: BLE001 - reported
        db.rollback()
        rep["census"] = {"tickets": 0, "fields": [], "gone": [], "unmapped": 0}
        rep["errors"].append(f"census: {str(exc)[:300]}")

    R = ArcLegacyRequest
    live_rows = R.missing_since.is_(None)
    branches = [
        {"id": bid, "name": name, "tickets": int(n), "first": _day(lo), "last": _day(hi)}
        for bid, name, n, lo, hi in (
            db.query(R.branch_id, R.branch_name, func.count(R.id), func.min(R.created_at), func.max(R.created_at))
            .filter(live_rows).group_by(R.branch_id, R.branch_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    rep["branches"] = branches
    names = [b["name"] for b in branches
             if b["name"] and any(s in _fold_branch(b["name"]) for s in _PLANT_STEMS)]

    u: dict = {"branches": [b for b in branches if b["name"] in names], "tickets": 0}
    rep["uchtepa"] = u
    fid, codes_plant = _plant_codes(db)
    u["plant_id"], u["plant_cells"] = fid, len({c for c in codes_plant if len(c) == 4})
    if names:
        where = (live_rows, R.branch_name.in_(names))
        u["tickets"] = int(db.query(func.count(R.id)).filter(*where).scalar() or 0)
        local_day = cast(func.timezone("Asia/Tashkent", R.created_at), Date)
        since = (datetime.now(TZ) - timedelta(days=DAYS - 1)).date()
        u["per_day"] = {d.isoformat(): int(n) for d, n in (
            db.query(local_day, func.count(R.id)).filter(*where, local_day >= since)
            .group_by(local_day).order_by(local_day).all())}
        rows = (db.query(R.remote_id, R.raw).filter(*where)
                .order_by(R.created_at.desc().nullslast()).limit(UCHTEPA_MAX).all())
        codes_all = cell_lookup.by_verifix(db)
        leader_cells = Counter(lid for (lid,) in db.query(Cell.leader_id).filter(Cell.leader_id.isnot(None)).all())
        try:
            u.update(_scan([r.raw for r in rows], codes_all, codes_plant, _roster(db), leader_cells))
        except Exception as exc:                      # noqa: BLE001 - reported
            rep["errors"].append(f"uchtepa scan: {str(exc)[:300]}")
        u["categories_top"] = [
            (c, int(n)) for c, n in db.query(R.category_name, func.count(R.id)).filter(*where)
            .group_by(R.category_name).order_by(func.count(R.id).desc()).limit(15).all()]
        rep["samples"] = [r.raw for r in rows[:RAW_SAMPLES]]
        sample_id = rows[0].remote_id if rows else None
    else:
        rep["samples"] = [r.raw for r in db.query(R.raw).filter(live_rows)
                          .order_by(R.created_at.desc().nullslast()).limit(5).all()]
        sample_id = None
    db.rollback()                 # end the read before the slow HTTP half

    try:
        rep["live"] = _live(stored_spec, sample_id)
    except Exception as exc:                          # noqa: BLE001 - reported
        rep["live"] = {"error": str(exc)[:300]}
    return rep


# ── the message ──────────────────────────────────────────────────────────────

def _verdict(u: dict) -> str:
    n = u.get("scanned") or 0
    if not n:
        return "Verdict: no Uchtepa tickets are stored, so nothing could be checked."
    paths = u.get("paths") or []
    best = max(paths, key=lambda p: p["registered_code"], default=None)
    share = (best["registered_code"] / n) if best else 0
    best_who = max(paths, key=lambda p: p["who"].get("leader_one_cell", 0), default=None)
    one = best_who["who"].get("leader_one_cell", 0) if best_who else 0
    if best and share >= 0.8:
        return (f"Verdict: YES — «{best['path']}» holds a registered cell code on "
                f"{round(share * 100)}% of Uchtepa tickets.")
    if best and share >= 0.2:
        return (f"Verdict: PARTLY — the best field, «{best['path']}», holds a registered cell code "
                f"on {round(share * 100)}% of Uchtepa tickets.")
    if best_who and one / n >= 0.5:
        return (f"Verdict: ONLY THROUGH THE REQUESTER — no field names the cell, but «{best_who['path']}» "
                f"names a leader who owns exactly one cell on {round(one / n * 100)}% of tickets.")
    return "Verdict: NO — no field of the Uchtepa tickets names the cell."


def text(rep: dict) -> str:
    m, c, u, live = rep["meta"], rep["census"], rep["uchtepa"], rep.get("live") or {}
    known = arc_legacy_discovery._KNOWN_FIELDS
    L = ["ARC · the NEW app's API (/arc-legacy): new attributes, and the cell of an Uchtepa ticket", ""]
    last = datetime.fromisoformat(m["last_synced"]) if m["last_synced"] else None
    L.append(f"Stored tickets: {_n(c.get('tickets'))} · the API reports {_n(m['remote_total'])} · "
             f"last sync {_when(last)}" + ("" if m["ok"] is not False else f" · last sync FAILED: {_cut(m['message'], 120)}"))
    if not m["configured"]:
        L.append("The API login is NOT configured on the server — only stored tickets were read.")
    if u["branches"]:
        L.append(f"Uchtepa tickets: {_n(u['tickets'])} (branch: "
                 + ", ".join(f"«{b['name']}» {_n(b['tickets'])}" for b in u["branches"][:4]) + ")")
    else:
        L.append("No branch named Uchtepa. Branches: "
                 + ", ".join(f"«{b['name']}» {_n(b['tickets'])}" for b in rep["branches"][:8]))
    if u.get("per_day"):
        L.append("Uchtepa per day: " + " · ".join(f"{d[8:10]}.{d[5:7]} {_n(n)}" for d, n in u["per_day"].items()))

    fields = c.get("fields") or []
    extra = [f for f in fields if not f["mapped"] and not f["under_new"]]
    ufill = {p["path"]: p["filled"] for p in u.get("paths") or []}
    L += ["", f"1) NEW ATTRIBUTES — sent now, not in the August map, not used by the page: {len(extra)}"]
    for f in extra:
        kids = [k["name"] for k in fields if k["under_new"] and k["parent"] == f["name"] and f["parent"] is None]
        span = f"{_day(f['first_at'])}–{_day(f['last_at'])}" if f["filled"] else "never filled"
        uch = f" · Uchtepa {_n(ufill.get(f['path'], 0))}/{_n(u.get('scanned'))}" if u.get("scanned") else ""
        L.append(f"• {f['path']} — filled {_n(f['filled'])}/{_n(c['tickets'])} · {span} · "
                 f"{'/'.join(f['types'])}{uch}")
        if f.get("sample"):
            L.append(f"   e.g. {_cut(f['sample'], 100)}")
        if kids:
            L.append(f"   inside: {', '.join(kids[:12])}")
    if not extra:
        L.append("  None — the stored tickets carry only the attributes the API sent in August.")
    if c.get("gone"):
        L.append(f"No longer sent (the page uses them): {', '.join(c['gone'])}")

    page = live.get("page") or {}
    if page.get("ok"):
        L.append(f"Live check, newest {page['items']} straight from the API: new keys "
                 + (", ".join(page["new_keys"]) if page["new_keys"] else "none"))
    elif page:
        L.append(f"Live check failed: {_cut(page.get('error'), 150)}")
    spec = live.get("spec") or {}
    if spec.get("available"):
        new = spec.get("item_new", []) + spec.get("item_new_inner", [])
        L.append(f"API document: {len(spec.get('paths') or [])} endpoints; a ticket declares "
                 f"{len(spec.get('item_fields') or {})} fields; not in the August map: "
                 + (", ".join(new) if new else "none"))
        if spec.get("cellish"):
            L.append(f"   names that sound like a place: {', '.join(spec['cellish'][:15])}")
    elif spec:
        L.append("API document: not given (" + "; ".join(
            f"{a.get('path')} {'ok' if a.get('ok') else _cut(a.get('error'), 40)}"
            for a in (spec.get("attempts") or [])[:5]) + ")")
    for d in live.get("detail") or []:
        if d.get("ok"):
            extra_d = d.get("extra_vs_list") or []
            L.append(f"One-ticket endpoint {d['path']}: answers; fields beyond the list: "
                     + (", ".join(extra_d) if extra_d else "none"))
        else:
            L.append(f"One-ticket endpoint {d['path']}: {_cut(d.get('error'), 70)}")

    L += ["", "2) UCHTEPA → CELL"]
    n = u.get("scanned") or 0
    if n:
        coded = sorted((p for p in u["paths"] if p["registered_code"]),
                       key=lambda p: -p["registered_code"])[:5]
        for p in coded:
            L.append(f"• {p['path']}: a registered cell code in {_n(p['registered_code'])}/{_n(n)} "
                     f"({round(p['registered_code'] / n * 100)}%) · at the end {_n(p['ends_with_code'])} · "
                     f"an Uchtepa cell {_n(p['plant_code'])}"
                     + (f" · e.g. {p['code_samples'][0]}" if p["code_samples"] else ""))
        if not coded:
            L.append("• No attribute holds a 4-digit code the cell register knows.")
        people = sorted((p for p in u["paths"] if p["name_like"] >= max(1, n // 5)),
                        key=lambda p: -p["name_like"])[:3]
        for p in people:
            w = p["who"]
            L.append(f"• {p['path']} names a person on {_n(p['name_like'])} tickets: "
                     f"leader with one cell {_n(w.get('leader_one_cell', 0))} · several cells "
                     f"{_n(w.get('leader_several_cells', 0))} · brigadir {_n(w.get('brigadir', 0))} · "
                     f"other profile {_n(sum(v for k, v in w.items() if k not in ('leader_one_cell', 'leader_several_cells', 'leader_no_cell', 'brigadir', 'unmatched', 'ambiguous')))} · "
                     f"not on our roster {_n(w.get('unmatched', 0))}")
        L.append(_verdict(u))
    elif u.get("tickets"):
        L.append("The Uchtepa scan failed — see Errors below.")
    else:
        L.append("Nothing to check — no Uchtepa tickets are stored.")
    if rep["errors"]:
        L += ["", "Errors: " + " | ".join(rep["errors"])]
    L += ["", "The full detail, with the newest Uchtepa tickets whole, is in the JSON below."]
    return "\n".join(L)


# ── delivery ─────────────────────────────────────────────────────────────────

def _post(method: str, data: dict, files: Optional[dict] = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            if files:
                for f in files.values():
                    f[1].seek(0)
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
    rep = collect(db)
    body = text(rep)
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > TEXT_MAX:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for part in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": part})
    data = json.dumps(rep, ensure_ascii=False, indent=1, default=str).encode("utf-8")
    name = f"arc_new_app_attrs_{datetime.now(TZ).date().isoformat()}.json"
    _post("sendDocument", {"chat_id": chat_id, "caption": "ARC new app API — full detail"},
          files={"document": (name, io.BytesIO(data), "application/json")})
    return len(chunks) + 1
