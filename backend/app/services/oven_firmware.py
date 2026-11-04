"""The oven board's firmware, handed to it over Wi-Fi (board firmware 1.3.0+).

ONE release is kept, on disk beside the APK's: ``backend/data/ovens/firmware/``
— ``<version>.bin`` and ``latest.json`` {version, sha256, size, published_at}
(gitignored, survives the deploy's ``reset --hard``). It is published from the
build Mac by ``tools/revent-oven/board/publish_firmware.sh`` with the same
publish key as the APK (``android_release.key_ok``) — never a commit.

``revent_ovens.plan()`` names the release; a board running another version
downloads it with its collector key (``GET /api/ovens/collector/firmware``),
checks the SHA-256 named here while writing it into its OTHER app slot, and
restarts into it. The new firmware keeps itself only once it has reached IMS;
otherwise the board's bootloader goes back to the one before by itself. To roll
the board back on purpose, publish the older build under a NEW version number
— a version that once failed on a board is not tried there again.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import tempfile
from datetime import datetime, timezone
from typing import Optional

# the board's app slot (tools/revent-oven/board — min_spiffs.csv: 0x1E0000)
MAX_BIN = 0x1E0000
MIN_BIN = 200 * 1024
VERSION = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}$")

_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "ovens", "firmware"))
_META = os.path.join(_DIR, "latest.json")

_ESP_IMAGE_MAGIC = 0xE9
_CHIP_ESP32S2 = 2                 # esp_image_header_t.chip_id
_APP_DESC_MAGIC = 0xABCD5432      # esp_app_desc_t, first thing in the first segment


class BadFirmware(ValueError):
    """Not a firmware image the oven board can run."""


def check(data: bytes, version: str) -> None:
    """Refuse anything that is not an ESP32-S2 app image of a sane size: the
    board would download it, find it unusable and try again every hour."""
    if not VERSION.match(version or ""):
        raise BadFirmware("the version is X.Y.Z")
    if not (MIN_BIN <= len(data) <= MAX_BIN):
        raise BadFirmware(f"{len(data)} bytes — an app image is {MIN_BIN}..{MAX_BIN}")
    if data[0] != _ESP_IMAGE_MAGIC:
        raise BadFirmware("not an ESP app image (no 0xE9 magic)")
    chip = struct.unpack_from("<H", data, 12)[0]
    if chip != _CHIP_ESP32S2:
        raise BadFirmware(f"built for chip id {chip}, not the ESP32-S2 (2)")
    if struct.unpack_from("<I", data, 32)[0] != _APP_DESC_MAGIC:
        raise BadFirmware("no app description — an app image, not a bootloader or a partition table?")


def latest() -> Optional[dict]:
    try:
        with open(_META, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict) or not VERSION.match(str(meta.get("version") or "")):
        return None
    if not os.path.isfile(path(meta["version"])):
        return None
    return meta


def path(version: str) -> str:
    if not VERSION.match(version or ""):
        raise BadFirmware("the version is X.Y.Z")
    return os.path.join(_DIR, f"{version}.bin")


def publish(data: bytes, version: str) -> dict:
    """Keep this build as THE release; the previous one is deleted."""
    check(data, version)
    os.makedirs(_DIR, exist_ok=True)
    meta = {
        "version": version,
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": len(data),
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    target = path(version)
    fd, tmp = tempfile.mkstemp(dir=_DIR, suffix=".part")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, target)
    fd, tmp = tempfile.mkstemp(dir=_DIR, suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    os.replace(tmp, _META)
    for name in os.listdir(_DIR):
        if name.endswith(".bin") and name != os.path.basename(target):
            try:
                os.remove(os.path.join(_DIR, name))
            except OSError:
                pass
    return meta


def for_plan() -> Optional[dict]:
    """What the board's plan carries: the release it should be running."""
    m = latest()
    if m is None:
        return None
    return {"version": m["version"], "sha256": m["sha256"], "size": m["size"]}
