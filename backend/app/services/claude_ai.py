"""Claude (Anthropic) transport for the proof reviewer — vision + JSON, nothing else.

The twin of `gemini.py` behind `ai_review.generate_json`: the same contract
(prompt + images + a Gemini-dialect schema → one dict) and the SAME two error
classes — `gemini.GeminiError` (this row's own failure) and
`gemini.GeminiQuotaError` (stop the drain, leave the row pending) — so
`leader_ai` needs to know nothing about which provider answered. Through the
official SDK (`anthropic`), the one dependency this file adds.

Rules of the Claude API that differ from Gemini's, each a design choice here:
- NO `temperature`: every current model rejects sampling parameters. The
  determinism the Gemini client bought with temperature 0 rests on the
  frozen prompt and the schema-guaranteed output instead.
- `output_config.format` (json_schema) plays the part of Gemini's
  `responseSchema`. Gemini spells its schema with upper-case types and
  optional properties; `json_schema()` converts it once — every property
  required, `additionalProperties: false` — so both providers are asked for
  the same object and `leader_ai._SCHEMA` stays the one definition.
- Thinking stays on (adaptive, the default on every current model) and is
  bounded by `EFFORT`, not a token budget (`budget_tokens` is a 400 now). A
  bounded vision question needs little of it; `medium` is set explicitly
  because the Sonnet (high) and Opus / Haiku (medium) defaults disagree.
- `stop_reason == "refusal"` (a safety classifier declined) is the row's
  ERROR, never a flag — the rule a dead Drive permission already has: a
  technical failure must not cost a leader a point.
"""
import base64
import json
import logging

from app.services.gemini import (GeminiAuthError, GeminiError, GeminiQuotaError,
                                 shrink_image)

log = logging.getLogger(__name__)

# The curated picker list, newest generation first. `id` is the exact model id
# the API takes (never a date suffix). A key's LIVE list (`list_models`) is
# laid over it by `ai_review.model_options`, so a model the key can reach but
# this list does not name is still offered.
MODELS = (
    {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "note": "recommended"},
    {"id": "claude-opus-5-5", "label": "Claude Opus 5.5", "note": "best"},
    {"id": "claude-haiku-5-5", "label": "Claude Haiku 5.5", "note": "cheapest"},
    {"id": "claude-sonnet-5", "label": "Claude Sonnet 5", "note": ""},
    {"id": "claude-opus-5", "label": "Claude Opus 5", "note": ""},
)
DEFAULT_MODEL = "claude-sonnet-5-5"
EFFORT = "medium"
# Thinking counts toward max_tokens even though its text is not returned; the
# JSON itself is a few hundred tokens. Non-streaming, so well under the SDK's
# HTTP timeout at this size.
_MAX_TOKENS = 8000
_TIMEOUT_S = 120.0


def _client(api_key: str):
    try:
        import anthropic
    except ImportError as exc:  # the dependency missing on a box: this row's error, never a crash
        raise GeminiError("The anthropic SDK is not installed on the server") from exc

    # One SDK retry (429 / 5xx / connection): the drain has its own pacing and
    # treats a 429 as «stop the pass», so a long retry ladder here would only
    # hold the thread.
    return anthropic.Anthropic(api_key=api_key, timeout=_TIMEOUT_S, max_retries=1)


