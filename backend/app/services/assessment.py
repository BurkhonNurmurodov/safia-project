"""«Nomzodlarni baholash» — THE rules of a supervisor-candidate assessment.

Five judging departments, two question types, one draw of 20 questions:

    Kaizen + Production   11 questions — 4 theory, 7 practical, drawn from the
                          two departments' questions together, EACH of the two
                          getting at least 2 theory and 3 practical (`min_each`)
    TB · HR · OKK          3 questions each, any type

`draw` is the only place that distribution lives; the router, the bank's
«enough questions?» card and the client all read `BLOCKS` through `meta()`.
Each judge grades only the questions of their OWN department (`own_items`);
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
#
# `min_each` (2026-10-31, the operator: «set a minimum»): a judge grades only
# their own department's questions, so a block shared by two departments must
# not leave one judge with almost nothing. Each department of the block first
# gets its minimum of every type; the rest of the type is drawn from both at
# random. Kaizen + Production: 2 + 2 theory (all four), 3 + 3 practical and the
# seventh to either — 5 or 6 questions each.
BLOCKS = (
    {"key": "kp", "departments": ("kaizen", "production"), "types": {"theory": 4, "practical": 7},
     "min_each": {"theory": 2, "practical": 3}},
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
    department: Optional[str] = None   # a block's per-department minimum; None = the block as a whole

    def as_dict(self) -> dict:
        return {"block": self.block, "qtype": self.qtype, "need": self.need, "have": self.have,
                "department": self.department}


class PoolShort(Exception):
    def __init__(self, shorts: list[Short]):
        super().__init__("question pool too small")
        self.shorts = shorts


def _parts(block: dict) -> list[dict]:
    """What the bank must hold for one block: its per-department minimums (if
    any), then the block's own totals — a total only where it asks for more
    than the minimums already guarantee."""
    out = []
    if "types" in block:
        mins = block.get("min_each") or {}
        for t, n in block["types"].items():
            m = mins.get(t, 0)
            if m:
                out.extend({"qtype": t, "department": d, "need": m} for d in block["departments"])
            if n > m * len(block["departments"]):
                out.append({"qtype": t, "department": None, "need": n})
        return out
    return [{"qtype": None, "department": None, "need": block["count"]}]


def _fits(q: dict, block: dict, qtype: Optional[str], department: Optional[str] = None) -> bool:
    return (q["department"] in block["departments"] and (qtype is None or q["qtype"] == qtype)
            and (department is None or q["department"] == department))


def shortfalls(pool: Iterable[dict]) -> list[Short]:
    """Every part of the draw the active bank cannot fill — empty = a draw works."""
    pool = list(pool)
    out = []
    for b in BLOCKS:
        for p in _parts(b):
            have = sum(1 for q in pool if _fits(q, b, p["qtype"], p["department"]))
            if have < p["need"]:
                out.append(Short(b["key"], p["qtype"], p["need"], have, p["department"]))
    return out


def draw(pool: Iterable[dict], seen: Iterable[int] = (), rng: Optional[random.Random] = None) -> list[dict]:
    """Pick the 20 questions. `pool` = the active bank as dicts with `id`,
    `department`, `qtype`, `text`. Questions in `seen` (asked of this candidate
    before) are taken only when the unseen ones run out, so a retake gets fresh
    questions wherever the bank allows. A block's per-department minimums are
    taken first, the rest of each type from the whole block. Order: block by
    block, theory before practical inside a block, random within that. Raises
    PoolShort naming every part the bank cannot fill — never a short sitting."""
    pool = list(pool)
    shorts = shortfalls(pool)
    if shorts:
        raise PoolShort(shorts)
    rng = rng or random.SystemRandom()
    seen = set(seen)

    def order(cands: list[dict]) -> list[dict]:
        fresh = [q for q in cands if q["id"] not in seen]
        old = [q for q in cands if q["id"] in seen]
        rng.shuffle(fresh)
        rng.shuffle(old)
        return fresh + old

    picked: list[dict] = []
    for b in BLOCKS:
        part: list[dict] = []
        if "types" in b:
            mins = b.get("min_each") or {}
            for qtype, n in b["types"].items():
                taken: list[dict] = []
                for d in b["departments"]:
                    taken.extend(order([q for q in pool if _fits(q, b, qtype, d)])[:mins.get(qtype, 0)])
                ids = {q["id"] for q in taken}
                rest = order([q for q in pool if _fits(q, b, qtype) and q["id"] not in ids])
                taken.extend(rest[:n - len(taken)])
                rng.shuffle(taken)
                part.extend(taken)
        else:
            part.extend(order([q for q in pool if _fits(q, b, None)])[:b["count"]])
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
        parts = [{**p, "have": sum(1 for q in pool if _fits(q, b, p["qtype"], p["department"]))}
                 for p in _parts(b)]
        blocks.append({"key": b["key"], "departments": list(b["departments"]), "parts": parts,
                       "ok": all(p["have"] >= p["need"] for p in parts)})
    return {"counts": counts, "blocks": blocks, "ready": all(b["ok"] for b in blocks)}


def meta() -> dict:
    return {
        "departments": list(DEPARTMENTS),
        "seat_order": list(SEAT_ORDER),
        "types": list(TYPES),
        "blocks": [{"key": b["key"], "departments": list(b["departments"]),
                    "types": b.get("types"), "min_each": b.get("min_each"), "count": b.get("count"),
                    "parts": _parts(b)} for b in BLOCKS],
        "total": TOTAL,
        "limits": {"text": MAX_TEXT, "note": MAX_NOTE, "feedback": MAX_FEEDBACK},
    }


def _pct(a: int, b: int) -> Optional[float]:
    return round(a * 100.0 / b, 1) if b else None


def own_items(items: list[dict], department: str) -> list[dict]:
    """The questions ONE judge grades: those of their own department. A judge
    answers for their department and nothing else (the operator, 2026-10-31);
    the Kaizen + Production block is split between those two judges by each
    question's own department."""
    return [it for it in items if it["department"] == department]


