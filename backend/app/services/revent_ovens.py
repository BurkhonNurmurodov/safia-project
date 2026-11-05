"""«Pechlar» — what the oven COLLECTOR sends, and how it is kept.

The ovens are on the factory LAN and the server cannot reach them, so a
collector there (a laptop for the test, later a small always-on device) reads
each oven with the three read-only calls of `tools/revent-oven/revent_oven.py`
and posts the answers here (`routers/ovens.py`, `/api/ovens/collector/*`):

- the live status every minute — the oven's own lines, as read;
- each day log file whenever it changed — whole, or only the bytes added since
  the copy kept here (`offset` = the size this side holds), checked against the
  whole file's SHA-256 the collector sends, so a file that did not simply grow
  is refused (409) and sent again whole;
- ServiceData.txt (running-hour counters) and OvenSettings.xml when they change.

The collector learns which ovens to read, and what is already here, from
`plan()`. Nothing in this module or the collector ever writes to an oven.

**The collector key** is checked against `COLLECTOR_KEYS` — SHA-256 digests in
code, the ops door's pattern: the key itself lives only on the collector
(`~/.safia/oven-collector.key` on the test laptop), never in git or the DB. It
can post oven readings and read the plan, nothing else. A new collector is a
new digest here.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import zlib
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import AppSetting, ReventCollector, ReventOven, ReventOvenLog
from app.services import revent_log

log = logging.getLogger(__name__)

# digest → the collector's name, printed on the page («seen by …»).
COLLECTOR_KEYS = {
    "ca0bb11a13a242a8348e307cc1e875d47a241ed72ca763798bea6413d68ef374": "laptop",
    # the always-on ESP32-S2 board (tools/revent-oven/board/); its key is
    # ~/.safia/oven-board.key on the build Mac and in the board's NVS
    "434b575182296b1e31932ab5932a5a14712a85ab06a5599f66de1a824804e50e": "board",
}

# How often the collector asks (seconds). Served by plan(), so changing the
# pace is a deploy here and nothing on the collector.
POLL = {"status_s": 60, "logs_s": 600, "settings_s": 3600,
        "ping_s": 10}   # a heartbeat between rounds (board firmware 1.1+)

MAX_FILE = 8 * 1024 * 1024          # one log file, raw — a day is ~250 KB
MAX_STATUS_LINES = 80

# How many of an oven's stored log files plan() lists. The oven keeps its 7
# newest day files, and the collector needs the size and SHA-256 of exactly
# those; a file the plan leaves out is simply sent whole again. The board reads
# the plan into its small internal RAM every minute, so listing every file IMS
# has ever kept (one more per oven per day, forever) would run it out of memory.
PLAN_LOGS = 8
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
LOG_NAME = re.compile(r"^\d{1,12}\.log$")
SERVICE_NAME = "ServiceData.txt"


def now() -> datetime:
    return datetime.now(timezone.utc)


def collector_of(presented: Optional[str]) -> Optional[str]:
    """The collector a key belongs to, or None."""
    if not presented:
        return None
    digest = hashlib.sha256(presented.strip().encode()).hexdigest()
    for known, name in COLLECTOR_KEYS.items():
        if hmac.compare_digest(digest, known):
            return name
    return None


def plan_logs(rows) -> dict:
    """One oven's stored files the plan lists: the PLAN_LOGS newest by name
    (the oven numbers its day files upward; the board orders them by length,
    then text) together with the PLAN_LOGS the collector sent last — the second
    set covers an oven that starts its numbering over, and a file re-sent
    because the plan left it out (save_log stamps it) is listed from then on.
    `rows` carry name, size, sha256, updated_at and id."""
    by_name = sorted(rows, key=lambda r: (len(r.name), r.name), reverse=True)[:PLAN_LOGS]
    by_time = sorted(rows, key=lambda r: (r.updated_at or _EPOCH, r.id), reverse=True)[:PLAN_LOGS]
    keep = {r.name for r in by_name} | {r.name for r in by_time}
    return {r.name: {"size": r.size, "sha256": r.sha256} for r in rows if r.name in keep}


def plan(db: Session) -> dict:
    """What the collector should read, and what is already kept here — of each
    oven's log files only those it can still be holding (`plan_logs`)."""
    ovens = (db.query(ReventOven).filter(ReventOven.active.is_(True))
             .order_by(ReventOven.position, ReventOven.id).all())
    ids = [o.id for o in ovens]
    stored: dict[int, list] = {i: [] for i in ids}
    if ids:
        for r in (db.query(ReventOvenLog.oven_id, ReventOvenLog.name, ReventOvenLog.size,
                           ReventOvenLog.sha256, ReventOvenLog.updated_at, ReventOvenLog.id)
                  .filter(ReventOvenLog.oven_id.in_(ids))):
            stored[r.oven_id].append(r)
    files = {oid: plan_logs(rs) for oid, rs in stored.items()}
    from app.services import oven_firmware   # lazy: a leaf, no import loop
    return {
        "poll": POLL,
        # the firmware the board should be running (firmware 1.3.0+ updates itself)
        "firmware": oven_firmware.for_plan(),
        "ovens": [{"id": o.id, "name": o.name, "ip": o.ip, "port": o.port,
                   "settings_sha256": o.settings_sha, "logs": files.get(o.id, {})}
                  for o in ovens],
    }


