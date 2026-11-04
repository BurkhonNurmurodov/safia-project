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
import logging
import re
import zlib
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import ReventOven, ReventOvenLog
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
POLL = {"status_s": 60, "logs_s": 600, "settings_s": 3600}

MAX_FILE = 8 * 1024 * 1024          # one log file, raw — a day is ~250 KB
MAX_STATUS_LINES = 80
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


def plan(db: Session) -> dict:
    """What the collector should read, and what is already kept here."""
    ovens = (db.query(ReventOven).filter(ReventOven.active.is_(True))
             .order_by(ReventOven.position, ReventOven.id).all())
    ids = [o.id for o in ovens]
    files: dict[int, dict] = {i: {} for i in ids}
    if ids:
        for oid, name, size, sha in (db.query(ReventOvenLog.oven_id, ReventOvenLog.name,
                                              ReventOvenLog.size, ReventOvenLog.sha256)
                                     .filter(ReventOvenLog.oven_id.in_(ids))):
            files[oid][name] = {"size": size, "sha256": sha}
    return {
        "poll": POLL,
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
