"""The assistant's Gemini transport — chat with function calling, voice → text and text → voice.

Kept apart from ``services/gemini.py`` on purpose: that module is the proof
reviewer's (vision + JSON, synchronous, run by a drain thread) and is tuned for
it. The assistant needs multi-turn contents, tools and an async client.

WHICH key and model it calls with is not decided here (from 2026-10-19): the
«AI kalitlari» tab gives the chat and the voice transcription a key and a
model each (`services/ai_features`, features «assistant» and «voice»), and
`services/assistant_ai` hands them in.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import struct
import time
from dataclasses import dataclass, field

import httpx

from app.services.gemini import SPEECH_SHAPES, speech_body

log = logging.getLogger(__name__)

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# A Pro call with thinking can take a minute on a long context; give it room,
# but never so much that a dead connection holds a run forever. A call that
# sent nothing for 150 s is NOT asked again — the same question thinks just as
# long the second time and is billed twice (it cost one reply 8½ minutes) —
# and no one call, retries included, outlasts `assistant_ai.DEADLINE_S`.
_TIMEOUT = httpx.Timeout(150.0, connect=20.0)


class AssistantAIError(RuntimeError):
    """An AI failure the chat must show in words. ``code`` is one of
    no_key · quota · unavailable · slow · rejected · key · model · credit · empty."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message


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


async def _post(model: str, body: dict, key: str, on_retry=None) -> dict:
    """One POST with the retries a chat can afford: two for an overloaded or
    flaky upstream, one for a per-minute rate limit. Raises AssistantAIError.
    ``on_retry(attempt, why)`` (async) is told before each retry — why is
    timeout · network · busy · limit — so the chat can say what it waits on
    instead of «thinking» for minutes."""
    url = f"{_BASE}/{model}:generateContent"
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
    waits = [2.0, 6.0]
    quota_retry = True
    attempt = 0
    while True:
        attempt += 1
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                res = await client.post(url, headers=headers, json=body)
        except httpx.ReadTimeout as exc:
            raise AssistantAIError("slow", f"Gemini sent nothing for {_TIMEOUT.read:.0f} s") from exc
        except httpx.HTTPError as exc:
            if waits:
                await _told(on_retry, attempt + 1,
                            "timeout" if isinstance(exc, httpx.TimeoutException) else "network")
                await asyncio.sleep(waits.pop(0))
                continue
            raise AssistantAIError("unavailable", f"Gemini unreachable: {exc}") from exc

        if res.status_code == 200:
            try:
                out = res.json()
                log.info("assistant Gemini call: %s in %.1f s (thoughts %s)",
                         out.get("modelVersion") or model, time.monotonic() - t0,
                         (out.get("usageMetadata") or {}).get("thoughtsTokenCount"))
                return out
            except ValueError as exc:
                raise AssistantAIError("empty", f"Unreadable Gemini response: {exc}") from exc
        if res.status_code == 429:
            if quota_retry:
                quota_retry = False
                await _told(on_retry, attempt + 1, "limit")
                await asyncio.sleep(8.0)
                continue
            raise AssistantAIError("quota", _detail(res) or "Rate limit reached")
        if res.status_code >= 500:
            if waits:
                await _told(on_retry, attempt + 1, "busy")
                await asyncio.sleep(waits.pop(0))
                continue
            raise AssistantAIError("unavailable", f"Gemini {res.status_code}: {_detail(res)}")
        # 400 (a bad key answers 400 "API key not valid"), 403, 404 (a retired
        # model) — none of them improves on a retry.
        detail = _detail(res)
        low = detail.lower()
        if res.status_code in (401, 403) or (res.status_code == 400 and "api key" in low):
            code = "key"
        elif res.status_code == 404 or ("model" in low and ("not found" in low or "not supported" in low)):
            code = "model"
        else:
            code = "rejected"
        raise AssistantAIError(code, f"Gemini {res.status_code}: {detail}")


def _clean(contents: list[dict]) -> list[dict]:
    """The transcript as Gemini takes it: role + parts and nothing else (a
    turn another provider answered carries its own raw blocks, `_claude`,
    which Gemini would refuse as an unknown field)."""
    return [{"role": c.get("role") or "user", "parts": list(c.get("parts") or [])}
            for c in contents if c.get("parts")]


