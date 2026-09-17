"""The admin's report when the in-app proof camera fails on somebody's device.

`/proof/camera` (frontend/src/pages/ProofCamera.jsx) puts a leader on a failure
screen when the camera cannot be opened, or opens and sends no picture. Until
this existed the only record of that screen was a leader's screenshot, which
says WHAT happened and nothing about WHY — and the why lives only on that
device. So the page keeps a flight recorder of every camera event, and on a
failure it runs a few bounded probes and posts everything through the one
client-failure door, `POST /api/crash-report` with kind "camera"
(frontend/src/utils/cameraDiag.js gathers it).

This module turns that payload into the admin's Telegram message, the log line
and the de-duplication key. It names a LIKELY CAUSE and prints every fact the
guess was drawn from underneath it, so a wrong guess shows itself as one.

The probes, and what each one separates:
  frames   one frame read straight off the stream, bypassing the <video>
           element — a camera that sends while the page does not show it (a
           playback fault in the page), against a camera sending nothing.
  smaller  the same stream re-asked for 640×480 — a device that cannot deliver
           the size the page asks for, against a camera that sends nothing at
           any size (stuck, or held somewhere else).
  others   the other camera pages open in the same Telegram, asked over a
           BroadcastChannel — a minimized camera page still holding the camera.
  holders  what earlier camera pages on the device last wrote to localStorage —
           the same question, for a page too frozen to answer.

Nothing here may raise: the payload is shaped by a client, and a report that
fails to render is a failure nobody hears about.
"""
import hashlib
import html
import json
from datetime import datetime, timedelta, timezone

# The plant's wall clock (Tashkent, no DST) — the hours a shift is read in.
_TZ = timezone(timedelta(hours=5))
# Telegram refuses a message over 4096 characters. The timeline is what gives.
_MAX_TEXT = 3900
_MAX_LOG = 20000
_TIMELINE_MAX = 60

_BUSY = {"NotReadableError", "TrackStartError", "AbortError"}
_CONSTRAINT = {"OverconstrainedError", "ConstraintNotSatisfiedError"}
_MISSING = {"NotFoundError", "DevicesNotFoundError"}

# What the leader was looking at, in the words on their screen.
_SCREEN = {
    "stalled": "«Kamera tasvir bermayapti»",
    "failed": "«Kamera ochilmadi»",
    "none": "«Kamera topilmadi»",
}


def _d(v) -> dict:
    return v if isinstance(v, dict) else {}


def _l(v) -> list:
    return v if isinstance(v, list) else []


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _t(v, n: int = 120) -> str:
    """Client-supplied text made safe to print: one line, trimmed, escaped."""
    if v is None or v == "":
        return ""
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)
    s = " ".join(s.split())
    if len(s) > n:
        s = s[: n - 1] + "…"
    return html.escape(s)


def _yn(v) -> str:
    return "yes" if v is True else "no" if v is False else "?"


def _fmt(n) -> str:
    if n is None:
        return "?"
    return str(int(n)) if float(n).is_integer() else f"{n:.1f}"


def _size(w, h) -> str:
    w, h = _num(w), _num(h)
    return "?" if w is None or h is None else f"{_fmt(w)}×{_fmt(h)}"


def _pair(v) -> str:
    p = _l(v)
    return _size(p[0], p[1]) if len(p) == 2 else "?"


def _range(v) -> str:
    p = _l(v)
    if len(p) != 2 or all(_num(x) is None for x in p):
        return ""
    return f"{_fmt(_num(p[0]))}–{_fmt(_num(p[1]))}"


def _clock(ms) -> str:
    n = _num(ms)
    if not n:
        return "?"
    try:
        return datetime.fromtimestamp(n / 1000, _TZ).strftime("%H:%M")
    except (OverflowError, OSError, ValueError):
        return "?"


def _ago(ms) -> str:
    n = _num(ms)
    if n is None:
        return "?"
    s = max(0, int(n / 1000))
    if s < 90:
        return f"{s} s"
    if s < 90 * 60:
        return f"{s // 60} min"
    return f"{s // 3600} h"


def _label(o: dict) -> str:
    """How a camera page is named in a message: by the task it was shooting."""
    name = o.get("taskName") or (f"task {o.get('task')}" if o.get("task") else "a camera page")
    return f"«{_t(name, 60)}»"


