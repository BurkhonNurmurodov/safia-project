"""⚠ TEMPORARY (2026-10-19): why «Yordamchi» gets no answer from Gemini, printed
into the deploy job's log — the one window onto production a cloud session can
read.

The operator: every chat answer fails with «AI javob bermadi — juda uzoq
kutildi» whichever key and model the «AI kalitlari» tab gives the assistant,
while the same key and model answer another feature at once. Locally the
chat's call reaches Gemini in a second. This prints, from the box:

  1. the assistant runs of the last two days — status, the error CODE and the
     transport's own sentence, the model, timings (never a message text);
  2. the assistant's lines from backend/logs/app.log (retries, timings,
     errors — the engine logs no user text);
  3. the AI feature rows (kind of the last error, model, key hint);
  4. the network as the worker sees it: proxy variable NAMES, the addresses
     Gemini's host resolves to;
  5. a live probe, all candidates at once: the engine's own loop (tools
     allowed, the rule book's real answers handed back, up to five steps) on
     Gemini Flash with the assistant's key and on Claude Sonnet / Opus with
     the reviewer's Claude key — each step timed, with the kinds of blocks the
     reply held, and whether it ended in an answer.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_assistant_ai.py`. READ-ONLY on the database; its
only outside effect is a few small AI calls billed to those two keys.
No key, token or person's words are printed. Delete it with its step.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import socket
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "backend"))
sys.path.insert(0, BACKEND)

TAG = "[ASSIST-DIAG]"
T0 = time.monotonic()
CALL_CAP_S = 170.0


def say(*a):
    print(TAG, *a, flush=True)


def runs():
    from app.database import SessionLocal
    from app.models import AssistantMessage, AssistantRun
    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc) - timedelta(days=2)
        rows = (db.query(AssistantRun).filter(AssistantRun.created_at >= since)
                .order_by(AssistantRun.id.desc()).limit(25).all())
        say(f"runs since {since:%m-%d %H:%M}Z: {len(rows)}")
        for r in rows:
            u = r.usage or {}
            m = db.get(AssistantMessage, r.message_id) if r.message_id else None
            d = (m.data or {}) if m else {}
            say(json.dumps({
                "id": r.id, "at": r.created_at.isoformat() if r.created_at else None,
                "end": r.finished_at.isoformat() if r.finished_at else None,
                "status": r.status, "model": r.model,
                "error": (r.error or "")[:300],
                "calls": u.get("calls"), "model_s": u.get("model_s"),
                "model_max_s": u.get("model_max_s"), "resumes": u.get("resumes"),
                "turns": len(r.contents or []),
                "msg": {k: d.get(k) for k in ("status", "error", "retry", "call_at") if k in d},
            }, default=str, ensure_ascii=False))
    finally:
        db.close()


def features():
    from app.database import SessionLocal
    from app.models import AiFeature, AiUsage
    from app.services import ai_features
    db = SessionLocal()
    try:
        for f in db.query(AiFeature).order_by(AiFeature.feature).all():
            a = ai_features.resolve(f.feature, db)
            say(json.dumps({
                "feature": f.feature, "ref": f.key_ref, "model": f.model,
                "resolved": {"provider": a.provider, "model": a.model, "hint": a.hint,
                             "source": a.source, "has_key": bool(a.key)},
                "last_error": f.last_error, "last_error_text": (f.last_error_text or "")[:300],
                "last_ok_at": f.last_ok_at, "last_error_at": f.last_error_at,
                "streak": f.fail_streak,
            }, default=str, ensure_ascii=False))
        for u in (db.query(AiUsage).filter(AiUsage.day >= datetime.now().date() - timedelta(days=1))
                  .order_by(AiUsage.day, AiUsage.feature).all()):
            say("usage", u.day, u.feature, u.provider, u.model, f"calls={u.calls} ok={u.ok} "
                f"failed={u.failed} in={u.tokens_in} out={u.tokens_out}")
    finally:
        db.close()


def log_lines():
    pat = re.compile(r"assistant|Gemini|gemini|ai_features", re.I)
    for name in ("app.log.1", "app.log"):
        path = os.path.join(BACKEND, "logs", name)
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                lines = [ln.rstrip() for ln in fh if pat.search(ln)]
        except OSError as exc:
            say("log unreadable", name, exc)
            continue
        today = datetime.now().strftime("%Y-%m-%d")
        lines = [ln for ln in lines if ln.startswith(today) or not ln[:4].isdigit()]
        say(f"{name}: {len(lines)} matching lines today; the last 70:")
        for ln in lines[-70:]:
            say("  ", ln[:400])


def network():
    names = [k for k in os.environ if "proxy" in k.lower()]
    say("proxy variables in this process:", names or "none")
    try:
        with open(os.path.join(BACKEND, ".env"), encoding="utf-8") as fh:
            env_names = [ln.split("=", 1)[0].strip() for ln in fh
                         if "=" in ln and "proxy" in ln.split("=", 1)[0].lower()]
        say("proxy names in backend/.env:", env_names or "none")
    except OSError:
        pass
    try:
        infos = socket.getaddrinfo("generativelanguage.googleapis.com", 443, type=socket.SOCK_STREAM)
        fams = {}
        for fam, *_rest, addr in infos:
            fams.setdefault(socket.AddressFamily(fam).name, []).append(addr[0])
        say("resolves to:", json.dumps(fams))
    except OSError as exc:
        say("getaddrinfo failed:", exc)


async def probe():
    """Two steps of the real chat on each candidate — the question, the tool
    call it answers with, a stub tool result handed back, the answer — so the
    replay of a step (Gemini's thought signatures, Claude's raw blocks) is
    exercised exactly as the engine does it. All candidates run at once."""
    from app.services import ai_features, assistant as engine, assistant_ai as ai

    chat = ai_features.resolve("assistant")
    review = ai_features.resolve("review")
    say(f"assistant assignment: provider={chat.provider} model={chat.model} hint={chat.hint}")
    say(f"review assignment: provider={review.provider} model={review.model} hint={review.hint}")

    class P:  # the chat's own Ctx, minus a live token
        payload = {"full_name": "Diagnostics", "role": "admin", "web": True}
        web = True

    context = {"path": "/zagruzka", "lang": "uz", "_now": datetime.now().strftime("%Y-%m-%d %H:%M")}
    system = engine._system(P(), context)
    say(f"system prompt {len(system)} chars, tools {len(engine.TOOLS)}")

    def cand(label, base, provider, model):
        if not base.key or base.provider != provider:
            return None
        return label, ai_features.Assign("probe", provider, model, base.key, base.ref,
                                         base.label, base.hint, base.source)

    gem = chat if chat.provider == "gemini" else None
    cands = [c for c in (
        cand("Gemini Flash", gem or chat, "gemini", "gemini-flash-latest") if gem else None,
                cand("Claude Sonnet 5.5", review, "claude", "claude-sonnet-5-5"),
        cand("Claude Opus 5.5", review, "claude", "claude-opus-5-5"),
    ) if c]

    from app.services import assistant_docs as docs

    def tool_result(c):
        """What the engine itself answers: the rule book for real, a stub for
        anything that would act as a person."""
        name, args = c.get("name"), c.get("args") or {}
        if name == "search_docs":
            return {"results": docs.search(str(args.get("query") or ""))}
        if name == "read_doc":
            return docs.read(args.get("section"), args.get("part") or 1)
        return {"error": "not available in this probe — answer from the rule book"}

    def blocks_of(r):
        raw = (r.content or {}).get("_claude")
        if raw:
            return [f"{b.get('type')}({len(b.get('text') or b.get('thinking') or '')})" for b in raw]
        return [("thought" if p.get("thought") else "call" if "functionCall" in p
                 else f"text({len(p.get('text') or '')})") for p in (r.content or {}).get("parts") or []]

    async def real_loop(label, a):
        """The engine's own loop: tools allowed until the last step, the rule
        book's real answers handed back, at most five steps."""
        contents = [{"role": "user", "parts": [{"text": "Zagruzka qanday hisoblanadi? Qisqa javob ber."}]}]
        t = time.monotonic()
        for step in range(1, 6):
            mode = "NONE" if step == 5 else "AUTO"
            s0 = time.monotonic()
            try:
                r = await asyncio.wait_for(ai._call(a, system, contents, engine.TOOLS, mode), CALL_CAP_S)
            except asyncio.TimeoutError:
                say(f"{label} step {step}: NO ANSWER within {CALL_CAP_S:.0f} s")
                return
            except Exception as exc:  # noqa: BLE001
                say(f"{label} step {step}: {type(exc).__name__} {getattr(exc, 'code', '')} after "
                    f"{time.monotonic() - s0:.1f} s — {str(getattr(exc, 'message', exc))[:300]}")
                return
            say(f"{label} step {step} ({mode}): {time.monotonic() - s0:.1f} s · finish={r.finish} "
                f"tools={[c.get('name') for c in r.calls]} text={len(r.text)} · blocks={blocks_of(r)}")
            contents.append(r.content)
            if not r.calls:
                verdict = "ANSWERED" if r.text.strip() else "EMPTY — the chat would show «bo'sh javob»"
                say(f"{label}: {verdict} after {step} step(s), {time.monotonic() - t:.1f} s")
                return
            contents.append({"role": "user", "parts": [engine._fresp(c, tool_result(c)) for c in r.calls]})
        say(f"{label}: still calling tools after 5 steps")

    await asyncio.gather(*(real_loop(label, a) for label, a in cands))


def main():
    from app.version import APP_VERSION
    say(f"version {APP_VERSION}")
    for step in (runs, features, log_lines, network):
        try:
            step()
        except Exception:  # noqa: BLE001
            say(f"{step.__name__} failed:")
            for ln in traceback.format_exc().splitlines()[-8:]:
                say("  ", ln)
    try:
        asyncio.run(probe())
    except Exception:  # noqa: BLE001
        say("probe failed:")
        for ln in traceback.format_exc().splitlines()[-10:]:
            say("  ", ln)
    say(f"done in {time.monotonic() - T0:.0f} s")


if __name__ == "__main__":
    main()
