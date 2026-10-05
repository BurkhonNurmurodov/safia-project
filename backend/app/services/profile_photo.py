"""THE way a profile photo is stored (`profile_photos`).

Two writers fill the table — an admin's upload on the profile page
(`routers/profiles.admin_set_photo`) and the one-off Verifix pass
(`services/verifix_profile_photos`) — and both go through here, so a photo
always lands in one shape: a square JPEG of at most ``SIDE`` px, re-encoded,
never the original bytes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO

from PIL import Image
from sqlalchemy.orm import Session

from app.models import ProfilePhoto

SIDE = 512
QUALITY = 88


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
