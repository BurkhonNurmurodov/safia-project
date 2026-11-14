"""THE way a profile photo is stored (`profile_photos`).

Two writers fill the table — an admin's upload on the profile page
(`routers/profiles.admin_set_photo`) and the one-off Verifix pass
(`services/verifix_profile_photos`) — and both go through here, so a photo
always lands in one shape: a square JPEG of at most ``SIDE`` px, re-encoded,
never the original bytes.

…and THE way one is served small (`sized`, 2026-11-13). An avatar in a table
row is drawn at 20–48 px and was sent as the stored 512 px picture: the twenty
faces of «Brigadirlar reytingi» weighed 637 KB, against 53 KB at 96 px. A
caller names the size it draws at (`?s=`), `snap` rounds it up to one of
``SIZES``, and the scaled copy is made once per (photo, version, size) and
kept in memory — nothing is stored twice in the database.
"""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from io import BytesIO
from typing import Callable, Optional

from PIL import Image
from sqlalchemy.orm import Session

from app.models import ProfilePhoto

logger = logging.getLogger(__name__)

SIDE = 512
QUALITY = 88

# The sizes a photo is served at besides the stored one, in px. 96 covers a
# 48 px avatar on a 2× screen, 192 a 96 px one; anything larger gets the
# stored picture.
SIZES = (96, 192)
SMALL_QUALITY = 82
_SMALL_MAX = 800          # scaled copies kept in memory (3–8 KB each)
_small_lock = threading.Lock()
_small: "OrderedDict[tuple, bytes]" = OrderedDict()


def snap(side) -> Optional[int]:
    """The size a request for ``side`` px is served at: the smallest of
    ``SIZES`` that covers it. None = the stored picture (nothing asked, a size
    past the largest, or one that is not a number)."""
    try:
        side = int(side)
    except (TypeError, ValueError):
        return None
    if side <= 0:
        return None
    for s in SIZES:
        if side <= s:
            return s
    return None


def smaller(data: bytes, side: int) -> bytes:
    """A stored photo scaled down to fit ``side`` px. One already that small
    is returned as it is, never enlarged."""
    img = Image.open(BytesIO(data))
    if max(img.size) <= side:
        return data
    img = img.convert("RGB")
    img.thumbnail((side, side), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, "JPEG", quality=SMALL_QUALITY)
    return buf.getvalue()


def sized(key: str, version, side: int, load: Callable[[], Optional[bytes]]) -> Optional[bytes]:
    """``key``'s photo at ``side`` px. ``version`` is what changes when the
    photo does (its ``updated_at``); ``load`` reads the stored bytes and is
    called only when this size of this version has not been made yet. None =
    there is no photo. A picture that cannot be scaled is served as stored."""
    slot = (key, version, side)
    with _small_lock:
        hit = _small.get(slot)
        if hit is not None:
            _small.move_to_end(slot)
            return hit
    data = load()
    if data is None:
        return None
    data = bytes(data)
    try:
        out = smaller(data, side)
    except Exception:
        logger.exception("profile photo: could not scale %s to %s px", key, side)
        return data
    with _small_lock:
        _small[slot] = out
        _small.move_to_end(slot)
        while len(_small) > _SMALL_MAX:
            _small.popitem(last=False)
    return out


def square_jpeg(img: Image.Image, top: float = 0.5) -> bytes:
    """``img`` (already RGB and upright) cropped to a square and encoded.

    The square is centred across; ``top`` places it down a tall picture — 0.5
    is the centre (an upload), less keeps more of the top (a face photo, whose
    head sits above the middle)."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    upper = int((h - side) * min(max(top, 0.0), 1.0))
    img = img.crop((left, upper, left + side, upper + side))
    if side > SIDE:
        img = img.resize((SIDE, SIDE), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, "JPEG", quality=QUALITY)
    return buf.getvalue()


def store(db: Session, key: str, data: bytes) -> ProfilePhoto:
    """Set (or replace) ``key``'s photo. The caller commits."""
    now = datetime.now(timezone.utc)
    row = db.query(ProfilePhoto).filter_by(profile_key=key).first()
    if row:
        row.data, row.mime, row.updated_at = data, "image/jpeg", now
    else:
        row = ProfilePhoto(profile_key=key, mime="image/jpeg", data=data, updated_at=now)
        db.add(row)
    return row
