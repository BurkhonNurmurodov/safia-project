"""Ojidaniya interval arithmetic — THE definition of how a cell's idle time is
counted. Every surface that reports a waiting figure for a cell reads it from
here; a second spelling of "how long did this cell wait" is how the bug below
survived unnoticed for as long as it did.

**Why this module exists.** Until 2026-08-20 an ojidaniya was entered as
MINUTES per category, with no start and no end. Two categories waiting on the
SAME wall-clock stretch were therefore simply added together: one 30-minute stop
filed under Cat A and Cat B became 60 minutes of downtime. Nothing on screen
could reveal that — with only a duration recorded, an overlap is not merely
uncounted, it is unrepresentable.

An entry is now a start -> end RANGE, so the honest total is the UNION of the
ranges: merged, each minute counted exactly ONCE. The per-category durations
survive for explaining WHY the cell waited, and they may overlap each other
freely; the union is the only figure that answers HOW LONG it waited. The
difference between the two (``overlap_min``) is exactly what the old method
over-reported, and it is returned rather than hidden — an operator who cannot
see the correction has no reason to trust the new number.

**To'xtaganda / To'xtamaganda is not a second measure.** It says whether the
cell actually stopped working FOR THAT ojidaniya (user, 2026-08-20). Only
stopped ranges enter the union. A not-stopped range is recorded with its
reason, is reported as a count, and overlaps whatever it likes without
consequence — it never adds to, and never subtracts from, the total.

**Midnight needs no special case.** Minutes are minutes-from-midnight. A range
whose end lands at or before its start crossed midnight, so its end is carried
into the next day (+1440) and every span is a real forward interval. That makes
shift 2 (17:00 -> 09:00) ordinary arithmetic rather than a branch, and it is
what bounds a range to 1..1439 minutes: a start equal to its end is rejected at
the door rather than silently becoming 24 hours.

**A minute is not always the whole cell** (2026-09-29). A Tozalash entry names
how many people cleaned («Tozalovchilar»), and a minute only cleaning covers is
theirs alone — `people_pieces` is the one place that turns the union into
person-minutes, so the mean, the matrix and the cost cannot count one cleaning
three ways. The union itself — the answer to «how long» — is untouched by it.
"""
from typing import Iterable, Optional

DAY = 1440
MAX_SPAN = DAY - 1          # 23h59m — the longest range a single day can hold


def to_min(hhmm: Optional[str]) -> Optional[int]:
    """"HH:MM" -> minutes from midnight, or None when it is not a clock time."""
    if not hhmm:
        return None
    try:
        h, m = str(hhmm).split(":")
        hh, mm = int(h), int(m)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None
    return hh * 60 + mm


def fmt_min(total: Optional[int]) -> str:
    """minutes -> "HH:MM" wall clock (wrapping past midnight)."""
    if total is None:
        return ""
    total %= DAY
    return f"{total // 60:02d}:{total % 60:02d}"


def span(start: str, end: str) -> Optional[tuple[int, int]]:
    """One range as a forward (start, end) minute pair, end carried past
    midnight when it lands at or before the start. None when either side is not
    a clock time. A zero-length range is impossible by construction: end == start
    is read as "crossed midnight", which the caller rejects up front."""
    s, e = to_min(start), to_min(end)
    if s is None or e is None:
        return None
    if e <= s:
        e += DAY
    return (s, e)


def duration(start: str, end: str) -> int:
    """Length of ONE range in minutes (0 when unparseable)."""
    sp = span(start, end)
    return sp[1] - sp[0] if sp else 0