def _msg(exc) -> str:
    """The provider's own sentence — the `error.message` of the API body where
    there is one («invalid x-api-key»), else the SDK's text."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])[:400]
    return (str(getattr(exc, "message", "") or exc) or type(exc).__name__)[:400]


def json_schema(schema):
    """Gemini's schema dialect → JSON Schema the way structured outputs want it:
    lower-case types, every property required, no additional properties."""
    if isinstance(schema, list):
        return [json_schema(s) for s in schema]
    if not isinstance(schema, dict):
        return schema
    out: dict = {}
    for k, v in schema.items():
        if k == "type" and isinstance(v, str):
            out[k] = v.lower()
        elif k == "properties" and isinstance(v, dict):
            out[k] = {name: json_schema(sub) for name, sub in v.items()}
        elif k == "items":
            out[k] = json_schema(v)
        elif k == "required":
            continue  # recomputed below: structured outputs want them all
        else:
            out[k] = v
    if out.get("type") == "object":
        props = out.get("properties") or {}
        out["required"] = list(props.keys())
        out["additionalProperties"] = False
    return out


def _image_block(raw: bytes, mime: str) -> dict:
    # The same ≤1280px JPEG the Gemini path sends — one resize rule for both,
    # and far under the API's per-image size cap.
    data, mime = shrink_image(raw, mime)
    return {"type": "image",
            "source": {"type": "base64", "media_type": mime or "image/jpeg",
                       "data": base64.b64encode(data).decode()}}


def _raise_mapped(exc):
    """Map an SDK exception onto the reviewer's two error classes — the exact
    split `gemini.generate_json` makes: 429 and 5xx stop the drain and leave
    the row pending; anything else is this row's own failure."""
    import anthropic

    if isinstance(exc, anthropic.RateLimitError):
        raise GeminiQuotaError(f"Claude 429: {_msg(exc)}") from exc
    if isinstance(exc, anthropic.APIStatusError):
        code = exc.status_code
        if code >= 500:
            raise GeminiQuotaError(f"Claude {code}: {_msg(exc)}") from exc
        if code in (401, 403):
            raise GeminiAuthError(f"Claude {code}: {_msg(exc)}") from exc
        raise GeminiError(f"Claude {code}: {_msg(exc)}") from exc
    if isinstance(exc, anthropic.APIConnectionError):
        raise GeminiError(f"Claude unreachable: {_msg(exc)}") from exc
    raise GeminiError(f"Claude: {_msg(exc)}") from exc


def generate_json(prompt: str, images: list[tuple[bytes, str]], schema: dict, *,
                  model: str, api_key: str) -> dict:
    """One vision call constrained to `schema`. Returns the parsed object.
    Raises GeminiQuotaError / GeminiError exactly as the Gemini transport does."""
    import anthropic

    if not api_key:
        raise GeminiError("No Claude API key configured")
    content: list[dict] = [_image_block(raw, mime) for raw, mime in images]
    content.append({"type": "text", "text": prompt})
    try:
        res = _client(api_key).messages.create(
            model=model,
            max_tokens=_MAX_TOKENS,
            messages=[{"role": "user", "content": content}],
            output_config={
                "effort": EFFORT,
                "format": {"type": "json_schema", "schema": json_schema(schema)},
            },
        )
    except anthropic.AnthropicError as exc:
        _raise_mapped(exc)

    if res.stop_reason == "refusal":
        cat = getattr(getattr(res, "stop_details", None), "category", None)
        raise GeminiError(f"Declined by Claude's safety classifier ({cat or 'unspecified'})")
    text = "".join(b.text for b in res.content if getattr(b, "type", "") == "text")
    if not text.strip():
        raise GeminiError(f"Empty response (stop={res.stop_reason})")
    try:
        out = json.loads(text)
    except ValueError as exc:
        raise GeminiError(f"Response was not JSON (stop={res.stop_reason}): {exc}") from exc
    if not isinstance(out, dict):
        raise GeminiError("Response JSON was not an object")
    return out


def list_models(api_key: str) -> list[dict]:
    """[{id, label}] of the Claude models this key can call that take images —
    the Models API's live answer, which doubles as the key test: a wrong key
    is a 401 (GeminiAuthError), a key with no access to a model simply does
    not list it."""
    import anthropic

    if not api_key:
        raise GeminiAuthError("No Claude API key")
    out: list[dict] = []
    try:
        for m in _client(api_key).models.list():
            mid = str(getattr(m, "id", "") or "")
            if not mid.startswith("claude-"):
                continue
            caps = getattr(m, "capabilities", None) or {}
            try:
                vision = bool(caps["image_input"]["supported"])
            except (KeyError, TypeError):
                vision = True
            if not vision:
                continue
            out.append({"id": mid, "label": getattr(m, "display_name", None) or mid})
    except anthropic.AnthropicError as exc:
        _raise_mapped(exc)
    return out