def results(items: list[dict], evaluations: list[dict]) -> dict:
    """Fold the SUBMITTED scorecards. `items` = [{id, position, department,
    qtype, text}]; `evaluations` = [{department, judge_name, submitted_at,
    overall_feedback, grades: {item_id: {verdict, note}}}] — submitted ones
    only. Each question is judged by the judge of ITS department alone; a grade
    a scorecard holds on another department's question is never counted.
    Percentages are pass ÷ graded, never a mean of means."""
    def grade(e: Optional[dict], it: dict) -> dict:
        return ((e.get("grades") or {}).get(it["id"]) or {}) if e else {}

    judges = []
    for e in sorted(evaluations, key=lambda e: SEAT_ORDER.index(e["department"])
                    if e["department"] in SEAT_ORDER else 99):
        own = own_items(items, e["department"])
        passed = sum(1 for it in own if grade(e, it).get("verdict") == "pass")
        graded = sum(1 for it in own if grade(e, it).get("verdict") in VERDICTS)
        judges.append({
            "department": e["department"], "judge_name": e.get("judge_name"),
            "submitted_at": e.get("submitted_at"), "overall_feedback": e.get("overall_feedback"),
            "passed": passed, "graded": graded, "total": len(own), "pct": _pct(passed, graded),
        })

    by_dept = {e["department"]: e for e in evaluations}
    rows = []
    for it in items:
        e = by_dept.get(it["department"])
        g = grade(e, it)
        verdict = g.get("verdict") if g.get("verdict") in VERDICTS else None
        note = (g.get("note") or "").strip() or None
        rows.append({
            "item_id": it["id"], "position": it["position"], "department": it["department"],
            "qtype": it["qtype"], "text": it["text"],
            "verdict": verdict, "note": note, "submitted": e is not None,
            "judge_name": e.get("judge_name") if e else None,
            # the older shape (a verdict / note per judging department), kept
            # so a tab still open on the first bundle renders the same facts
            "verdicts": {it["department"]: verdict} if verdict else {},
            "notes": [{"department": it["department"], "judge_name": e.get("judge_name"), "note": note}] if note else [],
            "passed": 1 if verdict == "pass" else 0, "judged": 1 if verdict else 0,
            "pct": _pct(1 if verdict == "pass" else 0, 1 if verdict else 0),
        })

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
        "by_department": fold(lambda r: r["department"]),
        "by_type": fold(lambda r: r["qtype"]),
        "overall": {"passed": total_p, "judged": total_j, "pct": _pct(total_p, total_j)},
    }
