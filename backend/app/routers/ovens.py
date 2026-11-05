"""«Pechlar» — the Revent ovens (/ovens) and their register (/panel/ovens).

Three routers over ``services/revent_ovens.py`` (what is kept) and
``services/revent_analytics.py`` (what is shown):

- ``/api/ovens/collector`` — the COLLECTOR on the factory LAN (a laptop for
  the test). It reads each oven with the three read-only calls and posts the
  answers here; the server never reaches an oven. Every route checks the
  collector key itself (``X-Oven-Key``, or ``Authorization: Bearer``), so the
  prefix is outside the Telegram-origin wall (security._EXEMPT_PREFIXES) and
  outside the action log's middleware (telemetry, one post a minute).
- ``/api/ovens`` — the page, gated on the ``ovens`` page key (admin-only until
  the operator opens it on the Access tab).
- ``/api/admin/ovens`` — the register: which ovens exist, at which LAN
  address. ADMIN-ONLY and not grantable: the address list is where the
  collector is sent, so it is limited to private LAN addresses.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import ipaddress
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReventOven, ReventOvenLog
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, android_release, oven_firmware, ops_door, revent_analytics, revent_ovens

log = logging.getLogger(__name__)

collector_router = APIRouter(prefix="/api/ovens/collector", tags=["ovens"])
router = APIRouter(prefix="/api/ovens", tags=["ovens"])
admin_router = APIRouter(prefix="/api/admin/ovens", tags=["ovens"])

KEY_HEADER = "x-oven-key"


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _refuse(code: str, message: str, status: int, **extra) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


# ── the collector ─────────────────────────────────────────────────────────────

def _ip(request: Request) -> str:
    h = request.headers
    return (h.get("cf-connecting-ip") or h.get("x-real-ip")
            or (request.client.host if request.client else "") or "")[:64]


def _collector(request: Request) -> str:
    """The collector's name, or 401 / 429. Wrong keys share the report door's
    per-address throttle — ten in ten minutes and the address waits."""
    ip = _ip(request)
    if ops_door.throttled(ip):
        raise _refuse("throttled", "Too many wrong keys from this address — wait ten minutes.", 429)
    v = (request.headers.get(KEY_HEADER) or "").strip()
    if not v:
        scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
        v = token.strip() if scheme.lower() == "bearer" else ""
    name = revent_ovens.collector_of(v)
    if name:
        return name
    ops_door.note_bad(ip)
    log.warning("[OVENS] collector key refused from %s", ip)
    raise _refuse("bad_key", "Not a collector key.", 401)


def _seen(db: Session, request: Request, name: str, what: str) -> None:
    """Remember that this collector is alive (the admin page's «Tekshirish»)."""
    revent_ovens.note_contact(db, name, what, _ip(request), request.headers.get("user-agent") or "",
                              request.headers.get("x-collector-info"))


def _oven(db: Session, oven_id: int) -> ReventOven:
    o = db.get(ReventOven, oven_id)
    if o is None or not o.active:
        raise _refuse("no_oven", "No such active oven.", 404)
    return o


@collector_router.get("/plan")
def collector_plan(request: Request, db: Session = Depends(get_db)):
    """Which ovens to read, how often, and what is already kept here."""
    name = _collector(request)
    _seen(db, request, name, "plan")
    return revent_ovens.plan(db)


@collector_router.get("/ping")
def collector_ping(request: Request, db: Session = Depends(get_db)):
    """The heartbeat between rounds: nothing but «I am here»."""
    name = _collector(request)
    _seen(db, request, name, "ping")
    return {"ok": True}


@collector_router.get("/firmware")
def collector_firmware(request: Request, version: str = Query(..., max_length=12), db: Session = Depends(get_db)):
    """The published firmware image, for the board to write into its other
    app slot. Only the version the plan names — a board holding an older plan
    is told 404 and asks again with the next plan."""
    name = _collector(request)
    _seen(db, request, name, "firmware")
    rel = oven_firmware.latest()
    if rel is None or rel["version"] != version:
        raise _refuse("no_firmware", "That firmware is not the published one.", 404)
    log.info("[OVENS] %s downloads firmware %s", name, version)
    return FileResponse(oven_firmware.path(version), media_type="application/octet-stream",
                        headers={"Cache-Control": "no-store", "X-Firmware-Sha256": rel["sha256"]})


@collector_router.post("/firmware/publish")
async def collector_firmware_publish(request: Request, version: str = Query(..., max_length=12)):
    """tools/revent-oven/board/publish_firmware.sh: the build Mac's publish
    key (the APK's), the image as the body. The board takes it at its next
    round."""
    if not android_release.key_ok(request.headers.get("X-Publish-Key")):
        raise _refuse("bad_publish_key", "Not the publish key.", 403)
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared > oven_firmware.MAX_BIN:
        raise _refuse("bad_firmware", "Too big for the board's app slot.", 400)
    buf = bytearray()
    async for part in request.stream():
        buf += part
        if len(buf) > oven_firmware.MAX_BIN:
            raise _refuse("bad_firmware", "Too big for the board's app slot.", 400)
    try:
        meta = await run_in_threadpool(oven_firmware.publish, bytes(buf), version)
    except oven_firmware.BadFirmware as e:
        raise _refuse("bad_firmware", str(e), 400)
    log.info("[OVENS] firmware %s published (%s bytes, sha256 %s)", meta["version"], meta["size"], meta["sha256"][:12])
    action_log.record(category="config", action="config.oven_firmware_published", source="system",
                      actor_name="publish key", actor_role="system", target_kind="oven_firmware",
                      target_id=meta["version"], target_name="Pech platasi " + meta["version"],
                      details=[("size", meta["size"]), ("sha256", meta["sha256"][:16])])
    return meta


class StatusIn(BaseModel):
    oven_id: int
    lines: Optional[List[str]] = None
    error: Optional[str] = None


class StatusBatch(BaseModel):
    readings: List[StatusIn] = Field(default_factory=list, max_length=50)


@collector_router.post("/status")
async def collector_status(request: Request, db: Session = Depends(get_db)):
    """One poll's live status for every oven read (or why one could not be).

    The body is read here, not by a model: bytes that are not UTF-8 are
    replaced and a reading that does not hold together is skipped and named
    (revent_ovens.parse_status_body), so one oven's odd line can never lose
    every oven's status — and whatever had to be repaired or refused is kept
    on the collector's row (the «Kollektor qurilmasi» card)."""
    name = _collector(request)                  # in memory, no DB
    buf = bytearray()
    async for part in request.stream():
        buf += part
        if len(buf) > revent_ovens.STATUS_BODY_MAX:
            break
    raw = bytes(buf)

    def work():
        _seen(db, request, name, "status")
        if len(raw) > revent_ovens.STATUS_BODY_MAX:
            revent_ovens.note_trouble(db, name, "status", "body over 256 KB", http=400, size=len(raw), head=raw)
            raise _refuse("bad_body", "Status refused: over 256 KB.", 400)
        readings, notes = revent_ovens.parse_status_body(raw)
        if readings is None:
            revent_ovens.note_trouble(db, name, "status", "; ".join(notes), http=400, size=len(raw), head=raw)
            raise _refuse("bad_body", "Status refused: " + "; ".join(notes), 400)
        saved = 0
        for r in readings:
            o = db.get(ReventOven, r["oven_id"])
            if o is None or not o.active:
                continue
            revent_ovens.save_status(db, o, r["lines"], r["error"], name)
            saved += 1
        db.commit()
        if notes:
            revent_ovens.note_trouble(db, name, "status", "kept, repaired: " + "; ".join(notes),
                                      http=200, size=len(raw), head=raw)
        return {"saved": saved, "notes": notes}

    return await run_in_threadpool(work)


class FileIn(BaseModel):
    oven_id: int
    kind: str                       # log · service · settings
    name: str = ""
    offset: int = 0
    size: int
    sha256: str
    data: str                       # base64 of the bytes from `offset` on


@collector_router.post("/file")
def collector_file(body: FileIn, request: Request, db: Session = Depends(get_db)):
    """One file of one oven. A log may be sent as the bytes added since the
    copy kept here (`offset` = that copy's size); anything that does not add
    up is refused 409 with the size this side holds, and sent again whole."""
    name = _collector(request)
    _seen(db, request, name, "file")
    try:
        chunk = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise _refuse("bad_data", "data is not base64.", 400)
    return _store_file(db, body.oven_id, body.kind, body.name, body.offset, chunk,
                       body.size, body.sha256)


@collector_router.post("/raw")
async def collector_raw(request: Request,
                        oven_id: int = Query(...), kind: str = Query(..., max_length=20),
                        name: str = Query("", max_length=120), offset: int = Query(0),
                        size: int = Query(...), sha256: str = Query(..., max_length=64),
                        db: Session = Depends(get_db)):
    """The same as /file with the bytes as the request body (no JSON, no
    base64) — what the always-on board sends: it holds the file in a small
    memory and a third less to send matters there. The key is checked BEFORE
    the body is read, the body is capped, and the store runs off the loop."""
    who = _collector(request)                   # in memory, no DB
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared > revent_ovens.MAX_FILE:
        raise _refuse("bad_size", "File refused: bad_size.", 400, size=0)
    buf = bytearray()
    async for part in request.stream():
        buf += part
        if len(buf) > revent_ovens.MAX_FILE:
            raise _refuse("bad_size", "File refused: bad_size.", 400, size=0)
    data = bytes(buf)

    def work():
        _seen(db, request, who, "file")
        return _store_file(db, oven_id, kind, name, offset, data, size, sha256)

    return await run_in_threadpool(work)


def _store_file(db: Session, oven_id: int, kind: str, name: str, offset: int, chunk: bytes,
                size: int, sha256: str) -> dict:
    """Both doors' one store: a log (whole or its new tail), ServiceData.txt or
    OvenSettings.xml. 409 (with the size kept here) when a tail does not fit."""
    o = _oven(db, oven_id)
    try:
        if kind == "log":
            row = revent_ovens.save_log(db, o, name, offset, chunk, size, sha256)
            db.commit()
            revent_analytics.forget(o.id)
            return {"saved": True, "size": row.size}
        if offset or len(chunk) != size:
            raise revent_ovens.Refused("bad_size")
        if hashlib.sha256(chunk).hexdigest() != (sha256 or "").lower():
            raise revent_ovens.Refused("sha")
        if kind == "service":
            revent_ovens.save_service(o, chunk.decode("utf-8", "replace"))
        elif kind == "settings":
            revent_ovens.save_settings(o, chunk)
        else:
            raise _refuse("bad_kind", "kind is log, service or settings.", 400)
        db.commit()
        return {"saved": True, "size": len(chunk)}
    except revent_ovens.Refused as e:
        db.rollback()
        status = 409 if e.reason in ("offset", "sha") else 400
        raise _refuse(e.reason, "File refused: %s." % e.reason, status, size=e.size)


# ── the page ──────────────────────────────────────────────────────────────────

def _period(date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    try:
        d2 = date.fromisoformat(date_to) if date_to else date.today()
        d1 = date.fromisoformat(date_from) if date_from else d2 - timedelta(days=6)
    except ValueError:
        raise _refuse("bad_date", "Dates are YYYY-MM-DD.", 422)
    if d1 > d2:
        raise _refuse("range_reversed", "The period starts after it ends.", 422)
    if (d2 - d1).days > 92:
        raise _refuse("range_too_long", "At most 93 days at a time.", 422)
    return d1, d2


@router.get("/board", dependencies=[Depends(require_page("ovens"))])
def board(db: Session = Depends(get_db)):
    """Every oven as it stands now: the live status, its age, the collector."""
    return revent_analytics.board(db)


@router.get("/analysis", dependencies=[Depends(require_page("ovens"))])
def analysis(date_from: Optional[str] = None, date_to: Optional[str] = None,
             ovens: Optional[str] = Query(None, description="comma-separated oven ids"),
             db: Session = Depends(get_db)):
    """Bakes, utilisation, alarms and door over a period, per oven and whole."""
    d1, d2 = _period(date_from, date_to)
    ids = [int(x) for x in (ovens or "").split(",") if x.strip().isdigit()] or None
    return revent_analytics.analysis(db, d1, d2, ids)


@router.get("/day", dependencies=[Depends(require_page("ovens"))])
def day(oven: int, date: str, db: Session = Depends(get_db)):  # noqa: A002 — the query name
    """One oven's day in full: temperature series, bakes, modes, door, alarms."""
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise _refuse("bad_date", "Dates are YYYY-MM-DD.", 422)
    o = db.get(ReventOven, oven)
    if o is None:
        raise _refuse("no_oven", "No such oven.", 404)
    return revent_analytics.day(db, o, d)


@router.get("/info", dependencies=[Depends(require_page("ovens"))])
def info(oven: int, db: Session = Depends(get_db)):
    """What the oven says about itself: its settings file and service hours."""
    o = db.get(ReventOven, oven)
    if o is None:
        raise _refuse("no_oven", "No such oven.", 404)
    return revent_analytics.info(db, o)


# ── the register ──────────────────────────────────────────────────────────────

def _check_ip(ip: str) -> str:
    """A private LAN IPv4 address and nothing else: the collector is sent to
    whatever this list names, so it must never be able to name a host outside
    the factory network."""
    ip = (ip or "").strip()
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        raise _refuse("bad_ip", "Not an IP address.", 400)
    if a.version != 4 or not a.is_private or a.is_loopback or a.is_link_local:
        raise _refuse("bad_ip", "Only a private LAN address (10.x, 172.16–31.x, 192.168.x).", 400)
    return str(a)


def _oven_out(o: ReventOven, logs: dict) -> dict:
    n, size, last = logs.get(o.id, (0, 0, None))
    return {
        "id": o.id, "name": o.name, "ip": o.ip, "port": o.port, "active": bool(o.active),
        "position": o.position, "note": o.note, "collector": o.collector,
        "status_at": _iso(o.status_at), "tried_at": _iso(o.tried_at), "error": o.error,
        "logs_at": _iso(o.logs_at), "settings_at": _iso(o.settings_at),
        "service_at": _iso(o.service_at), "log_files": n, "log_bytes": size,
        "last_record": _iso(last),
    }


def _register(db: Session) -> dict:
    logs = {oid: (n, s or 0, last) for oid, n, s, last in
            db.query(ReventOvenLog.oven_id, func.count(), func.sum(ReventOvenLog.size),
                     func.max(ReventOvenLog.last_at)).group_by(ReventOvenLog.oven_id)}
    ovens = db.query(ReventOven).order_by(ReventOven.position, ReventOven.id).all()
    return {"ovens": [_oven_out(o, logs) for o in ovens],
            "collectors": sorted(set(revent_ovens.COLLECTOR_KEYS.values())),
            "poll": revent_ovens.POLL}


class OvenIn(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    ip: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    active: Optional[bool] = None
    position: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)


@admin_router.get("")
def register(db: Session = Depends(get_db), _a=Depends(verify_admin)):
    return _register(db)


@admin_router.get("/devices")
def devices(db: Session = Depends(get_db), _a=Depends(verify_admin)):
    """The collector devices and when IMS last heard from each — the page's
    «Tekshirish» asks this until the device answers or its wait runs out."""
    return revent_ovens.devices(db)


@admin_router.post("")
def add_oven(body: OvenIn, db: Session = Depends(get_db), a=Depends(verify_admin)):
    name = (body.name or "").strip()
    if not name:
        raise _refuse("name_required", "Give the oven a name.", 400)
    ip = _check_ip(body.ip or "")
    port = body.port or 8080
    if db.query(ReventOven).filter(ReventOven.ip == ip, ReventOven.port == port).first():
        raise _refuse("duplicate", "That address is already in the list.", 409)
    pos = (db.query(func.max(ReventOven.position)).scalar() or 0) + 1
    db.add(ReventOven(name=name, ip=ip, port=port, active=True, position=pos,
                      note=(body.note or "").strip() or None,
                      added_by=a.get("full_name") or str(a.get("telegram_id") or "admin")))
    db.commit()
    return _register(db)


@admin_router.put("/{oven_id}")
def edit_oven(oven_id: int, body: OvenIn, db: Session = Depends(get_db), _a=Depends(verify_admin)):
    o = db.get(ReventOven, oven_id)
    if o is None:
        raise _refuse("no_oven", "No such oven.", 404)
    if body.name is not None:
        if not body.name.strip():
            raise _refuse("name_required", "Give the oven a name.", 400)
        o.name = body.name.strip()
    if body.ip is not None or body.port is not None:
        ip = _check_ip(body.ip) if body.ip is not None else o.ip
        port = body.port or o.port
        clash = (db.query(ReventOven).filter(ReventOven.ip == ip, ReventOven.port == port,
                                             ReventOven.id != o.id).first())
        if clash:
            raise _refuse("duplicate", "That address is already in the list.", 409)
        o.ip, o.port = ip, port
    if body.active is not None:
        o.active = body.active
    if body.position is not None:
        o.position = body.position
    if body.note is not None:
        o.note = body.note.strip() or None
    db.commit()
    return _register(db)


@admin_router.delete("/{oven_id}")
def delete_oven(oven_id: int, db: Session = Depends(get_db), _a=Depends(verify_admin)):
    """Only an oven nothing was ever collected from. One with history is
    switched off instead — its logs are the record."""
    o = db.get(ReventOven, oven_id)
    if o is None:
        raise _refuse("no_oven", "No such oven.", 404)
    if db.query(ReventOvenLog.id).filter(ReventOvenLog.oven_id == o.id).first() or o.status_at:
        raise _refuse("has_history", "This oven has collected data — switch it off instead.", 409)
    db.delete(o)
    db.commit()
    return _register(db)
