"""Lays out a client STALL report — the app standing on its logo-and-spinner
loader for too long — as one message: a verdict first, its evidence under it.

Built by frontend/src/utils/stallReport.js, delivered through the one client
failure door (routers/boot.py, `/api/crash-report` kind "stall"). The client
says what it waited on and how long each answer took, from its side AND as the
server stamped it (`X-Server-Ms`, `X-Server-Stall-Ms`); `server_events` is the
server's own record of the same window (services/perf_watch.py). Together they
answer the only question that matters: was it the server, or the way to it?

Every field is optional and every reader tolerates any shape — this is one
client's measurements, and a report that says less is still worth sending.
"""
from __future__ import annotations

import hashlib
import html
import json

from app.services import perf_watch

_MAX_TEXT = 3900
_MAX_LOG = 20000

_WHERE = {
    "auth": "the session check",
    "access": "page access",
    "caps": "capabilities",
    "page": "a page's code",
}
_OUTCOME = {
    "resolved": "then it opened",
    "waiting": "still waiting when this was sent",
    "left": "the app was closed / hidden while still waiting",
}


def _d(v) -> dict:
    return v if isinstance(v, dict) else {}


def _l(v) -> list:
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _t(v, n: int = 120) -> str:
    s = str(v or "")
    return html.escape(s if len(s) <= n else s[: n - 1] + "…")


def _s(ms) -> str:
    n = _num(ms)
    if n is None:
        return "?"
    return f"{n / 1000:.1f} s" if n >= 1000 else f"{int(n)} ms"


def _slowest(st: dict) -> dict:
    rows = _l(st.get("pending")) + _l(st.get("done"))
    return max(rows, key=lambda r: _num(r.get("ms")) or 0) if rows else {}


def fingerprint(stall, server_events: list[dict] | None = None) -> str:
    """One message per gate × slowest endpoint × CAUSE per hour — NOT per
    person: when the server freezes, everybody's loader stalls on the same
    request at once, and forty identical DMs would bury the one that explains
    it (the repeat count on the next message says how far it spread). The
    cause is in it so one person's slow Wi-Fi at 09:00 cannot silence a server
    freeze on the same request at 09:30."""
    st = _d(stall)
    slow = _slowest(st)
    raw = "|".join(str(x or "") for x in (
        "stall", st.get("where"), slow.get("p"), cause(st, server_events or [])))
    return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()


def log_json(stall) -> str:
    try:
        s = json.dumps(stall, ensure_ascii=False, default=str, separators=(",", ":"))
    except Exception:
        s = repr(stall)
    return s if len(s) <= _MAX_LOG else s[:_MAX_LOG] + "…"


def _froze_ms(st: dict, server_events: list[dict]) -> float:
    froze = max((e.get("ms", 0) for e in server_events if e.get("kind") == "stall"), default=0)
    seen = max((_num(r.get("stall")) or 0 for r in _l(st.get("done"))), default=0)
    return max(froze, seen)


def cause(stall, server_events: list[dict]) -> str:
    """THE classification, shared by the verdict and the fingerprint:
    restart · froze · pending · server · network · noserver · page · other."""
    st = _d(stall)
    done = _l(st.get("done"))
    pending = _l(st.get("pending"))
    if st.get("restarting"):
        return "restart"
    if _froze_ms(st, server_events) >= 1000:
        return "froze"
    slow = max(done, key=lambda r: _num(r.get("ms")) or 0) if done else None
    if pending:
        p = max(pending, key=lambda r: _num(r.get("ms")) or 0)
        if not slow or (_num(p.get("ms")) or 0) >= (_num(slow.get("ms")) or 0):
            return "pending"
    if slow:
        ms, sms = _num(slow.get("ms")) or 0, _num(slow.get("sms"))
        if sms is None:
            return "noserver"
        if sms >= 0.6 * ms and sms >= 1500:
            return "server"
        if ms - sms >= 1500:
            return "network"
        return "other"
    return "page" if st.get("where") == "page" else "other"


