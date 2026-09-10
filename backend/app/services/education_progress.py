"""THE coverage definition for «Ta'lim» — how much of a lesson a person watched.

One rule, asked by everyone: the endpoint that records a flush, the register an
admin reads, the workbook it exports, and the mark on a lesson card. A second
spelling is how a leader is shown 100% on their phone and 96% in the report
somebody forwards about them.

**Watched is a UNION, never a sum.** A lesson is a row of one-second buckets and
a bucket is watched once playback has passed through it. Re-watching the first
minute three times covers the same sixty buckets three times over and adds
nothing; skipping minutes four to seven leaves those buckets uncovered however
long the person sat on the page. This is ``idle_intervals.merge`` in seconds
instead of minutes — the same rule about the same shape, a different subject —
and it is the only form that can answer "a skipped part must not count as
watched". A sum of play time cannot: it says 100% for somebody who watched the
first half twice.

**Only 100% is watched** (the operator's directive, 2026-09-10). ``COMPLETE_AT``
is 1.0 and there is no per-lesson override, for the reason every other floor on
this platform is a constant: a threshold each lesson can quietly lower is a
threshold nobody can read off the platform. The consequence is deliberate and
sharp — 99% reports as NOT watched, so a leader who closed the tab one second
early is indistinguishable in the register from one who never opened it, and
only ``pct`` tells them apart. That is why every read surface carries the
percentage beside the flag rather than the flag alone.

**A bucket is credited on OVERLAP.** A span of 5.9→6.1 covers buckets 5 and 6,
which over-credits by up to a second at each end. That direction is chosen on
purpose: the strictness that matters is the GAP in the middle, and pairing
bucket-exact arithmetic with a 100% floor would leave completion unreachable for
everyone because of a rounding artifact nobody can see or act on.

**The denominator is the LESSON's duration, not the viewer's report.** A client
states how long the video is, and a client can lie — reporting a 10-second
duration would make 100% one flush of work. ``EducationLesson.duration_s`` holds
the longest duration any viewer has ever reported and never shrinks, so one
forged report cannot lower anybody's denominator, its own included.

**What this can and cannot prove.** A browser can POST any spans it likes, so
``allowance`` is the honest bound rather than a guarantee: coverage may not grow
faster than the wall clock the SERVER kept between flushes of one session, which
defeats a client that simply claims the whole video at once. Beyond that this is
honest-effort telemetry and must not be described as proof — the in-app camera
(``services/leader_proof``) exists precisely because leaders edited the
timestamps on proof screenshots once the numbers began to matter. If a report
has to show that somebody LEARNED something rather than PLAYED something, the
answer is a question at the end of the lesson, not a stricter tracker.
"""
from __future__ import annotations

import math
from typing import Iterable, Optional, Sequence

# A lesson is measured in whole seconds. Finer buckets buy nothing a shopfloor
# report can act on and cost a longer span list on every flush.
BUCKET_S = 1

# Only a complete watch counts. See the module docstring — deliberately a
# constant, deliberately 1.0.
COMPLETE_AT = 1.0

# The anti-forgery bound. `MAX_RATE` is the fastest a person can legitimately
# cover a video (2× playback); `SLACK_S` is the grace that keeps an honest first
# flush from tripping the check before the server has observed any elapsed time;
# `MAX_CREDIT_S` caps what ONE flush may claim, so a page parked in a background
# tab for an hour cannot come back and spend that hour. The client flushes every
# ~15s, so 90 tolerates several dropped flushes on a bad line.
MAX_RATE = 2.0
SLACK_S = 30.0
MAX_CREDIT_S = 90.0

Span = tuple[int, int]


def total_buckets(duration_s: Optional[float]) -> int:
    """How many one-second buckets a video of this length has.

    ``ceil`` rather than ``round``: a 634.28s video has a real 635th second and
    a viewer who watches to the end must be able to cover it.
    """
    try:
        d = float(duration_s or 0)
    except (TypeError, ValueError):
        return 0
    if d <= 0 or math.isnan(d) or math.isinf(d):
        return 0
    return max(1, math.ceil(d))


