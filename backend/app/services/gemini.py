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
# …but never squeeze the SHORT edge below this. A phone screenshot is very tall,
# so capping its long edge alone drags its width down to ~575px — and the OS
# status bar is both the smallest text in the frame and the ONLY proof of when
# the shot was taken, so that is precisely the row of pixels a proof review
# cannot afford to blur away. Portrait proofs keep ~1.3× the width they had;
# landscape photos are unaffected, since their short edge never binds first.
_MIN_EDGE = 768
_JPEG_QUALITY = 82


class GeminiError(RuntimeError):
    """Any non-retryable failure (bad request, no candidate, unparseable JSON).

    `kind` names the failure for the «AI kalitlari» tab and its alert
    (services/ai_features): quota · unavailable · key · credit · model ·
    no_key · bad_response · network · other. It never decides control flow —
    the CLASS does that, exactly as before (`GeminiQuotaError` stops a drain).
    """
    kind = "other"

    def __init__(self, message: str = "", kind: str | None = None):
        super().__init__(message)
        if kind:
            self.kind = kind


class GeminiQuotaError(GeminiError):
    """429 / RESOURCE_EXHAUSTED — the free tier's per-minute or per-day cap.

    Callers stop the whole drain on this rather than burning through the rest
    of the queue collecting identical failures. A transient 5xx is raised as
    this class too (the drain must stop the same way), told apart by `kind`
    «unavailable».
    """
    kind = "quota"


class GeminiAuthError(GeminiError):
    """The provider rejected the KEY itself — a 401/403, or Gemini's 400 «API
    key not valid». Raised by `list_models` of BOTH transports (claude_ai.py
    reuses these three classes: they are the reviewer's error contract, not
    Gemini's), so a key being saved is refused as a typo rather than stored to
    fail every review.
    """
    kind = "key"


def _key_refused(res) -> bool:
    """Gemini answers a bad key with 400 «API key not valid» (or 401/403)."""
    if res.status_code in (401, 403):
        return True
    if res.status_code == 400:
        d = _detail(res).lower()
        return "api key" in d or "api_key" in d
    return False


def _model_missing(res) -> bool:
    """A model id Gemini does not serve: 404, or 400 «… is not supported»."""
    if res.status_code == 404:
        return True
    d = _detail(res).lower()
    return res.status_code == 400 and "model" in d and ("not found" in d or "not supported" in d)


def meter_usage(meter: dict | None, usage: dict | None) -> None:
    """Fill a caller's meter from Gemini's `usageMetadata`: tokens IN (the
    prompt) and OUT (the answer plus the thinking Google bills as output)."""
    if meter is None or not isinstance(usage, dict):
        return
    meter["in"] = int(usage.get("promptTokenCount") or 0) + int(usage.get("toolUsePromptTokenCount") or 0)
    meter["out"] = int(usage.get("candidatesTokenCount") or 0) + int(usage.get("thoughtsTokenCount") or 0)


# ── where the key comes from ─────────────────────────────────────────────────
# Two sources, env first:
#
#   1. `GEMINI_API_KEY` in backend/.env — the original, and still the right home
#      when somebody has a shell on the box. It wins, so a key pinned by an
#      operator can never be overridden from a web form.
#   2. `app_settings["gemini_api_key"]`, SEALED — set from the admin UI by
#      whoever runs the plant. This exists because setting (1) requires SSH or
#      repo-admin rights on the CI, and an operator who has neither cannot
#      switch the feature on at all, which is how it sat dark after being built.
#
# The DB copy is sealed with `web_auth.seal_password` — the same encrypt-then-MAC
# used for recoverable web-login passwords, keyed off SECRET_KEY, which lives in
# .env and never in the database. So a `dbdump` .sql.gz carries ciphertext, not
# a live API key, which is the whole reason it can be stored there at all.
KEY_SETTING = "gemini_api_key"

# The drain asks `available()` per row, so an uncached read would be a query per
# photo. Short TTL rather than a permanent cache: a key set in the admin UI has
# to take effect without a restart, which is the entire point of storing it here.
_KEY_TTL = 30.0
_key_cache: tuple[float, str] = (0.0, "")