def verdict(stall, server_events: list[dict]) -> str:
    st = _d(stall)
    done = _l(st.get("done"))
    pending = _l(st.get("pending"))
    slow = max(done, key=lambda r: _num(r.get("ms")) or 0) if done else {}
    ms, sms = _num(slow.get("ms")) or 0, _num(slow.get("sms"))
    where = f"{_t(slow.get('m'), 8)} {_t(slow.get('p'))}"
    c = cause(st, server_events)
    if c == "restart":
        return "The server was RESTARTING (a deploy) — the app waited for it to come back."
    if c == "froze":
        return (f"The SERVER froze — its event loop was held for up to {_s(_froze_ms(st, server_events))}, "
                "and no request was answered meanwhile (see the server's record below).")
    if c == "pending":
        p = max(pending, key=lambda r: _num(r.get("ms")) or 0)
        return (f"No answer yet to {_t(p.get('m'), 8)} {_t(p.get('p'))} after {_s(p.get('ms'))}"
                + (" — and the server recorded slow requests then." if server_events
                   else " — the server recorded nothing slow, so it likely never reached it (network)."))
    if c == "noserver":
        return f"{where} took {_s(ms)}; the answer carried no server time (an old server, or a proxy answered)."
    if c == "server":
        return f"The SERVER spent {_s(sms)} of {_s(ms)} on {where}."
    if c == "network":
        return (f"{where}: the server spent only {_s(sms)}, the other {_s(ms - sms)} were on the way "
                "(network / Cloudflare / connection setup).")
    if c == "page":
        return "No request was pending — the page's code itself was loading (network)."
    if slow:
        return f"{where} took {_s(ms)} (server {_s(sms)})."
    return "Nothing pending and nothing slow was recorded — the wait is unexplained by the requests."


def message(stall, *, who: str, version: str, ua: str, repeats: int,
            server_events: list[dict]) -> str:
    st = _d(stall)
    where = st.get("where") or "?"
    lines = [
        f"⏳ <b>App stuck on its loader</b>" + (f" · v{_t(version, 40)}" if version else ""),
        f"Who: {_t(who, 160)}",
        f"Waited <b>{_s(st.get('waited_ms'))}</b> on {_t(_WHERE.get(where, where), 40)}"
        f" — {_t(_OUTCOME.get(st.get('outcome'), st.get('outcome') or '?'), 80)}",
    ]
    env = [_t(st.get("platform"), 40)]
    c = _d(st.get("conn"))
    if c:
        env.append(" ".join(x for x in (
            _t(c.get("type"), 12),
            f"rtt {_num(c.get('rtt'))} ms" if _num(c.get("rtt")) is not None else "",
            f"{_num(c.get('down'))} Mb/s" if _num(c.get("down")) is not None else "",
        ) if x))
    if st.get("online") is False:
        env.append("OFFLINE")
    if _num(st.get("since_load_ms")) is not None:
        env.append(f"{_s(st.get('since_load_ms'))} after the page loaded")
    lines.append(" · ".join(x for x in env if x))
    if ua:
        lines.append(f"Device: {_t(ua, 140)}")
    if repeats:
        lines.append(f"Also seen {repeats}× in the previous hour")
    lines += ["", f"<b>Verdict:</b> {verdict(st, server_events)}"]

    req = []
    for r in _l(st.get("pending")):
        req.append(f"… {_t(r.get('m'), 8)} {_t(r.get('p'))} — no answer after {_s(r.get('ms'))}")
    for r in _l(st.get("done")):
        extra = []
        if _num(r.get("sms")) is not None:
            extra.append(f"server {_s(r.get('sms'))}")
        if (_num(r.get("stall")) or 0) >= 1000:
            extra.append(f"server froze {_s(r.get('stall'))} in the last minute")
        req.append(f"{_t(r.get('m'), 8)} {_t(r.get('p'))} → {_num(r.get('s')) or 'no answer'} "
                   f"in {_s(r.get('ms'))}" + (f" ({', '.join(extra)})" if extra else ""))
    if req:
        lines += ["", "<b>Requests (slowest first):</b>", "<pre>" + "\n".join(req[:8]) + "</pre>"]

    text = "\n".join(lines)
    if server_events:
        text += "\n\n<b>Server, same window:</b>"
        for line in perf_watch.event_lines(server_events, limit=4):
            if len(text) + len(line) > _MAX_TEXT:
                break
            text += "\n" + line
    else:
        text += "\n\n<i>Server, same window: nothing slow recorded.</i>"
    return text