def quantize(raw: Iterable[Sequence[float]], total: int) -> list[Span]:
    """Float play-spans from a player → integer bucket ranges ``[a, b)``.

    Clamped to the video, so a player reporting a time past the end (they do,
    at the last frame) cannot invent buckets that would then be impossible to
    cover and would hold everyone below 100% forever.
    """
    out: list[Span] = []
    if total <= 0:
        return out
    for item in raw or ():
        try:
            start, end = float(item[0]), float(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        if math.isnan(start) or math.isnan(end):
            continue
        if end < start:
            start, end = end, start
        a = max(0, math.floor(start / BUCKET_S))
        b = min(total, math.ceil(end / BUCKET_S))
        if b <= a:
            # A span shorter than a bucket still proves that bucket was reached.
            b = min(total, a + 1)
        if b > a:
            out.append((a, b))
    return out


def merge(spans: Iterable[Sequence[int]]) -> list[Span]:
    """The UNION. Touching ranges coalesce, so ``[0,5)`` and ``[5,9)`` store as
    one ``[0,9)`` rather than two rows that drift apart over a long lesson."""
    clean: list[Span] = []
    for item in spans or ():
        try:
            a, b = int(item[0]), int(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        if b > a:
            clean.append((a, b))
    if not clean:
        return []
    clean.sort()
    out: list[Span] = [clean[0]]
    for a, b in clean[1:]:
        last_a, last_b = out[-1]
        if a <= last_b:
            out[-1] = (last_a, max(last_b, b))
        else:
            out.append((a, b))
    return out


def covered(spans: Iterable[Sequence[int]]) -> int:
    """Seconds actually watched. Assumes MERGED input — call `merge` first, or
    an overlap is counted twice and the whole rule is lost."""
    return sum(int(b) - int(a) for a, b in spans or ())


def gaps(spans: Sequence[Span], total: int) -> list[Span]:
    """The parts NOT watched, for the coverage bar and the register's tooltip.

    A percentage says how much was missed; this says WHICH part, which is what
    turns "82%" into "everybody skips minutes four to seven".
    """
    out: list[Span] = []
    if total <= 0:
        return out
    cursor = 0
    for a, b in merge(spans):
        if a > cursor:
            out.append((cursor, min(a, total)))
        cursor = max(cursor, b)
        if cursor >= total:
            break
    if cursor < total:
        out.append((cursor, total))
    return [(a, b) for a, b in out if b > a]


def pct(covered_s: int, total: int) -> float:
    """0.0–1.0. Clamped, so a stored span list that outlived a duration
    correction can never print 103%."""
    if total <= 0:
        return 0.0
    return max(0.0, min(1.0, covered_s / total))


def is_complete(covered_s: int, total: int) -> bool:
    """Watched, by the one definition. `total <= 0` is NOT complete — an unknown
    duration is unknown, and reading it as done would mark every lesson watched
    the moment a player failed to report its metadata."""
    if total <= 0:
        return False
    return pct(covered_s, total) >= COMPLETE_AT


def allowance(watch_time_s: float) -> float:
    """The most coverage the server is willing to believe, given the real time
    it has observed. See the module docstring: this defeats a client claiming
    the whole video at once, and nothing subtler."""
    return max(0.0, float(watch_time_s or 0)) * MAX_RATE + SLACK_S


def credit(elapsed_s: float, same_session: bool) -> float:
    """Real seconds a flush may add to `watch_time_s`.

    A NEW session credits nothing: the server has observed no time in it yet,
    and `SLACK_S` is what lets its first honest flush through. Capped, so a
    backgrounded page cannot bank an hour and spend it in one submission.
    """
    if not same_session:
        return 0.0
    try:
        e = float(elapsed_s)
    except (TypeError, ValueError):
        return 0.0
    if e <= 0:
        return 0.0
    return min(e, MAX_CREDIT_S)


def apply(stored: Sequence[Sequence[int]], incoming: Iterable[Sequence[float]],
          total: int, watch_time_s: float) -> dict:
    """The whole write-side computation, in one place because three callers
    need it to agree: the flush endpoint, a backfill, and any future importer.

    Returns ``{spans, covered_s, pct, complete, throttled}``. When `throttled`
    the incoming spans are DROPPED and `stored` is returned untouched — the row
    keeps the coverage the server was willing to believe, and an honest client,
    which only ever sends what it played, never reaches this branch.
    """
    base = merge(stored)
    add = quantize(incoming, total)
    if not add:
        cov = covered(base)
        return {"spans": base, "covered_s": cov, "pct": pct(cov, total),
                "complete": is_complete(cov, total), "throttled": False}

    merged = merge(list(base) + add)
    cov = covered(merged)
    if cov > allowance(watch_time_s):
        base_cov = covered(base)
        return {"spans": base, "covered_s": base_cov,
                "pct": pct(base_cov, total),
                "complete": is_complete(base_cov, total), "throttled": True}
    return {"spans": merged, "covered_s": cov, "pct": pct(cov, total),
            "complete": is_complete(cov, total), "throttled": False}


def fmt_clock(seconds: Optional[float]) -> str:
    """``634`` → ``"10:34"``. For a register cell and a workbook column, where
    a bare second count is something the reader has to divide in their head."""
    try:
        s = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        return "—"
    if s <= 0:
        return "0:00"
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"
