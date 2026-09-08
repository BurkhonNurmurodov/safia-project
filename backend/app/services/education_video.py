"""THE video-link parser for «Ta'lim» (/education).

One definition, asked by everyone: the admin wizard's live preview (through
``POST /api/education/resolve``), the create/edit writers that STORE the
result, and every read that renders a card. A second spelling — a JavaScript
twin in the wizard, say — is how a link that previews correctly gets stored as
something the player cannot open, so the browser never parses a URL itself.

Only three providers are accepted, and that is deliberate rather than a
starting point. Every embed is an ``<iframe>`` against a FIXED host, so the
app's Content-Security-Policy (`main.py`) can name those hosts in `frame-src`
and refuse everything else. A "paste any link" field cannot be expressed in a
CSP at all: it would need `frame-src *` (an open redirect into the app's own
frame) or, for a bare .mp4, `media-src *`. A rejected link tells the admin
which three are supported, which is a better outcome than a lesson that saves
and then renders a grey rectangle on every leader's phone.

`thumb` is None for Vimeo on purpose — Vimeo has no static thumbnail URL, only
an API call — and the card draws its own poster in that case. Guessing a URL
that 404s is worse than knowing there isn't one.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

# Provider → the label shown on a card's corner badge. Keys are what lands in
# `education_lessons.provider`; adding one here means adding its host to the
# CSP's frame-src in main.py, and there is no way round that.
PROVIDERS = ("youtube", "loom", "vimeo")

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
_NUM_ID = re.compile(r"^\d{6,12}$")
_LOOM_ID = re.compile(r"^[A-Za-z0-9]{16,64}$")


class BadVideoUrl(ValueError):
    """The link names no supported provider, or names one with no id in it."""


def _host(u: str) -> str:
    return (urlparse(u).hostname or "").lower().removeprefix("www.")


def _youtube_id(u: str) -> Optional[str]:
    host, p = _host(u), urlparse(u)
    path = p.path.strip("/")
    if host == "youtu.be":
        return path.split("/")[0] or None
    if host not in ("youtube.com", "m.youtube.com", "youtube-nocookie.com"):
        return None
    if path.startswith(("embed/", "shorts/", "live/", "v/")):
        return path.split("/", 1)[1].split("/")[0] or None
    return (parse_qs(p.query).get("v") or [None])[0]


def _loom_id(u: str) -> Optional[str]:
    if _host(u) != "loom.com":
        return None
    parts = urlparse(u).path.strip("/").split("/")
    # /share/<id>, /embed/<id>, and the older /v/<id>
    if len(parts) >= 2 and parts[0] in ("share", "embed", "v"):
        return parts[1] or None
    return None


def _vimeo_id(u: str) -> Optional[str]:
    host = _host(u)
    if host not in ("vimeo.com", "player.vimeo.com"):
        return None
    parts = [s for s in urlparse(u).path.strip("/").split("/") if s]
    if parts and parts[0] == "video":
        parts = parts[1:]
    return parts[0] if parts and parts[0].isdigit() else None


def parse(url: str) -> dict:
    """``{provider, video_id, embed, thumb, watch}`` or raise :class:`BadVideoUrl`.

    Never trusts the id shape it extracted — a path segment that is not a
    plausible id is a link the player would open onto an error page, so it is
    refused here where the admin can still fix it.
    """
    raw = (url or "").strip()
    if not raw:
        raise BadVideoUrl("empty")
    if "//" not in raw:                     # "youtu.be/x" pasted without a scheme
        raw = f"https://{raw}"
    if urlparse(raw).scheme not in ("http", "https"):
        raise BadVideoUrl("scheme")

    vid = _youtube_id(raw)
    if vid and _YT_ID.match(vid):
        return {
            "provider": "youtube", "video_id": vid,
            # -nocookie is the same player without the ad/tracking cookie; the
            # audience here is a shopfloor phone, not an advertising profile.
            "embed": f"https://www.youtube-nocookie.com/embed/{vid}?rel=0&modestbranding=1",
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "watch": f"https://www.youtube.com/watch?v={vid}",
        }

    vid = _loom_id(raw)
    if vid and _LOOM_ID.match(vid):
        return {
            "provider": "loom", "video_id": vid,
            "embed": f"https://www.loom.com/embed/{vid}",
            "thumb": f"https://cdn.loom.com/sessions/thumbnails/{vid}-00001.jpg",
            "watch": f"https://www.loom.com/share/{vid}",
        }

    vid = _vimeo_id(raw)
    if vid and _NUM_ID.match(vid):
        return {
            "provider": "vimeo", "video_id": vid,
            "embed": f"https://player.vimeo.com/video/{vid}",
            # Vimeo publishes no static thumbnail URL — the card draws its own.
            "thumb": None,
            "watch": f"https://vimeo.com/{vid}",
        }

    raise BadVideoUrl("unsupported")


def rebuild(provider: str, video_id: str) -> dict:
    """The embed/thumb/watch triple for an ALREADY STORED lesson.

    Reads are served from this rather than from a stored embed URL, so a change
    to a player parameter (the `rel=0` above, a provider retiring a host) reaches
    every lesson ever created at the next deploy instead of only new ones.
    """
    if provider == "youtube":
        return {"embed": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1",
                "thumb": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "watch": f"https://www.youtube.com/watch?v={video_id}"}
    if provider == "loom":
        return {"embed": f"https://www.loom.com/embed/{video_id}",
                "thumb": f"https://cdn.loom.com/sessions/thumbnails/{video_id}-00001.jpg",
                "watch": f"https://www.loom.com/share/{video_id}"}
    if provider == "vimeo":
        return {"embed": f"https://player.vimeo.com/video/{video_id}",
                "thumb": None,
                "watch": f"https://vimeo.com/{video_id}"}
    return {"embed": None, "thumb": None, "watch": None}
