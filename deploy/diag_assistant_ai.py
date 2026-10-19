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
  5. a live probe with the assistant's own key and model, all at once: a tiny
     sync call (the tab's own check), a tiny async call (the chat's
     transport), the chat's real system prompt + tools, the same without
     tools, and the same on Flash — each timed, with its outcome.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_assistant_ai.py`. READ-ONLY on the database; its
only outside effect is five small Gemini calls billed to the assistant's key.
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
    import httpx

    from app.services import ai_features, assistant as engine, assistant_gemini as g, gemini
    a = ai_features.resolve("assistant")
    say(f"assistant assignment: provider={a.provider} model={a.model} hint={a.hint} "
        f"source={a.source} key={'yes' if a.key else 'NO'}")
    if not a.key or a.provider != "gemini":
        say("not a Gemini key — live probe skipped")
        return

    class P:  # the chat's own Ctx, minus a live token
        payload = {"full_name": "Diagnostics", "role": "admin", "web": True}
        web = True

    ctx = P()
    context = {"path": "/zagruzka", "lang": "uz", "_now": datetime.now().strftime("%Y-%m-%d %H:%M")}
    system = engine._system(ctx, context)
    say(f"system prompt {len(system)} chars, tools {len(engine.TOOLS)} "
        f"({len(json.dumps(engine.TOOLS))} chars)")
    question = [{"role": "user", "parts": [{"text": "Zagruzka qanday hisoblanadi? Qisqa javob ber."}]}]
    tiny = [{"role": "user", "parts": [{"text": "Reply with the single word OK."}]}]

    async def timed(label, coro):
        t = time.monotonic()
        try:
            r = await asyncio.wait_for(coro, CALL_CAP_S)
            u = r.usage or {}
            say(f"{label}: OK in {time.monotonic() - t:.1f} s · finish={r.finish} "
                f"calls={[c.get('name') for c in r.calls]} text={len(r.text)} chars · "
                f"prompt={u.get('promptTokenCount')} thoughts={u.get('thoughtsTokenCount')} "
                f"out={u.get('candidatesTokenCount')}")
        except asyncio.TimeoutError:
            say(f"{label}: NO ANSWER within {CALL_CAP_S:.0f} s")
        except g.AssistantAIError as exc:
            say(f"{label}: {exc.code} after {time.monotonic() - t:.1f} s — {exc.message[:300]}")
        except Exception as exc:  # noqa: BLE001
            say(f"{label}: {type(exc).__name__} after {time.monotonic() - t:.1f} s — {str(exc)[:300]}")

    async def sync_ping():
        t = time.monotonic()
        try:
            await asyncio.to_thread(gemini.ping, a.key, a.model)
            say(f"sync ping ({a.model}): OK in {time.monotonic() - t:.1f} s")
        except Exception as exc:  # noqa: BLE001
            say(f"sync ping ({a.model}): {type(exc).__name__} after {time.monotonic() - t:.1f} s — {str(exc)[:300]}")

    async def raw_async():
        """The chat's transport with nothing of the chat: one bare AsyncClient POST."""
        t = time.monotonic()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as c:
                res = await c.post(url, headers={"x-goog-api-key": a.key},
                                   json={"contents": tiny})
            say(f"raw async POST: HTTP {res.status_code} in {time.monotonic() - t:.1f} s "
                f"(http {res.http_version})")
        except Exception as exc:  # noqa: BLE001
            say(f"raw async POST: {type(exc).__name__} after {time.monotonic() - t:.1f} s — {str(exc)[:300]}")

    flash = "gemini-flash-latest"
    await asyncio.gather(
        sync_ping(),
        raw_async(),
        timed(f"tiny chat call ({a.model})",
              g.generate(system="Be brief.", contents=tiny, tools=None, model=a.model, key=a.key)),
        timed(f"full prompt + tools ({a.model})",
              g.generate(system=system, contents=question, tools=engine.TOOLS, model=a.model, key=a.key)),
        timed(f"full prompt, no tools ({a.model})",
              g.generate(system=system, contents=question, tools=None, model=a.model, key=a.key)),
        timed(f"full prompt + tools ({flash})",
              g.generate(system=system, contents=question, tools=engine.TOOLS, model=flash, key=a.key)),
    )


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