def merge(spans: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    """Overlapping and touching spans folded into the fewest disjoint spans.
    Touching (a.end == b.start) merges too: 10:00-10:30 and 10:30-11:00 are one
    unbroken hour of waiting, not two events with a seam."""
    ordered = sorted(spans)
    out: list[tuple[int, int]] = []
    for s, e in ordered:
        if out and s <= out[-1][1]:
            if e > out[-1][1]:
                out[-1] = (out[-1][0], e)
        else:
            out.append((s, e))
    return out


def union_minutes(spans: Iterable[tuple[int, int]]) -> int:
    """Total wall-clock minutes covered, each minute counted once. THE number."""
    return sum(e - s for s, e in merge(spans))


def _spans_of(rows: Iterable[dict], stopped_only: bool = True) -> list[tuple[int, int]]:
    out = []
    for r in rows:
        if stopped_only and not r.get("stopped", True):
            continue
        sp = span(r.get("start"), r.get("end"))
        if sp:
            out.append(sp)
    return out


def merged_spans(rows: Iterable[dict], stopped_only: bool = True) -> list[dict]:
    """The rows' union as ``{start, end, minutes}`` segments — what a timeline
    draws underneath the category lanes.

    ``stopped_only=False`` unions whatever it is handed, which is what the
    To'xtamaganda half needs: there the recorded fact IS the subject, and a bar
    drawn from the stopped rows would be empty on a view that has none. It stays
    ONE definition of "these ranges, each minute once" — a second spelling is
    how a bar and the total printed above it start disagreeing."""
    return [{"start": fmt_min(s), "end": fmt_min(e), "minutes": e - s}
            for s, e in merge(_spans_of(rows, stopped_only=stopped_only))]


def people_pieces(rows: Iterable[dict], people: Optional[float],
                  stopped_only: bool = True) -> dict:
    """The rows' union split by HOW MANY PEOPLE stood in each minute —
    ``{people: minutes}``. THE rule for turning a cell's waiting into
    person-minutes; every figure that multiplies minutes by a headcount (the
    unit's weighted mean, the «Toifalar bo'yicha» share, «Xarajat») reads it.

    A row counts the WHOLE CELL (``people``) unless it names its own crew in
    ``cleaners`` — the «Tozalovchilar» of a Tozalash entry (2026-09-29, the
    operator's rulings), because not everybody in a cell cleans. Minute by
    minute:

    * a minute ANY whole-cell row covers counts the whole cell, once — a cell
      stopped for another cause is already all stopped, so a cleaning inside it
      adds nothing;
    * a minute only counted rows cover counts the Σ of their counts — two groups
      cleaning at once — never above the cell's people. The same cap keeps a
      count typed before the brigadir LOWERED the cell's people honest.

    ``people`` unknown (nobody typed the cell's number) is still an answer for
    the counted minutes — the crew is stated on the entry itself — so they keep
    their uncapped count, while a minute that needs the whole cell lands under
    the key ``None``. Σ of the values is always ``union_minutes`` of the same
    rows: this splits the union, it never re-measures it, so a day with no count
    anywhere is exactly ``{people: union}``, the figure every reader had before.
    """
    items: list[tuple[int, int, Optional[int]]] = []
    for r in rows:
        if stopped_only and not r.get("stopped", True):
            continue
        sp = span(r.get("start"), r.get("end"))
        if not sp:
            continue
        c = r.get("cleaners")
        items.append((sp[0], sp[1], None if c is None else max(0, int(c))))
    out: dict = {}
    if not items:
        return out
    whole = None if people is None else float(people)
    cuts = sorted({s for s, _, _ in items} | {e for _, e, _ in items})
    for a, b in zip(cuts, cuts[1:]):
        covered, full, crew = False, False, 0
        for s, e, c in items:
            if s <= a and b <= e:
                covered = True
                if c is None:
                    full = True
                    break
                crew += c
        if not covered:
            continue
        if full:
            key = whole
        else:
            key = float(crew) if whole is None else min(whole, float(crew))
        out[key] = out.get(key, 0) + (b - a)
    return out


def person_minutes(pieces: dict) -> float:
    """Σ people × minutes over `people_pieces` — what the waiting cost in
    people's time. A piece whose headcount is unknown (key ``None``) adds
    nothing: it is the caller's to report as unpriced, never to guess."""
    return sum(float(k) * m for k, m in pieces.items() if k is not None)


def cell_share_minutes(pieces: dict, people: float) -> float:
    """Minutes of the WHOLE CELL's time — each piece scaled by its share of the
    cell's people. A whole-cell minute is one minute; 20 minutes cleaned by 2 of
    10 people are 4. «Toifalar bo'yicha» reads this (the operator's call), so a
    Tozalash row there stays comparable with the causes that stop everybody.
    Only defined for a cell with people; the caller guarantees ``people > 0``."""
    p = float(people)
    return sum(m * (float(k) / p) for k, m in pieces.items() if k is not None)


def overlap_ids(rows: Iterable[dict]) -> list:
    """Ids of the STOPPED ranges that share at least one minute with another
    stopped range. Marked in the UI so an operator can see which entries the old
    sum was double-counting — the correction has to be pointable-at, not just
    arithmetically true."""
    items = [(r.get("id"), span(r.get("start"), r.get("end")))
             for r in rows if r.get("stopped", True)]
    items = [(i, sp) for i, sp in items if sp]
    hit = []
    for a, (s1, e1) in items:
        for b, (s2, e2) in items:
            if a is not b and s1 < e2 and s2 < e1:
                hit.append(a)
                break
    return hit


def summarize(rows: list[dict]) -> dict:
    """The whole per-cell ledger in one pass.

    ``stopped_union_min`` is the true total; ``stopped_sum_min`` is what the
    old minutes-only method would have reported, and their difference is the
    over-count. Both are returned because a corrected figure that arrives with
    no trace of the correction just looks like the number changed."""
    stopped = [r for r in rows if r.get("stopped", True)]
    not_stopped = [r for r in rows if not r.get("stopped", True)]

    spans = _spans_of(stopped)
    union = union_minutes(spans)
    naive = sum(e - s for s, e in spans)

    by_cat: dict[str, dict] = {}
    for r in rows:
        cat = r.get("category")
        c = by_cat.setdefault(cat, {"union_min": 0, "sum_min": 0, "count": 0,
                                    "not_stopped_count": 0})
        c["count"] += 1
        if not r.get("stopped", True):
            c["not_stopped_count"] += 1
    for cat, c in by_cat.items():
        cat_spans = _spans_of(r for r in stopped if r.get("category") == cat)
        c["union_min"] = union_minutes(cat_spans)
        c["sum_min"] = sum(e - s for s, e in cat_spans)

    return {
        "stopped_union_min": union,
        "stopped_sum_min": naive,
        "overlap_min": max(0, naive - union),
        "stopped_count": len(stopped),
        "not_stopped_count": len(not_stopped),
        "not_stopped_sum_min": sum(e - s for s, e in _spans_of(not_stopped, stopped_only=False)),
        "by_category": by_cat,
        "overlap_ids": overlap_ids(rows),
        "merged": merged_spans(stopped, stopped_only=False),
    }