def _stored_key() -> str:
    """The sealed key from app_settings, or "" — never raises. A failure here
    must degrade to "no key" (feature inert), never take down a request."""
    import time

    global _key_cache
    now = time.monotonic()
    if now - _key_cache[0] < _KEY_TTL:
        return _key_cache[1]

    val = ""
    try:
        from app.database import SessionLocal
        from app.models import AppSetting
        from app.web_auth import open_password

        db = SessionLocal()
        try:
            # The saved-key store first (services/ai_keys): the active Gemini
            # row, else the newest one — then the single-key era's sealed
            # setting, which `ai_keys.adopt_legacy` copies into a row at boot
            # and `delete_key` removes together with that row.
            from app.models import AiKey

            krow = (db.query(AiKey).filter(AiKey.provider == "gemini")
                    .order_by(AiKey.active.desc(), AiKey.id.desc()).first())
            if krow is not None and krow.key_enc:
                val = (open_password(krow.key_enc) or "").strip()
            if not val:
                row = db.query(AppSetting).filter_by(key=KEY_SETTING).first()
                if row and row.value:
                    val = (open_password(row.value) or "").strip()
        finally:
            db.close()
    except Exception:
        log.exception("gemini: could not read the stored API key")
        val = ""

    _key_cache = (now, val)
    return val


def invalidate_key_cache() -> None:
    """Called by the admin endpoint so a newly saved key works on the next
    request instead of up to _KEY_TTL later."""
    global _key_cache
    _key_cache = (0.0, "")


def api_key() -> str:
    """THE resolver. Every caller goes through here — a second place reading
    `settings.gemini_api_key` directly would ignore the admin-set key and report
    the feature as off while it is on."""
    return (settings.gemini_api_key or "").strip() or _stored_key()


def key_source() -> str:
    """Which of the two provided the live key — shown in the admin UI so an
    operator can see why the value they just typed is not the one in use."""
    if (settings.gemini_api_key or "").strip():
        return "env"
    return "db" if _stored_key() else "none"


def available() -> bool:
    return bool(api_key())


# ── which model ──────────────────────────────────────────────────────────────
# Always a `-latest` ALIAS, never a pinned version: `gemini-2.5-flash` still
# appears in ListModels but generateContent 404s it for keys created after it
# was retired, and the same will happen to every pinned id eventually.
#
# Three, because they answer different constraints and the binding one
# changes: `pro` judges best (the platform's model from 2026-09-26, the
# operator's call) but is the slowest and the dearest per call, `flash` judges
# the "is this photo even about this task" question well at a fraction of the
# cost, `flash-lite` goes much further per day, which is what matters the
# moment the account is on the free tier or near a spend cap. That is a
# decision the person paying makes, on a day we cannot predict — so it is a
# stored setting, not a constant they have to ask someone to push. The first
# entry is the fallback when neither the setting nor config names one.
MODELS = ("gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest")

MODEL_SETTING = "gemini_model"

# NOTE the precedence is INVERTED versus the key, deliberately. For the key,
# env wins so a value pinned by whoever has the box can never be overridden
# from a web form — that is a security stance. A model name is not a secret and
# `config.py` ALWAYS carries one, so if config won here the picker would be a
# control that visibly does nothing. Ours ships a default; the operator's pick
# beats it. `--model` on the backfill CLI beats both, per run and per process.
_MODEL_TTL = 30.0
_model_cache: tuple[float, str] = (0.0, "")
_model_override: str = ""


def set_model_override(name: str) -> None:
    """Pin the model for THIS process only — `backfill_leader_ai.py --model`.

    A run draining ten thousand rows on the cheap model must not rewrite what
    the platform uses for the photo somebody checks from the page a minute
    later, so the override lives in memory and dies with the process.
    """
    global _model_override
    _model_override = (name or "").strip()


def cli_model_override() -> str:
    """The backfill CLI's per-process `--model`, for `ai_review` to honour on a
    Gemini key exactly as `active_model` does."""
    return _model_override