def _rows(c: dict) -> list:
    out = []
    for r in _l(c.get("timeline"))[-_TIMELINE_MAX:]:
        r = _l(r)
        if len(r) >= 3 and _num(r[0]) is not None:
            out.append(r)
    return out


def _last(c: dict, ev: str) -> str:
    for r in reversed(_rows(c)):
        if r[1] == ev:
            return str(r[2] or "")
    return ""


def _backgrounded(c: dict) -> bool:
    for r in _rows(c):
        if (r[1] == "page" and r[2] == "hidden") or (r[1] == "telegram" and r[2] == "deactivated") \
                or (r[1] == "open" and "page hidden" in str(r[2])):
            return True
    return False


def _live_other(c: dict) -> dict:
    """Another camera page of this Telegram that answered holding a live camera."""
    for o in _l(c.get("others")):
        o = _d(o)
        if o.get("live"):
            return o
    return {}


def _stale(c: dict) -> str:
    """An earlier camera page on this device last seen holding the camera."""
    now = _num(c.get("now"))
    for h in _l(c.get("holders")):
        h = _d(h)
        if h.get("live") and not h.get("released"):
            seen = _ago(now - h["beat"]) if now and _num(h.get("beat")) else "?"
            return (f"An earlier camera page ({_label(h)}) took the camera at {_clock(h.get('opened'))} "
                    f"and was last seen still holding it {seen} ago.")
    return ""


def fingerprint(cam, who: str) -> str:
    """One message per person, per kind of failure, per hour.

    The PERSON is in it on purpose: leaders on identical tablets share one user
    agent, and folding them together would hide how far a failure has spread.
    Whether the failing page was on screen is in it too, so a minimized page
    failing in the background cannot silence the report from the page the
    leader is actually looking at."""
    c = _d(cam)
    env = _d(c.get("env"))
    raw = "|".join(str(x or "") for x in (
        "camera", who, c.get("screen"), c.get("trigger"),
        _d(c.get("error")).get("name"), env.get("model"), env.get("vis"),
    ))
    return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()


def log_json(cam) -> str:
    try:
        s = json.dumps(cam, ensure_ascii=False, default=str, separators=(",", ":"))
    except Exception:
        s = repr(cam)
    return s if len(s) <= _MAX_LOG else s[:_MAX_LOG] + "…"


def verdict(cam) -> str:
    """The most likely cause, in a sentence or two, drawn only from facts the
    message prints below it. HTML-safe: every client string is escaped."""
    c = _d(cam)
    trig = c.get("trigger")
    err = str(_d(c.get("error")).get("name") or "")
    other = _live_other(c)
    held = ""
    if other:
        where = ("minimized" if other.get("active") is False
                 else "in the background" if other.get("vis") != "visible" else "on screen")
        held = (f"Another camera page in this Telegram is still open ({_label(other)}, {where}) "
                "and holds the camera.")
    cut = (" The leader pressed Retry while the report was being collected, so not every probe ran."
           if c.get("interrupted") else "")

    if c.get("still") is False and not c.get("interrupted"):
        return "The camera came back by itself before the report was sent: a slow start, not a lasting failure."

    if trig == "gum_error":
        if err in _BUSY:
            base = ("Android refused to start the camera: another app or window is using it, "
                    "or the camera service is stuck.")
        elif err in _CONSTRAINT:
            base = "The camera has no mode that matches what the page asked for."
        elif err in _MISSING:
            base = "The device reported no usable camera."
        else:
            base = f"Opening the camera failed with {html.escape(err) or 'an unnamed error'}."
        return " ".join(x for x in (base, held) if x) + cut

    if trig == "open_timeout":
        parts = ["Opening the camera never finished; the page gave up after 20 s."]
        if held:
            parts.append(held)
        elif _backgrounded(c):
            parts.append("Telegram went to the background while it was opening, which can leave the open hanging.")
        elif _d(c.get("env")).get("perm") == "prompt":
            parts.append("The «Allow camera?» prompt was most likely never answered.")
        return " ".join(parts) + cut

    if trig == "no_frames":
        frames = _d(c.get("frames"))
        smaller = _d(c.get("smaller"))
        track = _d(c.get("track"))
        st = _d(track.get("settings"))
        opened = _size(st.get("w"), st.get("h"))
        if frames.get("got") is True:
            play = _last(c, "play")
            return ("The camera IS sending frames (one was read straight off the stream), but the page's "
                    "video element is not showing them: a playback fault in the page, not the camera"
                    + (f"; play() was rejected with {_t(play, 60)}." if play else ".") + cut)
        if held:
            return held + " This page receives no frames while it does." + cut
        if track.get("state") == "ended":
            return "Android ended the camera stream before it sent a single frame." + cut
        if smaller.get("got") is True:
            if _l(smaller.get("to")) and smaller.get("to") == smaller.get("from"):
                return ("Frames started once the stream was re-configured, at the same size: the camera was "
                        "stuck on its first start rather than unable to deliver the size." + cut)
            return (f"The camera sends nothing at {opened} but works at {_pair(smaller.get('to'))}: this "
                    "device cannot deliver the picture size the page asks for." + cut)
        if smaller.get("tried") and smaller.get("got") is False:
            stale = _stale(c)
            return (f"The camera sends nothing at any size tried ({opened}, then {_pair(smaller.get('to'))}): "
                    "it is stuck, or held outside this page — by another app, or by a Telegram window too "
                    "frozen to answer." + (f" {stale}" if stale else "") + cut)
        stale = _stale(c)
        return (f"The camera opened ({opened}) and sent no frames; the probes could not narrow it further."
                + (f" {stale}" if stale else "") + cut)

    return "The page did not say which check failed; see the details below." + cut


