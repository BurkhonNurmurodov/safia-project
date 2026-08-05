"""Minimal Gemini REST client — vision + JSON, nothing else.

Deliberately not the google-genai SDK: this host installs dependencies by hand
and `httpx` is already a dependency, so one file of REST beats a new package on
the deploy checklist. The whole surface is `generate_json`, because every caller
here wants a schema-shaped object, never prose.

The key lives in backend/.env (gitignored) as GEMINI_API_KEY. Blank key ⇒
`available()` is False and callers must not queue work; nothing here ever
raises just because the feature is switched off.
"""
import base64
import io
import json
import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_TIMEOUT = httpx.Timeout(120.0, connect=20.0)

# Images are resized before upload: a 4000px phone photo costs many times the
# tokens of a 1280px one and adds nothing a reviewer can read that the smaller
# one cannot. Free-tier quota is the binding constraint, so this is quota, not
# bandwidth, optimisation.
_MAX_EDGE = 1280
_JPEG_QUALITY = 82


class GeminiError(RuntimeError):
    """Any non-retryable failure (bad request, no candidate, unparseable JSON)."""


class GeminiQuotaError(GeminiError):
    """429 / RESOURCE_EXHAUSTED — the free tier's per-minute or per-day cap.

    Callers stop the whole drain on this rather than burning through the rest
    of the queue collecting identical failures.
    """


def available() -> bool:
    return bool((settings.gemini_api_key or "").strip())


def shrink_image(data: bytes, mime: str = "image/jpeg") -> tuple[bytes, str]:
    """Downscale to `_MAX_EDGE` when Pillow is present. Falls back to the
    original bytes for anything Pillow can't open (and for animated/odd
    formats) — a slightly expensive request beats a dropped proof photo."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is in requirements
        return data, mime
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        if max(img.size) <= _MAX_EDGE and (mime or "").endswith(("jpeg", "jpg")):
            return data, "image/jpeg"
        img = img.convert("RGB")
        img.thumbnail((_MAX_EDGE, _MAX_EDGE), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as exc:
        log.debug("gemini: image shrink skipped (%s)", exc)
        return data, mime or "image/jpeg"


def generate_json(
    prompt: str,
    images: list[tuple[bytes, str]],
    schema: dict,
    *,
    model: str | None = None,
) -> dict:
    """One vision call constrained to `schema`. Returns the parsed object.

    `images` is [(bytes, mime), …]; they are shrunk here so no caller has to
    remember to. Raises GeminiQuotaError on 429, GeminiError on anything else
    that leaves us without a usable object.
    """
    key = (settings.gemini_api_key or "").strip()
    if not key:
        raise GeminiError("GEMINI_API_KEY is not configured")
    mdl = (model or settings.gemini_model or "gemini-2.5-flash").strip()

    parts: list[dict] = [{"text": prompt}]
    for raw, mime in images:
        data, mime = shrink_image(raw, mime)
        parts.append({"inline_data": {"mime_type": mime,
                                      "data": base64.b64encode(data).decode()}})

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            # Deterministic: the same photo must not flip between flagged and
            # clean on a retry — an operator would never trust the verdict.
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    url = f"{_BASE}/{mdl}:generateContent"
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            res = client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise GeminiError(f"Gemini unreachable: {exc}") from exc

    if res.status_code == 429:
        raise GeminiQuotaError(_detail(res) or "Rate limit reached")
    if res.status_code >= 500:
        # Transient upstream — same handling as quota for the caller's purposes
        # (stop, leave the row pending, retry on the next drain).
        raise GeminiQuotaError(f"Gemini {res.status_code}: {_detail(res)}")
    if res.status_code != 200:
        raise GeminiError(f"Gemini {res.status_code}: {_detail(res)}")

    try:
        payload = res.json()
        cand = (payload.get("candidates") or [])[0]
        text = "".join(
            p.get("text", "") for p in (cand.get("content") or {}).get("parts") or []
        )
    except (ValueError, IndexError, KeyError, TypeError) as exc:
        raise GeminiError(f"Unreadable Gemini response: {exc}") from exc

    if not text.strip():
        # Safety blocks and MAX_TOKENS land here; the finish reason is the only
        # useful thing to record against the row.
        raise GeminiError(f"Empty response (finish={cand.get('finishReason')})")
    try:
        out = json.loads(text)
    except ValueError as exc:
        raise GeminiError(f"Response was not JSON: {exc}") from exc
    if not isinstance(out, dict):
        raise GeminiError("Response JSON was not an object")
    return out


def _detail(res: httpx.Response) -> str:
    try:
        return str((res.json().get("error") or {}).get("message") or "")[:400]
    except ValueError:
        return res.text[:400]