def save_status(db: Session, oven: ReventOven, lines: Optional[list], error: Optional[str],
                collector: str) -> None:
    t = now()
    oven.tried_at = t
    oven.collector = collector
    if error:
        oven.error = str(error)[:500]
        return
    oven.status = [str(x)[:500] for x in (lines or [])][:MAX_STATUS_LINES]
    oven.status_at = t
    oven.error = None


class Refused(Exception):
    """A file this side will not take as sent; `size` is what it holds."""

    def __init__(self, reason: str, size: int = 0):
        super().__init__(reason)
        self.reason, self.size = reason, size


def save_log(db: Session, oven: ReventOven, name: str, offset: int, chunk: bytes,
             size: int, sha256: str) -> ReventOvenLog:
    """Store one day log file: `chunk` is the file from `offset` on; `size` and
    `sha256` describe the WHOLE file the collector holds."""
    if not LOG_NAME.match(name or ""):
        raise Refused("bad_name")
    if size > MAX_FILE or size < 0 or offset < 0 or offset + len(chunk) != size:
        raise Refused("bad_size")
    row = (db.query(ReventOvenLog)
           .filter(ReventOvenLog.oven_id == oven.id, ReventOvenLog.name == name).first())
    if offset:
        if row is None or row.size != offset:
            raise Refused("offset", row.size if row else 0)
        whole = zlib.decompress(row.data) + chunk
    else:
        whole = chunk
    if hashlib.sha256(whole).hexdigest() != (sha256 or "").lower():
        raise Refused("sha", row.size if row else 0)
    first, last = revent_log.span(whole)
    if row is None:
        row = ReventOvenLog(oven_id=oven.id, name=name)
        db.add(row)
    row.data = zlib.compress(whole, 6)
    row.size = len(whole)
    row.sha256 = hashlib.sha256(whole).hexdigest()
    row.first_at, row.last_at = first, last
    row.day = first.date() if first else None
    # stamped even when the bytes did not change: a file sent again whole
    # because plan() left it out is then among the newest and listed again
    row.updated_at = now()
    oven.logs_at = now()
    return row


def save_service(oven: ReventOven, text: str) -> None:
    oven.service = (text or "")[:20000]
    oven.service_at = now()


def plain_xml(xml: bytes) -> bool:
    """No DOCTYPE and no entity: the oven's settings file has neither, and a
    document carrying one is not parsed here (no defusedxml on the box)."""
    head = xml[:4096].upper()
    return b"<!DOCTYPE" not in head and b"<!ENTITY" not in xml.upper()


def save_settings(oven: ReventOven, xml: bytes) -> None:
    if len(xml) > MAX_FILE:
        raise Refused("bad_size")
    if not plain_xml(xml):
        raise Refused("bad_xml")
    oven.settings = zlib.compress(xml, 6)
    oven.settings_sha = hashlib.sha256(xml).hexdigest()
    oven.settings_at = now()


def settings_xml(oven: ReventOven) -> Optional[bytes]:
    return zlib.decompress(oven.settings) if oven.settings else None


def log_bytes(row: ReventOvenLog) -> bytes:
    return zlib.decompress(row.data)