def _frames_text(f: dict) -> str:
    if not f:
        return "not run"
    via = f" ({_t(f.get('via'), 12)})" if f.get("via") else ""
    if f.get("got") is True:
        return f"YES — {_size(f.get('w'), f.get('h'))} after {_t(f.get('after'), 6)} ms{via}"
    if f.get("got") is False:
        if f.get("error"):
            return f"failed: {_t(f.get('error'), 40)}{via}"
        if f.get("waited"):
            return f"none in {_t(f.get('waited'), 6)} ms{via}"
        return f"none ({_t(f.get('why'), 30) or '?'}){via}"
    return f"not run ({_t(f.get('why'), 40) or '?'})"


def _smaller_text(s: dict) -> str:
    if not s:
        return "not run (only for a stream that opened and sent nothing)"
    if not s.get("tried"):
        return f"not run ({_t(s.get('why'), 40) or '?'})"
    if s.get("applied") != "ok":
        return f"{_pair(s.get('from'))} → re-configuring {_t(s.get('applied'), 30)}"
    return f"{_pair(s.get('from'))} → {_pair(s.get('to'))}, frames: {_frames_text(s)}"


def message(cam, *, who: str, version: str = "", ua: str = "", repeats: int = 0) -> str:
    """The admin's Telegram message (HTML, under Telegram's 4096 limit)."""
    try:
        return _message(_d(cam), who=who, version=version, ua=ua, repeats=repeats)
    except Exception as e:  # a malformed payload must still reach somebody
        return ("📷 <b>Camera failure</b> — the report could not be laid out "
                f"({html.escape(type(e).__name__)}).\nWho: {html.escape(who)}\n\n"
                f"<pre>{html.escape(log_json(cam)[:3000])}</pre>")


