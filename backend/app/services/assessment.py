"""«Nomzodlarni baholash» — THE rules of a supervisor-candidate assessment.

Five judging departments, two question types, one draw of 20 questions:

    Kaizen + Production   11 questions — 4 theory, 7 practical, drawn from the
                          two departments' questions together
    TB · HR · OKK          3 questions each, any type

`draw` is the only place that distribution lives; the router, the bank's
«enough questions?» card and the client all read `BLOCKS` through `meta()`.
`results` folds the SUBMITTED scorecards only — a draft is its judge's own.
Nothing here touches the database.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable, Optional

DEPARTMENTS = ("okk", "hr", "production", "tb", "kaizen")
TYPES = ("theory", "practical")
VERDICTS = ("pass", "fail")

# The draw, block by block, in the order the panel reads them. A block either
# fixes how many of each type (`types`) or takes `count` of any type.
BLOCKS = (
    {"key": "kp", "departments": ("kaizen", "production"), "types": {"theory": 4, "practical": 7}},
    {"key": "tb", "departments": ("tb",), "count": 3},
    {"key": "hr", "departments": ("hr",), "count": 3},
    {"key": "okk", "departments": ("okk",), "count": 3},
)
TOTAL = sum(sum(b["types"].values()) if "types" in b else b["count"] for b in BLOCKS)  # 20

# The order seats are listed in — the panel's own order, the draw's blocks first.
SEAT_ORDER = ("kaizen", "production", "tb", "hr", "okk")

MAX_TEXT = 2000        # one question
MAX_NOTE = 2000        # a judge's note on one answer
MAX_FEEDBACK = 8000    # a judge's overall feedback


@dataclass
class Short:
    """A part of the draw the bank cannot fill."""
    block: str
    qtype: Optional[str]     # None = any type
    need: int
    have: int

    def as_dict(self) -> dict:
        return {"block": self.block, "qtype": self.qtype, "need": self.need, "have": self.have}


class PoolShort(Exception):
    def __init__(self, shorts: list[Short]):
        super().__init__("question pool too small")
        self.shorts = shorts


def _need(block: dict) -> list[tuple[Optional[str], int]]:
    if "types" in block:
        return [(t, n) for t, n in block["types"].items()]
    return [(None, block["count"])]


def _fits(q: dict, block: dict, qtype: Optional[str]) -> bool:
    return q["department"] in block["departments"] and (qtype is None or q["qtype"] == qtype)


def shortfalls(pool: Iterable[dict]) -> list[Short]:
    """Every part of the draw the active bank cannot fill — empty = a draw works."""
    pool = list(pool)
    out = []
    for b in BLOCKS:
        for qtype, n in _need(b):
            have = sum(1 for q in pool if _fits(q, b, qtype))
            if have < n:
                out.append(Short(b["key"], qtype, n, have))
    return out


def draw(pool: Iterable[dict], seen: Iterable[int] = (), rng: Optional[random.Random] = None) -> list[dict]:
    """Pick the 20 questions. `pool` = the active bank as dicts with `id`,
    `department`, `qtype`, `text`. Questions in `seen` (asked of this candidate
    before) are taken only when the unseen ones run out, so a retake gets fresh
    questions wherever the bank allows. Order: block by block, theory before
    practical inside a block, random within that. Raises PoolShort naming every
    part the bank cannot fill — never a short sitting."""
    pool = list(pool)
    shorts = shortfalls(pool)
    if shorts:
        raise PoolShort(shorts)
    rng = rng or random.SystemRandom()
    seen = set(seen)
    picked: list[dict] = []
    for b in BLOCKS:
        part: list[dict] = []
        for qtype, n in _need(b):
            cands = [q for q in pool if _fits(q, b, qtype)]
            fresh = [q for q in cands if q["id"] not in seen]
            old = [q for q in cands if q["id"] in seen]
            rng.shuffle(fresh)
            rng.shuffle(old)
            part.extend((fresh + old)[:n])
        part.sort(key=lambda q: TYPES.index(q["qtype"]))   # stable: random within a type
        picked.extend(part)
    return picked


def pool_status(pool: Iterable[dict]) -> dict:
    """The bank's counts (department × type) and, per block, how many the draw
    needs against how many there are — the «enough questions?» card."""
    pool = list(pool)
    counts = {d: {t: 0 for t in TYPES} for d in DEPARTMENTS}
    for q in pool:
        if q["department"] in counts and q["qtype"] in TYPES:
            counts[q["department"]][q["qtype"]] += 1
    blocks = []
    for b in BLOCKS:
        parts = [{"qtype": t, "need": n, "have": sum(1 for q in pool if _fits(q, b, t))}
                 for t, n in _need(b)]
        blocks.append({"key": b["key"], "departments": list(b["departments"]), "parts": parts,
                       "ok": all(p["have"] >= p["need"] for p in parts)})
    return {"counts": counts, "blocks": blocks, "ready": all(b["ok"] for b in blocks)}


def meta() -> dict:
    return {
        "departments": list(DEPARTMENTS),
        "seat_order": list(SEAT_ORDER),
        "types": list(TYPES),
        "blocks": [{"key": b["key"], "departments": list(b["departments"]),
                    "parts": [{"qtype": t, "need": n} for t, n in _need(b)]} for b in BLOCKS],
        "total": TOTAL,
        "limits": {"text": MAX_TEXT, "note": MAX_NOTE, "feedback": MAX_FEEDBACK},
    }


def _pct(a: int, b: int) -> Optional[float]:
    return round(a * 100.0 / b, 1) if b else None


def results(items: list[dict], evaluations: list[dict]) -> dict:
    """Fold the SUBMITTED scorecards. `items` = [{id, position, department,
    qtype, text}]; `evaluations` = [{department, judge_name, submitted_at,
    overall_feedback, grades: {item_id: {verdict, note}}}] — submitted ones
    only. Percentages are pass ÷ graded, never a mean of means."""
    judges = []
    for e in sorted(evaluations, key=lambda e: SEAT_ORDER.index(e["department"])
                    if e["department"] in SEAT_ORDER else 99):
        g = e.get("grades") or {}
        passed = sum(1 for v in g.values() if v.get("verdict") == "pass")
        graded = sum(1 for v in g.values() if v.get("verdict") in VERDICTS)
        judges.append({
            "department": e["department"], "judge_name": e.get("judge_name"),
            "submitted_at": e.get("submitted_at"), "overall_feedback": e.get("overall_feedback"),
            "passed": passed, "graded": graded, "pct": _pct(passed, graded),
        })

    rows = []
    for it in items:
        verdicts = {}
        notes = []
        for e in evaluations:
            v = (e.get("grades") or {}).get(it["id"]) or {}
            if v.get("verdict") in VERDICTS:
                verdicts[e["department"]] = v["verdict"]
            if (v.get("note") or "").strip():
                notes.append({"department": e["department"], "judge_name": e.get("judge_name"),
                              "note": v["note"].strip()})
        p = sum(1 for x in verdicts.values() if x == "pass")
        rows.append({"item_id": it["id"], "position": it["position"], "department": it["department"],
                     "qtype": it["qtype"], "text": it["text"], "verdicts": verdicts, "notes": notes,
                     "passed": p, "judged": len(verdicts), "pct": _pct(p, len(verdicts))})

    def fold(keyfn) -> dict:
        acc: dict = {}
        for r in rows:
            k = keyfn(r)
            a = acc.setdefault(k, [0, 0])
            a[0] += r["passed"]
            a[1] += r["judged"]
        return {k: {"passed": a, "judged": b, "pct": _pct(a, b)} for k, (a, b) in acc.items()}

    total_p = sum(r["passed"] for r in rows)
    total_j = sum(r["judged"] for r in rows)
    return {
        "judges": judges,
        "rows": rows,
        "by_department": fold(lambda r: r["department"]),   # the QUESTION's department
        "by_type": fold(lambda r: r["qtype"]),
        "overall": {"passed": total_p, "judged": total_j, "pct": _pct(total_p, total_j)},
    }