# ── who is reading the ovens ──────────────────────────────────────────────────
# Every collector request is a sign of life. The board (firmware 1.1+) also
# sends a heartbeat every POLL["ping_s"] and describes itself in the
# X-Collector-Info header ("fw=1.1.0;up=812;rssi=-59;ssid=alisa;ip=…"); from
# 1.2.0 also the way out it used, `net` ("eth" | "wifi"), and an Ethernet
# link's speed, `link` (Mbit/s). `ip` is the board's address on that network.
# From 1.4.2 also `blk` (the largest free block of RAM, KB), `sent` (seconds
# since IMS last TOOK a reading, by the board's own count) and `err` (why its
# last post did not reach IMS, in the board's own words) — the three things that
# tell «the board cannot send» from «IMS refused it» from «IMS took it and kept
# nothing» when the card says the device is online and no status arrives.

INFO_KEYS = {"fw", "up", "rssi", "ssid", "ip", "heap", "psram", "blk", "sent", "err", "ping", "kind", "host",
             "net", "link"}


def parse_info(header: Optional[str]) -> dict:
    out = {}
    for part in (header or "").split(";")[:20]:
        k, _, v = part.partition("=")
        k, v = k.strip().lower(), v.strip()
        if k in INFO_KEYS and v:
            out[k] = v[:64]
    return out


def note_contact(db: Session, name: str, what: str, ip: str, user_agent: str, info_header: Optional[str]) -> None:
    """One collector request arrived: remember when and what it said. Its own
    small transaction, so a refused file still counts as a sign of life."""
    info = parse_info(info_header)
    values = {"name": name, "last_seen": now(), "last_path": what[:20], "remote_ip": (ip or "")[:64],
              "user_agent": (user_agent or "")[:120]}
    if info:
        values["info"] = info
    stmt = pg_insert(ReventCollector).values(**values)
    stmt = stmt.on_conflict_do_update(index_elements=[ReventCollector.name],
                                      set_={k: v for k, v in values.items() if k != "name"})
    try:
        db.execute(stmt)
        db.commit()
    except Exception:                   # never let the bookkeeping refuse a reading
        db.rollback()
        log.exception("[OVENS] could not note the collector contact")


# ── what the collector door refused ──────────────────────────────────────────
# A request refused BEFORE its handler (a body that is not JSON, a reading that
# does not validate) leaves no trace on the collector row — the device looks
# online while nothing it sends is kept (2026-11-05: the board pinged and asked
# for its plan for half an hour, and not one status post was recorded). The
# last few refusals are kept per collector, in app_settings, and shown on the
# «Kollektor qurilmasi» card.
TROUBLE_KEY = "oven_collector_trouble:{}"
TROUBLE_KEEP = 8
STATUS_BODY_MAX = 256 * 1024


def _body_head(raw: bytes, n: int = 160) -> str:
    return (raw or b"")[:n].decode("utf-8", errors="backslashreplace")


def note_trouble(db: Session, name: str, what: str, reason: str, *, http: Optional[int] = None,
                 size: Optional[int] = None, head: Optional[bytes] = None) -> None:
    """Keep one refusal (or a reading this side had to repair) for the card.
    Its own transaction; never raises."""
    try:
        key = TROUBLE_KEY.format(name)
        row = db.get(AppSetting, key)
        try:
            items = json.loads(row.value) if row else []
            if not isinstance(items, list):
                items = []
        except ValueError:
            items = []
        items.insert(0, {"at": now().isoformat(), "what": what[:20], "reason": str(reason)[:300],
                         "http": http, "size": size, "head": _body_head(head) if head else None})
        value = json.dumps(items[:TROUBLE_KEEP], ensure_ascii=False)
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("[OVENS] could not keep the collector refusal")
    log.warning("[OVENS] %s %s: %s", name, what, reason)


def note_refused_request(key_header: Optional[str], bearer: Optional[str], path: str, reason: str,
                         size: Optional[int] = None) -> None:
    """For the exception handler: a collector request FastAPI refused before
    its handler ran. Opens its own session; only a known key is noted."""
    v = (key_header or "").strip()
    if not v:
        scheme, _, token = (bearer or "").partition(" ")
        v = token.strip() if scheme.lower() == "bearer" else ""
    name = collector_of(v)
    if not name:
        return
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        what = path.rstrip("/").rsplit("/", 1)[-1] or path
        note_trouble(db, name, what, reason, http=422, size=size)
    finally:
        db.close()


