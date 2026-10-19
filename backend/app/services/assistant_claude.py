"""The assistant's Claude transport — the same conversation the Gemini one holds
(`assistant_gemini`), on Anthropic's Messages API (from 2026-10-19, the
operator: «every single feature should be switchable»).

The engine (`services/assistant.py`) keeps ONE transcript shape for every
provider — Gemini's `contents` (user / model turns of `parts`: text,
inline_data, functionCall, functionResponse), the shape every run stored
before Claude existed here. This module translates it into Claude's messages
on the way out and Claude's answer back into it on the way in, so the engine,
its tools, its plan pause and its resume after a Confirm know nothing about
which provider answered.

Rules of the Claude API this follows, each a design choice:
- A turn Claude answered is kept VERBATIM as `_claude` (its raw content
  blocks, exactly as the API sent them) beside the translated `parts`: in a
  tool loop with thinking on, Claude must be handed its own thinking blocks
  back unchanged, signatures and all, or the next call is refused. Gemini
  never sees `_claude` (`assistant_gemini._clean`).
- A thinking signature is bound to everything before it — the system prompt,
  the tools and the earlier messages — so the engine keeps a run's system
  prompt byte for byte the same across its steps and its resume after a
  Confirm (`assistant._system`, the run's frozen «now»). Should Claude still
  refuse a replayed block («thinking … signature»), the call is retried once
  on the run's transcript flattened to text (`assistant_ai`).
- `tool_result` blocks come FIRST in a user message, one per `tool_use` of
  the turn before; the files a tool showed the model follow them.
- A request whose messages carry tool blocks must declare the tools, so the
  «answer now» step after the step budget sends them with
  `tool_choice: none` instead of leaving them out.
- Thinking stays on (adaptive, every current model's default), bounded by
  `EFFORT`; no sampling parameters (current models reject them).
- The long system prompt (rule book contents + the API index) and the
  conversation are CACHED through the request's top-level `cache_control`,
  which lets the API place the breakpoint itself — so no block of an earlier
  message is ever touched to move one.
"""
from __future__ import annotations

import base64
import json
import logging

from app.services.assistant_gemini import AssistantAIError, Reply

log = logging.getLogger(__name__)

EFFORT = "medium"
# Thinking counts toward max_tokens. Under the SDK's non-streaming ceiling
# (a request it estimates past ten minutes is refused unless streamed).
_MAX_TOKENS = 16000
_TIMEOUT_S = 170.0
_IMAGE_TYPES = ("image/jpeg", "image/png", "image/gif", "image/webp")


def _client(api_key: str):
    try:
        import anthropic
    except ImportError as exc:
        raise AssistantAIError("unavailable", "The anthropic SDK is not installed on the server") from exc
    # Two SDK retries (429 / 5xx / connection, with its own backoff) — what a
    # chat can afford before the user is told.
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT_S, max_retries=2)


# ── the transcript → Claude's messages ──────────────────────────────────────
def _inline(p: dict):
    return p.get("inline_data") or p.get("inlineData")


def _file_block(d: dict) -> dict:
    mime = str(d.get("mime_type") or d.get("mimeType") or "")
    data = d.get("data") or ""
    if mime in _IMAGE_TYPES:
        return {"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}}
    if mime == "application/pdf":
        return {"type": "document", "source": {"type": "base64", "media_type": mime, "data": data}}
    return {"type": "text", "text": f"[a {mime or 'file'} attachment that cannot be shown here]"}


def _tool_result(fr: dict) -> dict:
    resp = fr.get("response")
    body = json.dumps(resp, ensure_ascii=False, default=str)
    out = {"type": "tool_result", "tool_use_id": str(fr.get("id") or ""), "content": body}
    if isinstance(resp, dict) and resp.get("error"):
        out["is_error"] = True
    return out


def to_messages(contents: list[dict]) -> list[dict]:
    msgs: list[dict] = []
    for c in contents:
        role = "assistant" if c.get("role") == "model" else "user"
        blocks: list[dict] = []
        if role == "assistant" and c.get("_claude"):
            # Handed back as the API sent them: a thinking block rebuilt or
            # filtered out of the latest assistant turn is refused.
            blocks = [dict(b) for b in c["_claude"] if isinstance(b, dict)]
        else:
            for p in c.get("parts") or []:
                if not isinstance(p, dict) or p.get("thought"):
                    continue
                if "functionCall" in p:
                    fc = p["functionCall"] or {}
                    blocks.append({"type": "tool_use", "id": str(fc.get("id") or ""),
                                   "name": fc.get("name") or "", "input": fc.get("args") or {}})
                elif "functionResponse" in p:
                    blocks.append(_tool_result(p["functionResponse"] or {}))
                elif _inline(p):
                    blocks.append(_file_block(_inline(p)))
                elif p.get("text"):
                    blocks.append({"type": "text", "text": p["text"]})
        if not blocks:
            continue
        if role == "user":
            blocks.sort(key=lambda b: 0 if b.get("type") == "tool_result" else 1)
        if msgs and msgs[-1]["role"] == role:
            if role == "user":
                merged = msgs[-1]["content"] + blocks
                merged.sort(key=lambda b: 0 if b.get("type") == "tool_result" else 1)
                msgs[-1]["content"] = merged
            else:
                msgs[-1]["content"].extend(blocks)
        else:
            msgs.append({"role": role, "content": blocks})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    return msgs


def _has_tool_blocks(msgs: list[dict]) -> bool:
    return any(b.get("type") in ("tool_use", "tool_result")
               for m in msgs for b in m.get("content") or [])


def _tools(tools: list[dict]) -> list[dict]:
    return [{"name": t["name"], "description": t.get("description") or "",
             "input_schema": t.get("parameters") or {"type": "object", "properties": {}}}
            for t in tools]


# ── errors ───────────────────────────────────────────────────────────────────
def _msg(exc) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])[:400]
    return (str(getattr(exc, "message", "") or exc) or type(exc).__name__)[:400]


