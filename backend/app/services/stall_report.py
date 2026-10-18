"""Lays out a client STALL report — the app standing on its logo-and-spinner
loader for too long — as one message: a verdict first, its evidence under it.

Built by frontend/src/utils/stallReport.js, delivered through the one client
failure door (routers/boot.py, `/api/crash-report` kind "stall"). The client
says what it waited on and how long each answer took, from its side AND as the
server stamped it (`X-Server-Ms`, `X-Server-Stall-Ms`); `server_events` is the
server's own record of the same window (services/perf_watch.py). Together they
answer the only question that matters: was it the server, or the way to it?

Since 12 Oct 2026 the client also sends the BROWSER's own phases per request
(`rt`: `stall` held before sending · `conn` · `ttfb` · `dl` · `size` · `proto`),
the page chunks a «page» wait was actually waiting on (`chunks`), and how long
the app had been in the background before the wait (`vis`). That report — four
requests stuck 10–13 s together with 12–16 ms of server time on each — was the
browser detecting a connection that had died while the app was away (it sends
on the dead one, waits ~10 s for its PING, then opens a new one); the verdict
blamed «the network» for ONE request and could not say the app had been away.

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


def _answered(st: dict) -> list:
    """The finished requests that say something about the wait: a copy the app
    CANCELLED itself (`x` — the loser of a request asked twice,
    frontend/src/utils/hedge.js) carries no answer and no server time, and
    read as the slowest it would blame the server for a request nobody needed."""
    return [r for r in _l(st.get("done")) if not r.get("x")]


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
    rows = _l(st.get("pending")) + _answered(st)
    return max(rows, key=lambda r: _num(r.get("ms")) or 0) if rows else {}


def _dur(ms) -> str:
    """A span long enough to read in minutes."""
    n = _num(ms)
    if n is None:
        return "?"
    if n < 90_000:
        return _s(n)
    m, sec = divmod(int(round(n / 1000)), 60)
    h, m = divmod(m, 60)
    return f"{h} h {m} m" if h else f"{m} m {sec} s"


def _kb(n) -> str:
    v = _num(n) or 0
    return f"{v / 1024:.0f} KB" if v >= 1024 else f"{int(v)} B"


def _rt(r: dict) -> dict:
    """The browser's phases of one request (or chunk) — ms each, or {}."""
    rt = r if r.get("stall") is not None and r.get("n") else _d(r.get("rt"))
    out = {}
    for k in ("stall", "conn", "ttfb", "dl", "size"):
        v = _num(rt.get(k))
        if v is not None:
            out[k] = v
    if rt.get("proto"):
        out["proto"] = str(rt["proto"])[:12]
    return out


def _phase_text(rt: dict, sms=None) -> str:
    """Where the browser says a slow request's time went, as one clause —
    empty when no phase stands out (nothing ≥ 1 s)."""
    if not rt:
        return ""
    big = max(("stall", "conn", "ttfb", "dl"), key=lambda k: rt.get(k, 0))
    v = rt.get(big, 0)
    if v < 1000:
        return ""
    over = f" (over {_t(rt['proto'], 12)})" if rt.get("proto") else ""
    if big == "stall":
        txt = (f"the browser HELD it {_s(v)} before it was sent — it had no usable connection "
               "(one that had died while the app was away, or a radio asleep)")
        if rt.get("conn", 0) >= 200:
            txt += f"; it then opened a new one in {_s(rt['conn'])}"
        return txt + over
    if big == "conn":
        return f"opening a connection took {_s(v)} (DNS / TLS){over}"
    if big == "ttfb":
        srv = f" while the server spent {_s(sms)}" if _num(sms) is not None else ""
        return (f"it was sent at once and its first byte came {_s(v)} later{srv} — "
                f"lost or queued on the way{over}")
    size = f" ({_kb(rt['size'])})" if rt.get("size") else ""
    return f"the download itself took {_s(v)}{size} — bandwidth{over}"


def _phase_short(rt: dict) -> str:
    """The same phases as a compact list for a request line: every phase worth
    naming, in order, plus the protocol."""
    if not rt:
        return ""
    names = (("stall", "held"), ("conn", "connect"), ("ttfb", "1st byte"), ("dl", "download"))
    parts = [f"{label} {_s(rt[k])}" for k, label in names if rt.get(k, 0) >= 200]
    if rt.get("proto"):
        parts.append(_t(rt["proto"], 12))
    return " · ".join(parts)


def _shared(st: dict) -> list:
    """The answered requests that each lost ≥ 1.5 s on the WAY (the server
    under 40 % of it). Two or more of them in one window is the connection,
    not one unlucky request."""
    out = []
    for r in _answered(st):
        ms, sms = _num(r.get("ms")) or 0, _num(r.get("sms"))
        if sms is None or ms - sms < 1500 or sms > 0.4 * ms:
            continue
        out.append(r)
    return out


def _away_line(st: dict) -> str:
    v = _d(st.get("vis"))
    if _num(v.get("hidden_ms")) is None:
        return ""
    return (f" The app had been in the background for {_dur(v['hidden_ms'])} and came back "
            f"{_s(v.get('back_ms'))} before this wait.")