def trouble_of(db: Session, name: str) -> list:
    row = db.get(AppSetting, TROUBLE_KEY.format(name))
    if not row:
        return []
    try:
        items = json.loads(row.value)
        return items if isinstance(items, list) else []
    except ValueError:
        return []


def parse_status_body(raw: bytes) -> tuple[Optional[list], list[str]]:
    """The status post, read leniently: bytes that are not UTF-8 are replaced
    (a stray byte in one oven's line must not lose every oven's status), and a
    reading that does not hold together is skipped and named, never the batch.
    Returns (readings | None when the body is unusable, notes)."""
    notes: list[str] = []
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        text = raw.decode("utf-8", errors="replace")
        notes.append(f"not UTF-8 at byte {e.start} — replaced")
    try:
        obj = json.loads(text)
    except ValueError as e:
        return None, notes + [f"not JSON: {e}"]
    items = obj.get("readings") if isinstance(obj, dict) else None
    if not isinstance(items, list):
        return None, notes + ["no readings list"]
    out = []
    for i, it in enumerate(items[:50]):
        if not isinstance(it, dict):
            notes.append(f"reading {i}: not an object")
            continue
        try:
            oid = int(it.get("oven_id"))
        except (TypeError, ValueError):
            notes.append(f"reading {i}: no oven_id")
            continue
        lines = it.get("lines")
        if lines is not None and not isinstance(lines, list):
            notes.append(f"reading {i}: lines is not a list")
            lines = None
        err = it.get("error")
        out.append({"oven_id": oid,
                    "lines": [("" if x is None else str(x)) for x in lines] if lines is not None else None,
                    "error": None if err is None else str(err)})
    if len(items) > 50:
        notes.append(f"{len(items) - 50} readings over the 50 a post may carry")
    return out, notes


def _expect_s(row: ReventCollector) -> int:
    """How often this device should be heard from: its heartbeat, else a round."""
    try:
        ping = int((row.info or {}).get("ping") or 0)
    except ValueError:
        ping = 0
    return ping if 5 <= ping <= 120 else POLL["status_s"]


def _iso_or_none(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _age(t: datetime, dt) -> Optional[float]:
    return round(max(0.0, (t - dt).total_seconds()), 1) if dt else None


def devices(db: Session) -> dict:
    t = now()
    out = []
    status_at: dict = {}
    for name, at in (db.query(ReventOven.collector, ReventOven.tried_at)
                     .filter(ReventOven.active.is_(True), ReventOven.collector.isnot(None))):
        if at and (name not in status_at or at > status_at[name]):
            status_at[name] = at
    file_at = None
    for o in db.query(ReventOven).filter(ReventOven.active.is_(True)):
        for at in (o.logs_at, o.settings_at, o.service_at):
            if at and (file_at is None or at > file_at):
                file_at = at
    for r in db.query(ReventCollector).order_by(ReventCollector.name):
        age = max(0.0, (t - r.last_seen).total_seconds()) if r.last_seen else None
        expect = _expect_s(r)
        online_s = max(30, expect * 2 + 15)    # two missed beats are not yet «offline»
        ua = r.user_agent or ""
        fw = (r.info or {}).get("fw") or (ua.split("/", 1)[1] if ua.startswith("safia-oven") and "/" in ua else None)
        out.append({
            "name": r.name, "last_seen": r.last_seen.isoformat() if r.last_seen else None,
            "age_s": round(age, 1) if age is not None else None,
            "online": age is not None and age <= online_s,
            "online_s": online_s, "wait_s": min(90, expect + 20), "expect_s": expect,
            "last_path": r.last_path, "remote_ip": r.remote_ip, "fw": fw, "info": r.info or {},
            # what this collector actually got KEPT here — online is only «it calls in»
            "status_at": _iso_or_none(status_at.get(r.name)),
            "status_age_s": _age(t, status_at.get(r.name)),
            "file_at": _iso_or_none(file_at),
            "trouble": trouble_of(db, r.name),
        })
    from app.services import oven_firmware
    rel = oven_firmware.latest()
    return {"now": t.isoformat(), "devices": out,
            "firmware": {"version": rel["version"], "published_at": rel["published_at"]} if rel else None}