def _stored_model() -> str:
    """The admin-set model from app_settings, or "". Never raises: a failure
    here has to fall back to the shipped default, not break every call."""
    import time

    global _model_cache
    now = time.monotonic()
    if now - _model_cache[0] < _MODEL_TTL:
        return _model_cache[1]

    val = ""
    try:
        from app.database import SessionLocal
        from app.models import AppSetting

        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter_by(key=MODEL_SETTING).first()
            val = (row.value or "").strip() if row else ""
        finally:
            db.close()
    except Exception:
        log.exception("gemini: could not read the stored model")
        val = ""

    _model_cache = (now, val)
    return val


def invalidate_model_cache() -> None:
    global _model_cache
    _model_cache = (0.0, "")


def active_model() -> str:
    """THE resolver. Named `active_model` rather than `model` because every
    call site here already has a `model` parameter that would shadow it."""
    return (_model_override or _stored_model()
            or (settings.gemini_model or "").strip() or MODELS[0])


def model_source() -> str:
    """Which of the three decided it — shown beside the picker so an operator
    can see why their pick is not the one in use."""
    if _model_override:
        return "cli"
    return "db" if _stored_model() else "config"


def labelled(images) -> list[tuple[bytes, str, str]]:
    """The callers' images as (bytes, mime, label). An item may be (bytes, mime)
    or (bytes, mime, label); the label is a line of text sent right BEFORE that
    image, by both transports. Without one the model has only the ORDER to tell
    a reference image from a photo it must judge — the proof reviewer sends up
    to three examples ahead of the proofs, and Claude counted the examples as
    proofs: it read an example's clock as the proof's, and named a «third
    photo» on a two-photo report (2026-10-19)."""
    out = []
    for item in images:
        raw, mime = item[0], item[1]
        out.append((raw, mime, (item[2] if len(item) > 2 else "") or ""))
    return out


