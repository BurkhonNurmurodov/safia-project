"""The assistant's Gemini door — chat with function calling, and voice → text.

Kept apart from ``services/gemini.py`` on purpose: that module is the proof
reviewer's (vision + JSON, synchronous, run by a drain thread) and is tuned for
it. The assistant needs multi-turn contents, tools and an async client, and —
the operator's call (2026-10-05) — a KEY OF ITS OWN, so a busy chat day can
never spend the quota the checklist photo reviews depend on. When no own key is
set, the reviewer's key is used, so the assistant works the day it ships.

The own key is stored exactly like the reviewer's: SEALED in ``app_settings``
(``web_auth.seal_password``, keyed off SECRET_KEY, which never sits in the
database), never logged, never read back.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import time
from dataclasses import dataclass, field

import httpx

from app.services import gemini as shared

log = logging.getLogger(__name__)

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# A Pro call with thinking can take a minute on a long context; give it room,
# but never so much that a dead connection holds a run forever.
_TIMEOUT = httpx.Timeout(170.0, connect=20.0)

# The operator's choice: Gemini's latest PRO model, through the alias that
# follows Google's releases (a pinned id 404s the day it is retired — see
# services/gemini.py). Voice is transcribed by the latest FLASH: a transcript is
# not a judgement, and Pro's thinking would make the user wait seconds longer
# for words they already said.
MODEL = "gemini-pro-latest"
VOICE_MODEL = "gemini-flash-latest"

KEY_SETTING = "assistant_gemini_api_key"

_KEY_TTL = 30.0
_key_cache: tuple[float, str] = (0.0, "")


class AssistantAIError(RuntimeError):
    """A Gemini failure the chat must show in words. ``code`` is one of
    no_key · quota · unavailable · rejected · empty."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message


def _stored_key() -> str:
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
            row = db.query(AppSetting).filter_by(key=KEY_SETTING).first()
            if row and row.value:
                val = (open_password(row.value) or "").strip()
        finally:
            db.close()
    except Exception:
        log.exception("assistant: could not read its stored API key")
        val = ""
    _key_cache = (now, val)
    return val


def invalidate_key_cache() -> None:
    global _key_cache
    _key_cache = (0.0, "")


def api_key() -> str:
    """THE resolver: the assistant's own key, else the reviewer's."""
    return _stored_key() or shared.api_key()


def key_source() -> str:
    """own · shared · none — shown on the settings card, so an admin can see
    whose quota a chat is spending."""
    if _stored_key():
        return "own"
    return "shared" if shared.api_key() else "none"


def available() -> bool:
    return bool(api_key())


@dataclass
class Reply:
    content: dict
    text: str
    calls: list[dict]
    finish: str
    usage: dict = field(default_factory=dict)


def _detail(res: httpx.Response) -> str:
    try:
        return str((res.json().get("error") or {}).get("message") or "")[:400]
    except ValueError:
        return res.text[:400]


async def _post(model: str, body: dict, key: str) -> dict:
    """One POST with the retries a chat can afford: two for an overloaded or
    flaky upstream, one for a per-minute rate limit. Raises AssistantAIError."""
    url = f"{_BASE}/{model}:generateContent"
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
    waits = [2.0, 6.0]
    quota_retry = True
    attempt = 0
    while True:
        attempt += 1
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                res = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            if waits:
                await asyncio.sleep(waits.pop(0))
                continue
            raise AssistantAIError("unavailable", f"Gemini unreachable: {exc}") from exc

        if res.status_code == 200:
            try:
                return res.json()
            except ValueError as exc:
                raise AssistantAIError("empty", f"Unreadable Gemini response: {exc}") from exc
        if res.status_code == 429:
            if quota_retry:
                quota_retry = False
                await asyncio.sleep(8.0)
                continue
            raise AssistantAIError("quota", _detail(res) or "Rate limit reached")
        if res.status_code >= 500:
            if waits:
                await asyncio.sleep(waits.pop(0))
                continue
            raise AssistantAIError("unavailable", f"Gemini {res.status_code}: {_detail(res)}")
        # 400 (a bad key answers 400 "API key not valid"), 403, 404 (a retired
        # model) — none of them improves on a retry.
        raise AssistantAIError("rejected", f"Gemini {res.status_code}: {_detail(res)}")


async def generate(*, system: str, contents: list[dict], tools: list[dict] | None,
                   mode: str = "AUTO", model: str | None = None) -> Reply:
    """One turn of the conversation. ``contents`` is the Gemini transcript
    (user / model turns, function responses as user parts); the model content
    that comes back is returned VERBATIM so the caller can append it — Gemini 3
    function calls carry thought signatures it validates on the next call."""
    key = api_key()
    if not key:
        raise AssistantAIError("no_key", "No Gemini API key is configured")
    mdl = (model or MODEL).strip()
    body: dict = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
    }
    if tools:
        body["tools"] = [{"functionDeclarations": tools}]
        body["toolConfig"] = {"functionCallingConfig": {"mode": mode}}

    payload = await _post(mdl, body, key)
    cands = payload.get("candidates") or []
    usage = payload.get("usageMetadata") or {}
    if not cands:
        block = (payload.get("promptFeedback") or {}).get("blockReason")
        raise AssistantAIError("empty", f"No answer (blocked: {block or 'unknown'})")
    cand = cands[0]
    content = dict(cand.get("content") or {})
    content["role"] = "model"
    parts = content.get("parts") or []
    content["parts"] = parts
    text = "".join(p.get("text", "") for p in parts
                   if isinstance(p, dict) and not p.get("thought") and "text" in p)
    calls = [p["functionCall"] for p in parts
             if isinstance(p, dict) and isinstance(p.get("functionCall"), dict)]
    return Reply(content=content, text=text, calls=calls,
                 finish=str(cand.get("finishReason") or ""), usage=usage)


_VOICE_PROMPT = (
    "Transcribe this voice message word for word. The speaker works at a food "
    "factory and speaks Uzbek, Russian or a mix of both; plant words such as "
    "zagruzka, ojidaniya, brigadir, lider, yacheyka, smena, Verifix and SAP are "
    "common. Write Uzbek in {script} script and Russian in Cyrillic. Keep names "
    "and numbers exactly as spoken. Return ONLY the transcript — no quotes, no "
    "notes. If nothing intelligible was said, return an empty answer."
)


async def transcribe(audio: bytes, mime: str, lang: str = "uz") -> str:
    """Voice → text with the latest Flash model. Raises AssistantAIError."""
    key = api_key()
    if not key:
        raise AssistantAIError("no_key", "No Gemini API key is configured")
    script = "Cyrillic" if lang == "uz_cyrl" else "Latin"
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": _VOICE_PROMPT.format(script=script)},
            {"inline_data": {"mime_type": mime or "audio/wav",
                             "data": base64.b64encode(audio).decode()}},
        ]}],
        "generationConfig": {"temperature": 0},
    }
    payload = await _post(VOICE_MODEL, body, key)
    try:
        parts = ((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    except (IndexError, AttributeError):
        parts = []
    return "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