def _message(c: dict, *, who: str, version: str, ua: str, repeats: int) -> str:
    ctx = _d(c.get("ctx"))
    env = _d(c.get("env"))
    tg = _d(env.get("tg"))
    track = _d(c.get("track"))
    st = _d(track.get("settings"))
    caps = _d(track.get("caps"))
    video = _d(c.get("video"))
    opens = _d(c.get("opens"))
    err = _d(c.get("error"))
    trig = c.get("trigger")

    L = ["📷 <b>Camera failure</b>" + (f" · v{_t(version, 20)}" if version else ""),
         f"Who: {html.escape(who)}"]
    proof = " · ".join(x for x in (
        f"«{_t(ctx.get('task'), 80)}»" if ctx.get("task") else "",
        _t(ctx.get("leader"), 60),
        _t(ctx.get("date"), 12),
        f"cell {_t(ctx.get('cell'), 12)}" if ctx.get("cell") else "",
        "late filing" if ctx.get("late") else "",
    ) if x)
    if proof:
        L.append(f"Proof: {proof}")
    what = {
        "no_frames": "the camera opened but no picture arrived (no frame for 6 s; the page had already re-opened it once)",
        "open_timeout": "opening the camera did not finish within 20 s",
        "gum_error": f"opening failed with {_t(err.get('name'), 40) or '?'}"
                     + (f": {_t(err.get('message'), 140)}" if err.get("message") else ""),
    }.get(trig, _t(trig, 40) or "no check named")
    L.append(f"Screen: {_SCREEN.get(c.get('screen'), _t(c.get('screen'), 20))} — {what}")
    if repeats:
        L.append(f"Also seen {repeats}× in the previous hour")
    L += ["", f"<b>Likely cause:</b> {verdict(c)}"]

    # ── the device ─────────────────────────────────────────────────────────
    L += ["", "<b>Device</b>"]
    L.append(" · ".join(x for x in (
        _t(env.get("model"), 60) or "model unknown",
        f"Android {_t(env.get('android'), 12)}" if env.get("android") else "",
        f"WebView {_t(env.get('webview'), 24)}" if env.get("webview") else "",
        f"Telegram {_t(env.get('telegram'), 16)}" if env.get("telegram") else "",
        _t(env.get("perf"), 12),
        f"{_t(tg.get('platform'), 16)} Bot API {_t(tg.get('api'), 8)}" if tg else "",
    ) if x))
    L.append(" · ".join(x for x in (
        f"screen {_t(env.get('screen'), 24)}" if env.get("screen") else "",
        f"{_fmt(_num(env.get('mem')))} GB RAM" if _num(env.get("mem")) else "",
        f"{_fmt(_num(env.get('cores')))} cores" if _num(env.get("cores")) else "",
        "online" if env.get("online") is True else "OFFLINE" if env.get("online") is False else "",
        f"page {_t(env.get('vis'), 10)}" if env.get("vis") else "",
        f"Telegram active {_yn(tg.get('active'))}" if "active" in tg else "",
        f"camera permission {_t(env.get('perm'), 10)}" if env.get("perm") else "",
    ) if x))
    if env.get("chModel") or env.get("chPlatform"):
        L.append(f"Client hints: {_t(env.get('chModel'), 40) or '?'} · platform {_t(env.get('chPlatform'), 16) or '?'}")
    if ua:
        L.append(f"UA: {_t(ua, 260)}")

    # ── the cameras ────────────────────────────────────────────────────────
    cams = c.get("cameras")
    L.append("")
    if isinstance(cams, list):
        L.append(f"<b>Cameras</b> ({len(cams)})")
        for cm in cams[:8]:
            cm = _d(cm)
            L.append(f"▸ {_t(cm.get('label'), 60) or '(no label)'} · {_t(cm.get('id'), 10) or '?'}"
                     + ("  ← this stream" if cm.get("open") else ""))
    else:
        L.append(f"<b>Cameras</b>: not listed ({_t(_d(cams).get('error'), 30) or 'no answer'})")
    if opens.get("lens"):
        L.append(f"Remembered lens: {_t(opens.get('lens'), 10)}"
                 + (" (this stream was opened with it)" if opens.get("remembered") else " (not used for this stream)"))

    # ── the stream ─────────────────────────────────────────────────────────
    L += ["", "<b>Stream</b>"]
    if track:
        L.append(f"Asked: {_t(track.get('asked'), 170) or '?'}")
        L.append(" · ".join(x for x in (
            f"Opened {_size(st.get('w'), st.get('h'))}",
            f"{_fmt(_num(st.get('fps')))} fps" if _num(st.get("fps")) else "",
            f"facing {_t(st.get('facing'), 12)}" if st.get("facing") else "",
            f"resize {_t(st.get('resize'), 16)}" if st.get("resize") else "",
            f"zoom {_fmt(_num(st.get('zoom')))}" if _num(st.get("zoom")) is not None else "",
            f"«{_t(track.get('label'), 50)}»" if track.get("label") else "",
        ) if x))
        L.append(f"Track: {_t(track.get('state'), 10) or '?'} · muted {_yn(track.get('muted'))} · "
                 f"enabled {_yn(track.get('enabled'))}")
        can = " · ".join(x for x in (
            f"width {_range(caps.get('w'))}" if _range(caps.get("w")) else "",
            f"height {_range(caps.get('h'))}" if _range(caps.get("h")) else "",
            f"fps {_range(caps.get('fps'))}" if _range(caps.get("fps")) else "",
            f"zoom {_range(caps.get('zoom'))}" if _range(caps.get("zoom")) else "",
        ) if x)
        if can:
            L.append(f"Camera can do: {can}")
    else:
        L.append("No stream is open to describe (the camera never finished opening).")
    if video:
        L.append(f"Video element: ready {_t(video.get('ready'), 3) or '?'} · {_size(video.get('w'), video.get('h'))}"
                 f" · t {_t(video.get('t'), 10) or '?'} · paused {_yn(video.get('paused'))}"
                 f" · frames {_t(video.get('frames'), 10) or '?'} · stream attached {_yn(video.get('attached'))}"
                 + (f" · box {_t(video.get('box'), 12)}" if video.get("box") else ""))
    stall = _d(c.get("stall"))
    if stall:
        L.append(f"When it was called: video {_size(stall.get('w'), stall.get('h'))} · t {_t(stall.get('t'), 10) or '?'}"
                 f" · paused {_yn(stall.get('paused'))} · ready {_t(stall.get('ready'), 3) or '?'}")
    if opens:
        L.append(f"Camera opens on this page: {_t(opens.get('total'), 4) or '0'}"
                 f" ({_t(opens.get('hidden'), 4) or '0'} while hidden)"
                 + (f" · the last took {_t(opens.get('lastMs'), 6)} ms" if _num(opens.get("lastMs")) is not None else "")
                 + (f" · page open {_ago(env.get('uptime'))}" if _num(env.get("uptime")) is not None else ""))

    # ── the probes ─────────────────────────────────────────────────────────
    L += ["", "<b>Probes</b>"]
    L.append(f"A frame read straight off the stream: {_frames_text(_d(c.get('frames')))}")
    L.append(f"Re-asked for 640×480: {_smaller_text(_d(c.get('smaller')))}")
    others = c.get("others")
    if isinstance(others, list):
        if not others:
            L.append("Other camera pages in this Telegram: none answered")
        for o in others[:4]:
            o = _d(o)
            L.append("Other camera page: " + " · ".join(x for x in (
                _label(o),
                f"page {_t(o.get('vis'), 10)}" if o.get("vis") else "",
                f"Telegram active {_yn(o.get('active'))}",
                f"camera live {_yn(o.get('live'))}",
                f"muted {_yn(o.get('muted'))}",
                _t(o.get("size"), 12),
                f"last frame {_ago(o.get('frameAgo'))} ago" if _num(o.get("frameAgo")) is not None else "",
                f"opens {_t(o.get('opens'), 4) or '0'} ({_t(o.get('opensHidden'), 4) or '0'} hidden)",
                f"showing {_t(o.get('err'), 12)}" if o.get("err") else "",
            ) if x))
    else:
        L.append(f"Other camera pages in this Telegram: not asked ({_t(_d(others).get('why'), 20) or 'unsupported'})")
    now = _num(c.get("now"))
    for h in _l(c.get("holders"))[:4]:
        h = _d(h)
        seen = f"{_ago(now - h['beat'])} ago" if now and _num(h.get("beat")) else "?"
        state = ("still holding the camera" if h.get("live") and not h.get("released")
                 else f"let it go at {_clock(h.get('released'))}" if _num(h.get("released")) else "not holding it")
        L.append("Earlier camera page on this device: " + " · ".join(x for x in (
            _label(h),
            f"took the camera at {_clock(h.get('opened'))}",
            f"last seen {seen} ({_t(h.get('vis'), 10) or '?'})",
            state,
        ) if x))
    if c.get("interrupted"):
        L.append("The probes were cut short: the leader pressed Retry.")

    head = "\n".join(L)
    if len(head) > _MAX_TEXT:  # every line closes its own tags, so a line boundary is a safe cut
        head = head[:_MAX_TEXT].rsplit("\n", 1)[0] + "\n…"

    # ── the timeline: as much of the END as still fits ─────────────────────
    lines = []
    for r in _rows(c):
        n = _num(r[3]) if len(r) > 3 else None
        lines.append(f"{r[0] / 1000:7.1f}  {_t(r[1], 12)} {_t(r[2], 150)}"
                     + (f" ×{int(n)}" if n and n > 1 else ""))
    budget = _MAX_TEXT - len(head) - 140
    kept = []
    for line in reversed(lines):
        if budget - len(line) - 1 < 0:
            break
        budget -= len(line) + 1
        kept.append(line)
    if not kept:
        return head
    kept.reverse()
    dropped = len(lines) - len(kept)
    return (head + "\n\n<b>Timeline</b> (seconds since the page opened"
            + (f"; {dropped} earlier events left out" if dropped else "") + ")\n<pre>"
            + "\n".join(kept) + "</pre>")
