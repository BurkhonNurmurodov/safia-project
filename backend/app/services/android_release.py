"""The Android app's own updates (CLAUDE.md «The Android app»).

The app downloads every deployed build of the PAGES by itself (PageUpdates),
but the APK around them changes only when android/ does, and a sideloaded app
cannot replace itself silently. So the server holds the latest signed APK and
the app offers to install it (AppUpdates.java): it reads ``latest()`` through
``GET /api/android/latest`` and, when the versionCode is newer than its own,
downloads the file and hands it to Android's installer — the person taps
«Install» once.

The APK is PUBLISHED from the Mac that builds it (android/publish-release.sh),
never committed: 19 MB a release would bloat the repo past the cloud bundle's
100 MB limit within a few releases. The upload is authorised by a key only
that Mac holds; the server keeps just its SHA-256 (``PUBLISH_KEY_SHA256``), so
nothing secret is in git and nothing needs configuring on the server.

Every upload is READ before it is taken — the package name, the versionCode
and the certificate it is signed with. An APK signed with any other key would
be refused by every phone AFTER a 19 MB download each, so it is refused here
instead, against the same fingerprint /.well-known/assetlinks.json serves.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import struct
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Optional

PACKAGE = "uz.safiacorporate.ims"

# sha256 of the publish key in ~/.safia-android/signing/publish.key.
PUBLISH_KEY_SHA256 = "e84e71209d00e9a523b56e5d75cefd063a3bbe5705223317765a24cbdb135d5f"

MAX_APK = 80 << 20

_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "android"))
_META = os.path.join(_DIR, "latest.json")

_ATTR_VERSION_CODE = 0x0101021B
_ATTR_VERSION_NAME = 0x0101021C
_SIG_V2 = 0x7109871A
_SIG_V3 = 0xF05368C0


class BadApk(ValueError):
    """The upload is not an APK this app can be updated with."""


def key_ok(presented: Optional[str]) -> bool:
    if not presented:
        return False
    digest = hashlib.sha256(presented.strip().encode()).hexdigest()
    return len(PUBLISH_KEY_SHA256) == 64 and hmac.compare_digest(digest, PUBLISH_KEY_SHA256)


# ─── reading an APK ───────────────────────────────────────────────────────────

def _axml_manifest(data: bytes) -> dict:
    """The <manifest> element's package / versionCode / versionName, read off
    the binary XML Android packs AndroidManifest.xml into."""
    if len(data) < 8 or struct.unpack_from("<H", data, 0)[0] != 0x0003:
        raise BadApk("AndroidManifest.xml is not binary XML")
    strings: list[str] = []
    res_ids: list[int] = []
    pos = 8
    while pos + 8 <= len(data):
        ctype, hsize, csize = struct.unpack_from("<HHI", data, pos)
        if csize < 8:
            break
        if ctype == 0x0001:  # string pool
            count, _styles, flags, start, _sstart = struct.unpack_from("<IIIII", data, pos + 8)
            utf8 = bool(flags & 0x100)
            for i in range(count):
                off = pos + start + struct.unpack_from("<I", data, pos + hsize + 4 * i)[0]
                strings.append(_pool_string(data, off, utf8))
        elif ctype == 0x0180:  # resource map
            n = (csize - hsize) // 4
            res_ids = list(struct.unpack_from("<%dI" % n, data, pos + hsize))
        elif ctype == 0x0102:  # start element — the first one is <manifest>
            name_i = struct.unpack_from("<I", data, pos + 20)[0]
            if strings[name_i] != "manifest":
                raise BadApk("AndroidManifest.xml does not start with <manifest>")
            a_start, a_size, a_count = struct.unpack_from("<HHH", data, pos + 24)
            out: dict = {}
            for k in range(a_count):
                a = pos + 16 + a_start + k * a_size
                _ns, an, raw, _sz, _r0, dtype, value = struct.unpack_from("<IIIHBBI", data, a)
                rid = res_ids[an] if an < len(res_ids) else 0
                name = strings[an] if an < len(strings) else ""
                text = strings[raw] if raw != 0xFFFFFFFF else (
                    strings[value] if dtype == 0x03 else None)
                if name == "package":
                    out["package"] = text
                elif rid == _ATTR_VERSION_CODE or name == "versionCode":
                    out["version_code"] = int(text) if text is not None else value
                elif rid == _ATTR_VERSION_NAME or name == "versionName":
                    out["version_name"] = text
            return out
        pos += csize
    raise BadApk("AndroidManifest.xml has no <manifest>")


def _pool_string(data: bytes, off: int, utf8: bool) -> str:
    if utf8:
        n = data[off]
        off += 2 if n & 0x80 else 1
        n = data[off]
        if n & 0x80:
            n = ((n & 0x7F) << 8) | data[off + 1]
            off += 2
        else:
            off += 1
        return data[off:off + n].decode("utf-8", "replace")
    n = struct.unpack_from("<H", data, off)[0]
    off += 2
    if n & 0x8000:
        n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", data, off)[0]
        off += 2
    return data[off:off + 2 * n].decode("utf-16-le", "replace")


def _signer_certs(apk: bytes) -> list[str]:
    """SHA-256 of the certificate every v3 (else v2) signer carries — the
    fingerprint `apksigner --print-certs` prints and assetlinks.json names."""
    eocd = apk.rfind(b"PK\x05\x06", max(0, len(apk) - 65_557))
    if eocd < 0:
        raise BadApk("not a zip file")
    cd = struct.unpack_from("<I", apk, eocd + 16)[0]
    if cd < 32 or apk[cd - 16:cd] != b"APK Sig Block 42":
        raise BadApk("the APK is not signed (no v2/v3 signing block)")
    size = struct.unpack_from("<Q", apk, cd - 24)[0]
    pos, end = cd - size - 8 + 8, cd - 24
    blocks: dict[int, bytes] = {}
    while pos + 12 <= end:
        ln, bid = struct.unpack_from("<QI", apk, pos)
        blocks[bid] = apk[pos + 12:pos + 8 + ln]
        pos += 8 + ln
    block = blocks.get(_SIG_V3) or blocks.get(_SIG_V2)
    if block is None:
        raise BadApk("the APK is not signed with the v2/v3 scheme")

    def seq(buf: bytes) -> list[bytes]:
        items, p = [], 0
        while p + 4 <= len(buf):
            n = struct.unpack_from("<I", buf, p)[0]
            items.append(buf[p + 4:p + 4 + n])
            p += 4 + n
        return items

    out = []
    for signer in seq(seq(block)[0]):
        signed = seq(signer)[0]
        parts = seq(signed)
        certs = seq(parts[1]) if len(parts) > 1 else []
        if certs:
            out.append(hashlib.sha256(certs[0]).hexdigest())
    if not out:
        raise BadApk("the APK carries no signing certificate")
    return out


def read_apk(apk: bytes) -> dict:
    if len(apk) > MAX_APK:
        raise BadApk("file too large")
    try:
        with zipfile.ZipFile(io.BytesIO(apk)) as z:
            manifest = z.read("AndroidManifest.xml")
    except (zipfile.BadZipFile, KeyError) as e:
        raise BadApk(f"not an APK: {e}")
    try:
        info = _axml_manifest(manifest)
        certs = _signer_certs(apk)
    except (struct.error, IndexError, UnicodeError) as e:
        raise BadApk(f"unreadable APK: {e}")
    if not isinstance(info.get("version_code"), int) or not info.get("version_name"):
        raise BadApk("the manifest names no version")
    info["certs"] = certs
    info["size"] = len(apk)
    info["sha256"] = hashlib.sha256(apk).hexdigest()
    return info


def fingerprints(asset_links: list) -> set[str]:
    """assetlinks.json's «4D:09:…» fingerprints as bare lowercase hex."""
    out = set()
    for s in asset_links:
        for fp in s.get("target", {}).get("sha256_cert_fingerprints", []):
            out.add(fp.replace(":", "").lower())
    return out