def fingerprint(stall, server_events: list[dict] | None = None) -> str:
    """One message per gate × slowest endpoint × CAUSE per hour — NOT per
    person: when the server freezes, everybody's loader stalls on the same
    request at once, and forty identical DMs would bury the one that explains
    it (the repeat count on the next message says how far it spread). The
    cause is in it so one person's slow Wi-Fi at 09:00 cannot silence a server
    freeze on the same request at 09:30."""
    st = _d(stall)
    slow = _slowest(st)
    c = cause(st, server_events or [])
    # A connection that stalled everything names no endpoint: whichever
    # request happened to be slowest is chance, and one phone's flaky 4G
    # must not DM once per combination.
    raw = "|".join(str(x or "") for x in (
        "stall", st.get("where"), "" if c == "connection" else slow.get("p"), c))
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
    restart · froze · pending · server · connection · network · noserver ·
    page · other. `connection` = two or more requests of the window each lost
    ≥ 1.5 s on the way with next to no server time: the way itself was stuck
    (a dead connection after the app was in the background, a radio asleep),
    where `network` is one request lost among others that came back."""
    st = _d(stall)
    done = _answered(st)
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
        if len(_shared(st)) >= 2:
            return "connection"
        if ms - sms >= 1500:
            return "network"
        return "other"
    return "page" if st.get("where") == "page" else "other"


def verdict(stall, server_events: list[dict]) -> str:
    st = _d(stall)
    done = _answered(st)
    pending = _l(st.get("pending"))
    slow = max(done, key=lambda r: _num(r.get("ms")) or 0) if done else {}
    ms, sms = _num(slow.get("ms")) or 0, _num(slow.get("sms"))
    where = f"{_t(slow.get('m'), 8)} {_t(slow.get('p'))}"
    c = cause(st, server_events)
    if c == "restart":
        return ("The server was RESTARTING — the app waited for it to come back "
                "(a deploy swap, or a worker the supervisor replaced: the boot report in this chat says which).")
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
    chunks = _l(st.get("chunks"))
    chunk = max(chunks, key=lambda r: _num(r.get("ms")) or 0) if chunks else {}
    if c == "connection":
        shared = _shared(st)
        top = max(_num(r.get("sms")) or 0 for r in shared)
        txt = (f"The CONNECTION, not the server: {len(shared)} requests waited together — "
               f"up to {_s(ms)} on the way, the server spent {_s(top)} at most on any of them.")
        if st.get("where") == "page" and chunk:
            txt = (f"The page's code ({_t(chunk.get('n'), 40)}) took {_s(chunk.get('ms'))}"
                   + (f" — {_phase_text(_rt(chunk))}" if _phase_text(_rt(chunk)) else "")
                   + f". The {len(shared)} requests of the same window waited the same way "
                   f"(up to {_s(ms)}; the server spent {_s(top)} at most on any of them).")
        else:
            phase = _phase_text(_rt(slow), sms)
            if phase:
                txt += f" {where}: {phase}."
        return txt + _away_line(st)
    if c == "network":
        phase = _phase_text(_rt(slow), sms)
        return (f"{where}: the server spent only {_s(sms)}, the other {_s(ms - sms)} were on the way"
                + (f" — {phase}." if phase else " (network / Cloudflare / connection setup).")
                + _away_line(st))
    if c == "page":
        if chunk:
            phase = _phase_text(_rt(chunk))
            return (f"No request was slow — the page's code itself ({_t(chunk.get('n'), 40)}, "
                    f"{_kb(chunk.get('size'))}) took {_s(chunk.get('ms'))}"
                    + (f": {phase}." if phase else ".") + _away_line(st))
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
        env.append(f"{_dur(st.get('since_load_ms'))} after the page loaded")
    v = _d(st.get("vis"))
    if _num(v.get("hidden_ms")) is not None:
        env.append(f"in the background {_dur(v['hidden_ms'])}, back {_s(v.get('back_ms'))} before")
    hidden = (_num(st.get("total_ms")) or 0) - (_num(st.get("waited_ms")) or 0)
    if hidden >= 1000:
        env.append(f"+{_dur(hidden)} of the wait with the app away")
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
        if r.get("x"):
            req.append(f"{_t(r.get('m'), 8)} {_t(r.get('p'))} — cancelled after {_s(r.get('ms'))} "
                       "(the other copy answered first)")
            continue
        extra = []
        if _num(r.get("sms")) is not None:
            extra.append(f"server {_s(r.get('sms'))}")
        if (_num(r.get("stall")) or 0) >= 1000:
            extra.append(f"server froze {_s(r.get('stall'))} in the last minute")
        line = (f"{_t(r.get('m'), 8)} {_t(r.get('p'))} → {_num(r.get('s')) or 'no answer'} "
                f"in {_s(r.get('ms'))}" + (f" ({', '.join(extra)})" if extra else ""))
        short = _phase_short(_rt(r)) if (_num(r.get("ms")) or 0) >= 1000 else ""
        if short:
            line += f"\n    {_t(short, 160)}"
        req.append(line)
    if req:
        lines += ["", "<b>Requests (slowest first):</b>", "<pre>" + "\n".join(req[:8]) + "</pre>"]
    chunks = _l(st.get("chunks"))
    if chunks:
        rows = []
        for r in chunks[:4]:
            short = _phase_short(_rt(r))
            rows.append(f"{_t(r.get('n'), 48)} ({_kb(r.get('size'))}) {_s(r.get('ms'))}"
                        + (f"\n    {_t(short, 160)}" if short else ""))
        lines += ["", "<b>Page code fetched meanwhile:</b>", "<pre>" + "\n".join(rows) + "</pre>"]

    text = "\n".join(lines)
    if server_events:
        text += "\n\n<b>Server, same window:</b>"
        for line in perf_watch.event_lines(server_events, limit=4):
            if len(text) + len(line) > _MAX_TEXT:
                break
            text += "\n\n" + line       # a stall entry ends in </pre>, which eats one break
    else:
        text += "\n\n<i>Server, same window: nothing slow recorded.</i>"
    return text