def _mapped(exc) -> AssistantAIError:
    import anthropic

    if isinstance(exc, anthropic.RateLimitError):
        return AssistantAIError("quota", f"Claude 429: {_msg(exc)}")
    if isinstance(exc, anthropic.APIStatusError):
        code = exc.status_code
        text = _msg(exc)
        if code >= 500:
            return AssistantAIError("unavailable", f"Claude {code}: {text}")
        if code in (401, 403):
            return AssistantAIError("key", f"Claude {code}: {text}")
        if code == 404:
            return AssistantAIError("model", f"Claude 404: {text}")
        low = text.lower()
        if "credit balance" in low:
            return AssistantAIError("credit", f"Claude {code}: {text}")
        if code == 400 and "thinking" in low and ("signature" in low or "modified" in low):
            return AssistantAIError("thinking_binding", f"Claude {code}: {text}")
        return AssistantAIError("rejected", f"Claude {code}: {text}")
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return AssistantAIError("unavailable", f"Claude unreachable: {_msg(exc)}")
    return AssistantAIError("unavailable", f"Claude: {_msg(exc)}")


# ── one turn ─────────────────────────────────────────────────────────────────
def _dump(b) -> dict:
    """A response block as plain JSON — the fields the API SENT, nothing
    added (the SDK's own `to_dict`, unset fields left out)."""
    if isinstance(b, dict):
        return dict(b)
    if hasattr(b, "to_dict"):
        return b.to_dict(mode="json")
    if hasattr(b, "model_dump"):
        return b.model_dump(mode="json", exclude_unset=True)
    return {"type": getattr(b, "type", "")}


def _usage(u) -> dict:
    """Claude's usage, in the Gemini words the engine adds up."""
    g = (lambda k: int(getattr(u, k, None) or 0)) if u is not None else (lambda k: 0)
    read = g("cache_read_input_tokens")
    return {"promptTokenCount": g("input_tokens") + g("cache_creation_input_tokens") + read,
            "candidatesTokenCount": g("output_tokens"), "thoughtsTokenCount": 0,
            "cachedContentTokenCount": read}


async def generate(*, system: str, contents: list[dict], tools: list[dict] | None,
                   mode: str = "AUTO", model: str, key: str) -> Reply:
    """One turn, as `assistant_gemini.generate` answers it: the model content
    to append (translated parts + the raw blocks as `_claude`), its text, its
    tool calls (`{name, args, id}`), why it stopped, and its usage."""
    import anthropic

    if not key:
        raise AssistantAIError("no_key", "No Claude API key is configured")
    msgs = to_messages(contents)
    if not msgs:
        raise AssistantAIError("empty", "Nothing to answer")
    kwargs: dict = {
        "model": model, "max_tokens": _MAX_TOKENS, "messages": msgs,
        "system": system,
        # Automatic caching: the API sets the breakpoint on the newest block
        # itself, so tools + system + the conversation so far are read from
        # the cache on the next step of the loop.
        "cache_control": {"type": "ephemeral"},
        "output_config": {"effort": EFFORT},
    }
    if tools and (mode != "NONE" or _has_tool_blocks(msgs)):
        kwargs["tools"] = _tools(tools)
        kwargs["tool_choice"] = {"type": "none" if mode == "NONE" else "auto"}
    client = _client(key)
    try:
        try:
            res = await client.messages.create(**kwargs)
        except anthropic.BadRequestError as exc:
            # A model that does not take automatic caching answers without it.
            if "cache_control" not in _msg(exc):
                raise
            kwargs.pop("cache_control", None)
            res = await client.messages.create(**kwargs)
    except anthropic.AnthropicError as exc:
        raise _mapped(exc) from exc

    if res.stop_reason == "refusal":
        raise AssistantAIError("empty", "Declined by Claude's safety classifier")
    blocks = [_dump(b) for b in (res.content or [])]
    parts: list[dict] = []
    calls: list[dict] = []
    for b in blocks:
        t = b.get("type")
        if t == "text" and b.get("text"):
            parts.append({"text": b["text"]})
        elif t == "tool_use":
            fc = {"name": b.get("name") or "", "args": b.get("input") or {}, "id": b.get("id")}
            parts.append({"functionCall": fc})
            calls.append(fc)
    text = "".join(b.get("text") or "" for b in blocks if b.get("type") == "text")
    content = {"role": "model", "parts": parts, "_claude": blocks}
    return Reply(content=content, text=text, calls=calls,
                 finish=str(res.stop_reason or ""), usage=_usage(getattr(res, "usage", None)))
