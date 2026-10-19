"""The assistant's door to an AI — which provider, key and model answer it.

The «AI kalitlari» tab gives the chat (feature «assistant») and the voice
transcription (feature «voice») a key and a model each (`ai_features`); this
module asks it, calls the provider's transport (`assistant_gemini` or
`assistant_claude`, one reply shape for both) and records every call in the
ledger. The engine (`services/assistant.py`) calls only `current`, `generate`,
`transcribe` and `transcode` here and never names a provider.

A run is answered on ONE model: the model is stamped on the run when it starts,
and a step that finds the tab has moved the chat onto another model since
first flattens the run's transcript to text (`transcode`) — a thinking
signature or a tool block one model wrote is not something another model
accepts back. The admin's latest pick always wins, even for a run in flight.
"""
from __future__ import annotations

import asyncio
import json
import logging

from app.services import ai_features
from app.services import assistant_claude as claude
from app.services import assistant_gemini as gemini_t
from app.services.assistant_gemini import AssistantAIError, Reply  # noqa: F401 — the engine's names

log = logging.getLogger(__name__)

FEATURE = "assistant"
VOICE = "voice"
# No one model step — the provider's own retries included — outlasts this.
# A step that sends nothing for this long is not going to answer well either;
# the user gets «slow» and a Retry button instead of a clock ticking for 8 min.
DEADLINE_S = 240

# AssistantAIError.code → the ledger's kind.
_KIND = {"quota": "quota", "unavailable": "unavailable", "key": "key", "model": "model",
         "credit": "credit", "rejected": "other", "empty": "bad_response", "no_key": "no_key",
         "thinking_binding": "other", "slow": "slow"}


def current() -> ai_features.Assign:
    """The chat's assignment now (cached 30 s by `ai_features`). Synchronous —
    an async caller runs it in a thread on a cache miss."""
    return ai_features.resolve(FEATURE)


def available() -> bool:
    return bool(current().key)


def model_now() -> str:
    return current().model or ""


def _meter(usage: dict) -> dict:
    u = usage or {}
    return {"in": int(u.get("promptTokenCount") or 0) + int(u.get("toolUsePromptTokenCount") or 0),
            "out": int(u.get("candidatesTokenCount") or 0) + int(u.get("thoughtsTokenCount") or 0)}


async def _record(a, *, ok: bool, usage: dict | None = None, err: AssistantAIError | None = None):
    await asyncio.to_thread(
        ai_features.record, a, ok=ok, meter=_meter(usage or {}),
        kind=_KIND.get(err.code, "other") if err is not None else None,
        message=(err.message or err.code) if err is not None else "")


async def generate(a: ai_features.Assign, *, system: str, contents: list[dict],
                   tools: list[dict] | None, mode: str = "AUTO", on_retry=None) -> Reply:
    """One turn on the chat's provider. Raises AssistantAIError.
    ``on_retry(attempt, why)`` hears each retry the transport makes (Gemini's;
    Claude's SDK retries out of sight), so the chat can say what it waits on."""
    if not a.key:
        raise AssistantAIError("no_key", "No AI key is chosen for the assistant")
    try:
        try:
            reply = await _bounded(a, system, contents, tools, mode, on_retry)
        except AssistantAIError as exc:
            if exc.code != "thinking_binding":
                raise
            # Claude refused a thinking block it was handed back (its prefix
            # changed). The run goes on with its transcript told in words —
            # `contents` is the ENGINE's list, flattened in place, so the
            # steps after this one send the same thing.
            log.warning("assistant: Claude refused a replayed thinking block — "
                        "transcript flattened and asked again (%s)", exc.message[:200])
            contents[:] = transcode(contents)
            reply = await _bounded(a, system, contents, tools, mode, on_retry)
    except AssistantAIError as exc:
        await _record(a, ok=False, err=exc)
        raise
    await _record(a, ok=True, usage=reply.usage)
    return reply


async def _bounded(a, system, contents, tools, mode, on_retry) -> Reply:
    try:
        return await asyncio.wait_for(_call(a, system, contents, tools, mode, on_retry), DEADLINE_S)
    except asyncio.TimeoutError as exc:
        raise AssistantAIError("slow", f"No answer within {DEADLINE_S} s") from exc


async def _call(a, system, contents, tools, mode, on_retry=None) -> Reply:
    if a.provider == "claude":
        return await claude.generate(system=system, contents=contents, tools=tools,
                                     mode=mode, model=a.model, key=a.key)
    return await gemini_t.generate(system=system, contents=contents, tools=tools,
                                   mode=mode, model=a.model, key=a.key, on_retry=on_retry)


async def transcribe(audio: bytes, mime: str, lang: str = "uz") -> str:
    """Voice → text on the voice feature's key and model. Raises AssistantAIError."""
    a = await asyncio.to_thread(ai_features.resolve, VOICE)
    if not a.key:
        raise AssistantAIError("no_key", "No AI key is chosen for voice messages")
    if a.provider != "gemini":
        raise AssistantAIError("rejected", "Voice messages need a Gemini key")
    usage: dict = {}
    try:
        text = await gemini_t.transcribe(audio, mime, lang, model=a.model, key=a.key, usage=usage)
    except AssistantAIError as exc:
        await _record(a, ok=False, err=exc)
        raise
    await _record(a, ok=True, usage=usage)
    return text


def voice_current() -> ai_features.Assign:
    return ai_features.resolve(VOICE)


def voice_available() -> bool:
    return bool(voice_current().key)


def transcode(contents: list[dict]) -> list[dict]:
    """The run's transcript as plain turns any model accepts: text and files
    kept, a tool call and its result told in words, thoughts and raw blocks
    dropped. Used once, when the chat moved onto another model mid-run."""
    out: list[dict] = []
    for c in contents or []:
        role = "model" if c.get("role") == "model" else "user"
        parts: list[dict] = []
        for p in c.get("parts") or []:
            if not isinstance(p, dict) or p.get("thought"):
                continue
            if "functionCall" in p:
                fc = p.get("functionCall") or {}
                args = json.dumps(fc.get("args") or {}, ensure_ascii=False, default=str)[:1500]
                parts.append({"text": f"[I called the tool {fc.get('name')} with {args}]"})
            elif "functionResponse" in p:
                fr = p.get("functionResponse") or {}
                body = json.dumps(fr.get("response"), ensure_ascii=False, default=str)[:6000]
                parts.append({"text": f"[Result of the tool {fr.get('name')}: {body}]"})
            elif p.get("inline_data") or p.get("inlineData"):
                parts.append({"inline_data": p.get("inline_data") or p.get("inlineData")})
            elif p.get("text"):
                parts.append({"text": p["text"]})
        if not parts:
            continue
        if out and out[-1]["role"] == role:
            out[-1]["parts"].extend(parts)
        else:
            out.append({"role": role, "parts": parts})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out
