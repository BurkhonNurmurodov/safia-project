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

import logging
import re
from typing import Optional
from urllib.parse import parse_qs, quote, urlparse

logger = logging.getLogger(__name__)

# Provider → the label shown on a card's corner badge. Keys are what lands in
# `education_lessons.provider`; adding one here means adding its host to the
# CSP's frame-src in main.py, and there is no way round that.
PROVIDERS = ("youtube", "loom", "vimeo")

# How a provider is NAMED to a person — on a notification card, in a log line.
# Here rather than at a call site because the frontend already carries its own
# copy for the card badge, and a third spelling is one too many.
LABELS = {"youtube": "YouTube", "loom": "Loom", "vimeo": "Vimeo"}


def label(provider: str) -> str:
    return LABELS.get(provider, provider or "")

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


# ── the poster image ─────────────────────────────────────────────────────────
# YouTube publishes a thumbnail at a URL derivable from the video id, so it
# needs no lookup. Loom and Vimeo do NOT: Loom's real thumbnail carries an
# opaque hash after the id
# (…/{id}-b5213f287fcef7f0.jpg), and no amount of reading the share URL yields
# it. The first cut of this feature GUESSED "…/{id}-00001.jpg" and every Loom
# card fell back to the grey poster; the guess returns 403 (S3 AccessDenied for
# a key that does not exist), which is also why the failure looked like a
# permissions problem rather than a wrong URL.
#
# So the hash is ASKED FOR, once, at publish time, through each provider's
# oEmbed endpoint, and the answer is STORED on the lesson. Nothing is fetched
# on a read path.

# Every provider publishes an oEmbed endpoint, and its answer is the ONE probe
# this module makes. It does two jobs at once:
#
#   * the POSTER — Loom's and Vimeo's thumbnail URLs carry an opaque hash that
#     only this call yields;
#   * the ACCESS — a 2xx means the video resolves for an anonymous caller, i.e.
#     for everybody. A 4xx means it does not.
#
# That second job is why the call is worth making even for YouTube, whose
# poster needs no lookup. A Loom video is workspace-private by DEFAULT, and a
# private embed renders as a BLACK RECTANGLE for anyone without access — while
# playing perfectly for the admin who published it, because their browser holds
# a Loom session. Without this probe the platform cannot tell the difference,
# and the people who find out are the leaders it was assigned to.
_OEMBED = {
    "youtube": "https://www.youtube.com/oembed?format=json&url={url}",
    "loom": "https://www.loom.com/v1/oembed?url={url}",
    "vimeo": "https://vimeo.com/api/oembed.json?url={url}",
}

# access values, in the payloads and on the lesson row
PUBLIC = "public"          # oEmbed resolved it for an anonymous caller
RESTRICTED = "restricted"  # it answered "no such video, to you"
UNKNOWN = "unknown"        # we could not ask (network, timeout, no endpoint)
_HTTP_TIMEOUT = 6.0


def probe(provider: str, video_id: str) -> dict:
    """``{"access": …, "thumb": url|None}`` — one oEmbed call, both answers.

    Best effort by design: it runs inside the admin's publish request, so it is
    tightly timed out, and anything unexpected degrades to UNKNOWN rather than
    failing the publish. UNKNOWN is deliberately NOT treated as restricted — a
    flaky network must not put a scary warning on a perfectly public video.
    """
    out = {"access": UNKNOWN, "thumb": None}
    tmpl = _OEMBED.get(provider)
    watch = rebuild(provider, video_id).get("watch")
    if not tmpl or not watch:
        return out

    data = None
    try:
        import httpx

        r = httpx.get(tmpl.format(url=quote(watch, safe="")),
                      timeout=_HTTP_TIMEOUT, follow_redirects=True)
        if r.status_code == 200:
            out["access"] = PUBLIC
            try:
                data = r.json()
            except Exception:
                data = None
        elif 400 <= r.status_code < 500:
            # The provider answered, and the answer is "not for you".
            out["access"] = RESTRICTED
            return out
    except Exception:
        logger.info("education: oembed probe failed for %s/%s", provider, video_id,
                    exc_info=True)
        return out

    # YouTube's poster is derivable and more predictable than oEmbed's, so it is
    # built rather than read back.
    if provider == "youtube":
        out["thumb"] = _verify(f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
        return out

    url = (data or {}).get("thumbnail_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        return out
    # Loom answers with an ANIMATED GIF preview — 5.4 MB for a one-minute
    # video, which is not a thing to put twenty of in a grid. The same key with
    # a .jpg extension is the static frame (~110 KB). The GIF is never used as
    # a fallback, because the weight is the whole objection.
    out["thumb"] = _verify(url[: -len(".gif")] + ".jpg") if url.endswith(".gif") \
        else _verify(url)
    return out


def fetch_thumb(provider: str, video_id: str) -> Optional[str]:
    """A verified poster URL for a freshly published lesson, or None.

    Best effort by design: it runs inside the admin's publish request, so it is
    tightly timed out and every failure — a dead network, a private video, a
    provider that changed its answer — returns None and leaves the card drawing
    its own poster. A lesson must never fail to publish because a thumbnail
    could not be found.

    Never returns a URL it has not just fetched successfully, so a stored
    thumbnail cannot render as a broken image.
    """
    return probe(provider, video_id)["thumb"]


def _verify(url: str) -> Optional[str]:
    """The URL back if it really serves an image right now, else None."""
    try:
        import httpx

        r = httpx.get(url, timeout=_HTTP_TIMEOUT, follow_redirects=True,
                      headers={"Range": "bytes=0-0"})
        ok = r.status_code in (200, 206) and \
            r.headers.get("content-type", "").startswith("image/")
        return url if ok else None
    except Exception:
        logger.info("education: thumbnail verify failed for %s", url, exc_info=True)
        return None