# ─── the published release ────────────────────────────────────────────────────

def latest() -> Optional[dict]:
    try:
        with open(_META, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return None
    if not os.path.isfile(apk_path(meta.get("version_code"))):
        return None
    return meta


def apk_path(version_code) -> str:
    return os.path.join(_DIR, f"{int(version_code or 0)}.apk")


def publish(apk: bytes, allowed_certs: set[str]) -> dict:
    """Validate and store one APK as the latest release. Raises BadApk."""
    info = read_apk(apk)
    if info.get("package") != PACKAGE:
        raise BadApk(f"package {info.get('package')!r} is not {PACKAGE}")
    if not set(info["certs"]) & allowed_certs:
        raise BadApk("signed with a key assetlinks.json does not name — no phone could install it over the app")
    cur = latest()
    if cur and info["version_code"] < cur["version_code"]:
        raise BadApk(f"versionCode {info['version_code']} is older than the published {cur['version_code']}")
    if cur and info["version_code"] == cur["version_code"] and info["sha256"] != cur["sha256"]:
        raise BadApk(f"versionCode {info['version_code']} is already published with other bytes — raise versionCode")
    os.makedirs(_DIR, exist_ok=True)
    meta = {
        "version_code": info["version_code"],
        "version_name": info["version_name"],
        "size": info["size"],
        "sha256": info["sha256"],
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if cur and cur["sha256"] == info["sha256"]:
        return cur  # a re-run of the same publish
    _atomic_write(apk_path(info["version_code"]), apk)
    _atomic_write(_META, json.dumps(meta).encode())
    # Only the latest is ever offered; older files are dead weight.
    for name in os.listdir(_DIR):
        if name.endswith(".apk") and name != f"{info['version_code']}.apk":
            try:
                os.remove(os.path.join(_DIR, name))
            except OSError:
                pass
    return meta


def _atomic_write(path: str, data: bytes) -> None:
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