async def _told(on_retry, attempt: int, why: str) -> None:
    log.warning("assistant Gemini call: retry %d (%s)", attempt, why)
    if on_retry is None:
        return
    try:
        await on_retry(attempt, why)
    except Exception:  # telling the chat must never cost the answer
        log.warning("assistant: could not record a retry", exc_info=True)


# A fast turn (a question spoken to the voice orb) asks the model to think
# LESS: its steps are «which endpoint, then say the figure», and the seconds a
# model spends deliberating over each are the wait the speaker hears. The field
# is Gemini 3's; an older model refuses it with a 400 naming it — asked again
# without it, once, and not sent again by this process.
_THINK_LESS = {"thinkingConfig": {"thinkingLevel": "low"}}
_think_less = True


async def generate(*, system: str, contents: list[dict], tools: list[dict] | None,
                   mode: str = "AUTO", model: str, key: str, on_retry=None,
                   fast: bool = False) -> Reply:
    """One turn of the conversation. ``contents`` is the Gemini transcript
    (user / model turns, function responses as user parts); the model content
    that comes back is returned VERBATIM so the caller can append it — Gemini 3
    function calls carry thought signatures it validates on the next call."""
    global _think_less
    if not key:
        raise AssistantAIError("no_key", "No Gemini API key is configured")
    mdl = (model or "gemini-pro-latest").strip()
    body: dict = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": _clean(contents),
    }
    # «NONE» (answer now, the step budget is spent) leaves the tools out —
    # the request Gemini was always sent at that step.
    if tools and mode != "NONE":
        body["tools"] = [{"functionDeclarations": tools}]
        body["toolConfig"] = {"functionCallingConfig": {"mode": mode}}

    if fast and _think_less:
        body["generationConfig"] = dict(_THINK_LESS)
    try:
        payload = await _post(mdl, body, key, on_retry)
    except AssistantAIError as exc:
        if ("generationConfig" not in body or not exc.message.startswith("Gemini 400")
                or "thinking" not in exc.message.lower()):
            raise
        log.warning("assistant: %s does not take a thinking level — not sent again (%s)",
                    mdl, exc.message[:200])
        _think_less = False
        payload = await _post(mdl, {k: v for k, v in body.items() if k != "generationConfig"},
                              key, on_retry)
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


async def transcribe(audio: bytes, mime: str, lang: str = "uz", *, model: str,
                     key: str, usage: dict | None = None) -> str:
    """Voice → text. Raises AssistantAIError. ``usage`` receives Gemini's
    `usageMetadata`."""
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
    payload = await _post((model or "gemini-flash-latest").strip(), body, key)
    if usage is not None:
        usage.update(payload.get("usageMetadata") or {})
    try:
        parts = ((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    except (IndexError, AttributeError):
        parts = []
    return "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Headerless 16-bit mono PCM in a RIFF header — what the older TTS models
    return; a browser decodes a WAV, not a bare stream."""
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm)


_speech_shape = 0       # the request shape this process found the model takes


async def speak(text: str, *, model: str, key: str, usage: dict | None = None) -> bytes:
    """Text → a WAV of it spoken (24 kHz mono). Raises AssistantAIError."""
    global _speech_shape
    if not key:
        raise AssistantAIError("no_key", "No Gemini API key is configured")
    while True:
        try:
            payload = await _post((model or "").strip(), speech_body(text, _speech_shape), key)
            break
        except AssistantAIError as exc:
            # A 400 is the model refusing the REQUEST (`gemini.SPEECH_SHAPES`):
            # the next spelling is tried, and the one that works is kept.
            if not exc.message.startswith("Gemini 400") or _speech_shape >= len(SPEECH_SHAPES) - 1:
                raise
            log.warning("assistant speech: shape %d refused — trying the next (%s)",
                        _speech_shape, exc.message[:200])
            _speech_shape += 1
    if usage is not None:
        usage.update(payload.get("usageMetadata") or {})
    try:
        parts = ((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        blob = next((b for b in ((p.get("inlineData") or p.get("inline_data"))
                                 for p in parts if isinstance(p, dict)) if b and b.get("data")), None)
        audio = base64.b64decode(blob["data"]) if blob else b""
    except (IndexError, AttributeError, ValueError):
        audio = b""
    if not audio:
        raise AssistantAIError("empty", "Gemini returned no audio")
    return audio if audio[:4] == b"RIFF" else _wav(audio)
