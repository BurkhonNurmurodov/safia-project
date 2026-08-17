"""
What is the ARC API actually willing to give us?

IT's answer to «we see too few tickets» was that we filter wrongly, and both
halves of that can be true at once: the endpoint may take parameters we never
send, and its DEFAULTS may already be a filter (a closed ticket, an archived
one, a ticket older than N days can each be missing by default).

Guessing parameter names is worthless here: the API is FastAPI, and FastAPI
IGNORES a query parameter it does not declare — a wrong guess produces the
same answer as no guess at all, silently. So the **openapi document is the
only source of truth**, and the only honest measurement is the `total` the API
reports for one parameter set versus another.

This module therefore does exactly two things:

  1. READS the spec — every path the API exposes (there are endpoints we never
     call) and, for the requests endpoint, every declared parameter with its
     type, default and enum;
  2. MEASURES — one cheap `size=1` call per candidate value, comparing `total`
     against the untouched baseline. A value that RAISES the total is a filter
     we were missing; one that lowers it is a filter we now know how to use.

The winning combination is stored on the sync meta as ``filters`` and the walk
sends it on every page from then on, so «all data possible» is a measured
claim rather than a hope. Everything is recorded — including the parameters
that changed nothing — because next month's question will be «what did we
actually try?».
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.database import SessionLocal
from app.models import ArcSyncMeta
from app.services import arc_client

log = logging.getLogger(__name__)

REQUESTS_PATH = arc_client._REQUESTS_PATH

# Sibling endpoints worth a look even when the spec is unavailable: probing
# found them alive (401 rather than 404) before any credential existed.
_EXTRA_PATHS = (
    "/arc/api/v1/requests/factory/stats",
    "/arc/api/v1/requests/factory/export",
)

# A date bound low/high enough to mean «no bound», for parameters whose default
# is a rolling window.
_EPOCH = "2000-01-01"
_HORIZON = "2100-01-01"

# Never fire more than this many probe calls, whatever the spec declares.
MAX_PROBES = 60


# ── spec reading ────────────────────────────────────────────────────────────

def _schema_of(param: dict) -> dict:
    sch = param.get("schema") or {}
    # A nullable/optional parameter is often `anyOf: [{...}, {type: null}]`.
    if not sch.get("type") and isinstance(sch.get("anyOf"), list):
        for alt in sch["anyOf"]:
            if isinstance(alt, dict) and alt.get("type") and alt.get("type") != "null":
                return alt
    return sch


def describe_params(spec: Optional[dict], path: str = REQUESTS_PATH) -> list[dict]:
    """Every query parameter the spec declares for GET ``path``, flattened to
    what a human needs to judge it: name, type, default, enum, required."""
    if not isinstance(spec, dict):
        return []
    op = ((spec.get("paths") or {}).get(path) or {}).get("get") or {}
    out = []
    for p in op.get("parameters") or []:
        if not isinstance(p, dict) or p.get("in") != "query":
            continue
        sch = _schema_of(p)
        out.append({
            "name": p.get("name"),
            "required": bool(p.get("required")),
            "type": sch.get("type") or ("enum" if sch.get("enum") else None),
            "format": sch.get("format"),
            "default": sch.get("default"),
            "enum": sch.get("enum"),
            "description": (p.get("description") or "")[:200] or None,
        })
    return out


def describe_paths(spec: Optional[dict]) -> list[dict]:
    """Every path × method the API exposes, with its summary — the cheapest
    possible answer to «what else is there?»."""
    if not isinstance(spec, dict):
        return []
    out = []
    for path, ops in (spec.get("paths") or {}).items():
        if not isinstance(ops, dict):
            continue
        for method, op in ops.items():
            if method.lower() not in ("get", "post", "put", "patch", "delete"):
                continue
            out.append({
                "path": path,
                "method": method.upper(),
                "summary": (op.get("summary") or op.get("operationId") or "")[:120] or None,
                "params": len([p for p in (op.get("parameters") or [])
                               if isinstance(p, dict) and p.get("in") == "query"]),
            })
    out.sort(key=lambda r: (r["path"], r["method"]))
    return out


# ── candidate values ────────────────────────────────────────────────────────

def _candidates(param: dict) -> list[Any]:
    """The values worth SPENDING a call on for one declared parameter.

    Only values that could plausibly change the size of the answer: both sides
    of a boolean, every value of a small enum, an open bound for a date. A free
    string (search, a uuid filter) can only ever narrow, and narrowing is
    already available to the page — so it is described, never probed."""
    name = (param.get("name") or "").lower()
    typ = param.get("type")
    enum = param.get("enum")

    if name in ("page", "size", "limit", "offset", "per_page"):
        return []                      # pagination is the walk's own business
    if enum:
        return list(enum)[:8]
    if typ == "boolean":
        return [True, False]
    if typ in ("string", None) and (param.get("format") in ("date", "date-time")
                                    or any(k in name for k in ("date", "from", "to", "start", "end", "begin"))):
        if any(k in name for k in ("from", "start", "begin", "after")):
            return [_EPOCH]
        if any(k in name for k in ("to", "end", "before", "until")):
            return [_HORIZON]
        return []
    if typ == "integer" and any(k in name for k in ("day", "month", "year", "period")):
        return [3650]                  # «ten years» for a rolling-window number
    return []


# ── the probe ───────────────────────────────────────────────────────────────

def run_probe(db, client: Optional[httpx.Client] = None) -> dict:
    """Measure what the API gives under every plausible parameter set and
    decide which ones to send from now on. Returns the full report (also
    stored on the meta row)."""
    if not arc_client.configured():
        return {"ok": False, "error": "not_configured"}

    own_client = client is None
    client = client or httpx.Client(timeout=arc_client._TIMEOUT)
    try:
        meta = db.query(ArcSyncMeta).filter_by(id=1).first()
        spec = meta.spec if meta is not None else None
        if not spec:
            spec = arc_client.fetch_openapi(client)
            if spec and meta is not None:
                meta.spec = spec
                meta.spec_fetched_at = datetime.now(timezone.utc)
                db.commit()

        params = describe_params(spec)
        base = arc_client.probe_requests(client)
        baseline = base.get("total")
        trials: list[dict] = []
        spent = 1

        for p in params:
            for value in _candidates(p):
                if spent >= MAX_PROBES:
                    break
                spent += 1
                res = arc_client.probe_requests(client, {p["name"]: value})
                total = res.get("total")
                trials.append({
                    "param": p["name"], "value": value, "ok": res.get("ok"),
                    "total": total, "error": res.get("error"),
                    "delta": (total - baseline) if (total is not None and baseline is not None) else None,
                })

        # Everything that made the API hand over MORE than its defaults do.
        winners = {t["param"]: t["value"] for t in trials
                   if t["ok"] and t.get("delta") and t["delta"] > 0}
        combined = None
        if winners:
            combined = arc_client.probe_requests(client, winners)
            spent += 1
            # A combination that does NOT beat the baseline is not an
            # improvement, whatever its parts measured alone (two filters can
            # contradict each other). Keep the defaults in that case.
            if not (combined.get("ok") and (combined.get("total") or 0) > (baseline or 0)):
                winners = {}

        extras = {}
        for path in _EXTRA_PATHS:
            if spent >= MAX_PROBES:
                break
            spent += 1
            extras[path] = arc_client.get_path(client, path, {"page": 1, "size": 1})

        report = {
            "ok": True,
            "at": datetime.now(timezone.utc).isoformat(),
            "spec_available": bool(spec),
            "baseline_total": baseline,
            "baseline_error": base.get("error"),
            "max_size": base.get("size"),
            "params": params,
            "paths": describe_paths(spec),
            "trials": trials,
            "combined_total": (combined or {}).get("total") if combined else None,
            "filters": winners,
            "calls": spent,
        }
        if meta is not None:
            meta.probe = report
            meta.probe_at = datetime.now(timezone.utc)
            # Only ever store a filter set we measured as an improvement.
            meta.filters = winners or None
            db.commit()
        log.info("arc probe: baseline=%s combined=%s filters=%s calls=%s",
                 baseline, report["combined_total"], winners, spent)
        return report
    finally:
        if own_client:
            client.close()


def probe_now() -> dict:
    """Thread/scheduler entrypoint — opens its own session."""
    db = SessionLocal()
    try:
        return run_probe(db)
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        log.warning("arc probe failed: %s", str(exc)[:300])
        return {"ok": False, "error": str(exc)[:300]}
    finally:
        db.close()


def active_filters(db) -> dict:
    """The parameter set the walk should send (empty = API defaults)."""
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    f = getattr(meta, "filters", None) if meta is not None else None
    return dict(f) if isinstance(f, dict) else {}