def shrink_image(data: bytes, mime: str = "image/jpeg") -> tuple[bytes, str]:
    """Downscale to `_MAX_EDGE` — but never past `_MIN_EDGE` on the short edge —
    when Pillow is present. Falls back to the original bytes for anything Pillow
    can't open (and for animated/odd formats) — a slightly expensive request
    beats a dropped proof photo."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is in requirements
        return data, mime
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        w, h = img.size
        scale = min(_MAX_EDGE / max(w, h), 1.0)
        if min(w, h) * scale < _MIN_EDGE:
            scale = min(_MIN_EDGE / min(w, h), 1.0)
        if scale >= 1.0 and (mime or "").endswith(("jpeg", "jpg")):
            return data, "image/jpeg"
        img = img.convert("RGB")
        if scale < 1.0:
            img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                             Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as exc:
        log.debug("gemini: image shrink skipped (%s)", exc)
        return data, mime or "image/jpeg"


def _key_or_default(explicit: str | None) -> str:
    return (explicit or "").strip() or api_key()


def generate_json(
    prompt: str,
    images: list[tuple[bytes, str]],
    schema: dict,
    *,
    model: str | None = None,
    api_key: str | None = None,
    meter: dict | None = None,
) -> dict:
    """One vision call constrained to `schema`. Returns the parsed object.

    `images` is [(bytes, mime), …]; they are shrunk here so no caller has to
    remember to. Raises GeminiQuotaError on 429, GeminiError on anything else
    that leaves us without a usable object. `api_key` names the key to call
    with (the feature's own, through `ai_features`); without it the resolver's
    answer is used. `meter`, when given, receives the tokens spent.
    """
    key = _key_or_default(api_key)
    if not key:
        raise GeminiError("GEMINI_API_KEY is not configured", kind="no_key")
    mdl = (model or "").strip() or active_model()

    parts: list[dict] = [{"text": prompt}]
    for raw, mime, label in labelled(images):
        if label:
            parts.append({"text": label})
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
        raise GeminiError(f"Gemini unreachable: {exc}", kind="network") from exc

    if res.status_code == 429:
        raise GeminiQuotaError(_detail(res) or "Rate limit reached")
    if res.status_code >= 500:
        # Transient upstream — same handling as quota for the caller's purposes
        # (stop, leave the row pending, retry on the next drain).
        raise GeminiQuotaError(f"Gemini {res.status_code}: {_detail(res)}", kind="unavailable")
    if res.status_code != 200:
        msg = f"Gemini {res.status_code}: {_detail(res)}"
        if _key_refused(res):
            raise GeminiError(msg, kind="key")
        raise GeminiError(msg, kind="model" if _model_missing(res) else "other")

    try:
        payload = res.json()
        meter_usage(meter, payload.get("usageMetadata"))
        cand = (payload.get("candidates") or [])[0]
        text = "".join(
            p.get("text", "") for p in (cand.get("content") or {}).get("parts") or []
        )
    except (ValueError, IndexError, KeyError, TypeError) as exc:
        raise GeminiError(f"Unreadable Gemini response: {exc}", kind="bad_response") from exc

    if not text.strip():
        # Safety blocks and MAX_TOKENS land here; the finish reason is the only
        # useful thing to record against the row.
        raise GeminiError(f"Empty response (finish={cand.get('finishReason')})", kind="bad_response")
    try:
        out = json.loads(text)
    except ValueError as exc:
        raise GeminiError(f"Response was not JSON: {exc}", kind="bad_response") from exc
    if not isinstance(out, dict):
        raise GeminiError("Response JSON was not an object", kind="bad_response")
    return out


def ping(key: str, model: str) -> None:
    """One tiny real call — proves THIS key may call THIS model before a
    feature is moved onto the pair (`ai_features.assign`). Raises the
    reviewer's error classes with their `kind`; returns nothing."""
    body = {"contents": [{"role": "user", "parts": [{"text": "Reply with the single word OK."}]}],
            "generationConfig": {"temperature": 0}}
    url = f"{_BASE}/{model}:generateContent"
    try:
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            res = client.post(url, headers={"x-goog-api-key": key,
                                            "Content-Type": "application/json"}, json=body)
    except httpx.HTTPError as exc:
        raise GeminiError(f"Gemini unreachable: {exc}", kind="network") from exc
    if res.status_code == 200:
        return
    msg = f"Gemini {res.status_code}: {_detail(res)}"
    if res.status_code == 429:
        raise GeminiQuotaError(_detail(res) or "Rate limit reached")
    if res.status_code >= 500:
        raise GeminiQuotaError(msg, kind="unavailable")
    if _key_refused(res):
        raise GeminiAuthError(msg)
    raise GeminiError(msg, kind="model" if _model_missing(res) else "other")


def list_models(key: str) -> list[dict]:
    """[{id, label}] of the Gemini models `key` may call generateContent with —
    the live ListModels answer, which doubles as the key test: a bad key is a
    400 «API key not valid» / 403 (GeminiAuthError). The three `-latest`
    aliases are not always in it; `ai_keys.model_options` lays them over."""
    key = (key or "").strip()
    if not key:
        raise GeminiAuthError("No Gemini API key")
    try:
        with httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            res = client.get(_BASE, params={"pageSize": 200},
                             headers={"x-goog-api-key": key})
    except httpx.HTTPError as exc:
        raise GeminiError(f"Gemini unreachable: {exc}", kind="network") from exc
    if res.status_code in (400, 401, 403):
        raise GeminiAuthError(f"Gemini {res.status_code}: {_detail(res) or 'key refused'}")
    if res.status_code == 429:
        raise GeminiQuotaError(_detail(res) or "Rate limit reached")
    if res.status_code != 200:
        raise GeminiError(f"Gemini {res.status_code}: {_detail(res)}")
    out: list[dict] = []
    try:
        models = res.json().get("models") or []
    except ValueError as exc:
        raise GeminiError(f"Unreadable Gemini response: {exc}") from exc
    for m in models:
        name = str(m.get("name") or "")
        if not name.startswith("models/gemini"):
            continue
        if "generateContent" not in (m.get("supportedGenerationMethods") or []):
            continue
        mid = name.split("/", 1)[1]
        out.append({"id": mid, "label": str(m.get("displayName") or mid)})
    return out


def _detail(res: httpx.Response) -> str:
    try:
        return str((res.json().get("error") or {}).get("message") or "")[:400]
    except ValueError:
        return res.text[:400]
