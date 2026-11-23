"""WHO filed a cell concern — the Verifix person behind «Kim yozgan» (2026-11-23).

Until 2026-11-23 a worker TYPED their name on the cell's PC (the 2026-09-04
ruling), so one person sat in the register under many spellings («Мастура»,
«PARDAYEVA MASTURA»…). From that day the form PICKS the name from the cell's
people in Verifix (`roster` / `search`) and the row carries the employee id
(`leader_concerns.worker_id`); `worker_name` / `concern_owner` hold the Verifix
name, so every reader that prints or groups by it is unchanged.

A typed name — the filings made before, or a PC still on an older bundle — is
matched against the people who worked in that cell that day (`pick`): every
typed word one of a single person's own (surname or first name for a one-word
entry), else the platform's surname + first-name scorer
(`name_map._pair_score`) with a clear winner. Two people who fit, or none,
leave the row as typed — never a guess. The typed text is kept in
`worker_typed` whenever a match replaced it.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import timedelta
from functools import lru_cache
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Cell, KelishPlacement, LeaderConcern
from app.services import people
from app.services.cell_lookup import norm_code
from app.services.kelish import worker_key
from app.services.name_map import _name_tokens, _pair_score

log = logging.getLogger(__name__)

LIMIT = 30
MARGIN = 0.1      # a fuzzy winner must beat the runner-up by this much


# ── the matcher ───────────────────────────────────────────────────────────────

@lru_cache(maxsize=32768)
def _toks(name: str) -> tuple:
    return tuple(_name_tokens(name))


def _exact(typed: tuple, cand: tuple) -> bool:
    """Every typed word is one of the candidate's own words — a single word
    only against the surname or first name (a patronymic is somebody's father)."""
    pool = list(cand[:2] if len(typed) == 1 else cand)
    for t in typed:
        if t not in pool:
            return False
        pool.remove(t)
    return bool(typed)


def _pick(typed: str, names: Iterable[str]) -> tuple[Optional[str], bool]:
    """(the ONE name in `names` the typed name is, whether two or more fit)."""
    tt = _toks(typed)
    if not tt:
        return None, False
    cands = list({worker_key(n): n for n in sorted(set(names)) if n}.values())   # one per person
    ex = [n for n in cands if _exact(tt, _toks(n))]
    if ex:
        return (ex[0], False) if len(ex) == 1 else (None, True)
    if len(tt) < 2:
        return None, False
    sc = sorted(((max(_pair_score(list(tt), list(_toks(n))), _pair_score(list(tt[::-1]), list(_toks(n)))), n)
                 for n in cands), reverse=True)
    sc = [x for x in sc if x[0] > 0]
    if len(sc) == 1 or (len(sc) > 1 and sc[0][0] - sc[1][0] >= MARGIN):
        return sc[0][1], False
    return None, bool(sc)


def pick(typed: str, names: Iterable[str]) -> Optional[str]:
    """The ONE name in `names` the typed name is, else None (none fits, or two)."""
    return _pick(typed, names)[0]


def _first(typed: str, pools: Iterable[Iterable[str]]) -> Optional[str]:
    """`pick` over each pool in turn — a pool where two fit ends the walk."""
    for names in pools:
        if names:
            hit, two = _pick(typed, names)
            if hit or two:
                return hit
    return None


def identify(db: Session, name: str) -> tuple[Optional[str], str]:
    """(employee id, the directory's spelling) of a matched Verifix name — no
    id where two people fold to it (a namesake is never guessed)."""
    dirx = people.directory(db)
    ids = dirx["by_key"].get(worker_key(name), [])
    if len(ids) == 1:
        return ids[0], dirx["by_id"][ids[0]]["name"]
    return None, name


# ── the picker ────────────────────────────────────────────────────────────────

def _row(eid, name, job, code) -> dict:
    return {"employee_id": eid, "name": name, "job": job or "", "code": code}


def roster(db: Session, codes: Iterable[str]) -> list[dict]:
    """Who Verifix has on these cells now (`kelish_placements`, open stints)."""
    want = {norm_code(c) for c in codes if c}
    if not want:
        return []
    rows = (db.query(KelishPlacement.employee_id, KelishPlacement.name, KelishPlacement.job,
                     KelishPlacement.code)
            .filter(KelishPlacement.until.is_(None), KelishPlacement.code.in_(want)).all())
    return sorted((_row(*r) for r in rows), key=lambda r: people.fold_name(r["name"]))


def search(db: Session, code: str, q: str) -> tuple[list[dict], bool]:
    """The picker's list: the cell's own people (all of them while fewer than
    two letters are typed); with a query, those of them it fits first, then
    the plant's current workers it fits — a worker lent in from another cell
    must still find themself."""
    own = roster(db, [code])
    words = [w for w in people.fold_name(q).split(" ") if w]
    if sum(len(w) for w in words) < 2:
        return own, False
    fit = [r for r in own if all(w in people.fold_name(r["name"]) for w in words)]
    seen = {r["employee_id"] for r in fit}
    more_rows, more = people.search_current(db, q, LIMIT)
    fit += [_row(r["employee_id"], r["name"], r["job"], r["code"])
            for r in more_rows if r["employee_id"] not in seen]
    return fit[:LIMIT], more or len(fit) > LIMIT


def person(db: Session, eid: str) -> Optional[str]:
    """The name of a current worker picked off the list — the placement's
    (fresher), else the directory's working entry; None for anybody else."""
    eid = str(eid or "").strip()
    if not eid:
        return None
    name = (db.query(KelishPlacement.name)
            .filter(KelishPlacement.employee_id == eid, KelishPlacement.until.is_(None)).scalar())
    if name:
        return name
    p = people.directory(db)["by_id"].get(eid)
    return p["name"] if p and p["status"] == "W" else None


def match_now(db: Session, typed: str, code: str, manager_id: Optional[int]) -> Optional[tuple]:
    """A name typed on an older bundle, matched against the cell's people now,
    then its unit's → (employee id, name) or None."""
    unit_codes = [c for (c,) in db.query(Cell.verifix_code).filter(
        Cell.manager_id == manager_id, Cell.verifix_code.isnot(None))] if manager_id else []
    hit = _first(typed, ([r["name"] for r in roster(db, [code])],
                         [r["name"] for r in roster(db, unit_codes)]))
    if not hit:
        return None
    eid = (db.query(KelishPlacement.employee_id)
           .filter(KelishPlacement.until.is_(None), KelishPlacement.name == hit).scalar())
    return (eid, hit) if eid else identify(db, hit)


# ── the filings typed before the picker ───────────────────────────────────────

_ATT_SQL = text("""
    SELECT date, verifix_code, manager_id, worker_name FROM attendance
     WHERE date BETWEEN :lo AND :hi AND worker_name IS NOT NULL AND worker_name <> ''
""")


def match_history(db: Session, dry: bool = False) -> dict:
    """Match every typed filing not yet matched against the people `attendance`
    has in its cell that day, then the day either side (a night shift), then
    its unit that day. Commits unless `dry`. → counts."""
    rows = (db.query(LeaderConcern)
            .filter(LeaderConcern.worker_name.isnot(None), LeaderConcern.worker_id.is_(None),
                    LeaderConcern.worker_typed.is_(None), LeaderConcern.entry_date.isnot(None))
            .all())
    out = {"rows": len(rows), "matched": 0, "left": 0}
    if not rows:
        return out
    lo = min(r.entry_date for r in rows) - timedelta(days=1)
    hi = max(r.entry_date for r in rows) + timedelta(days=1)
    by_cell: dict = defaultdict(set)
    by_unit: dict = defaultdict(set)
    for d, code, mid, name in db.execute(_ATT_SQL, {"lo": lo, "hi": hi}):
        if code:
            by_cell[(norm_code(code), d)].add(name)
        by_unit[(mid, d)].add(name)
    one = timedelta(days=1)
    for r in rows:
        k, d = norm_code(r.cell_code or ""), r.entry_date
        hit = _first(r.worker_name, (by_cell.get((k, d), ()),
                                     by_cell.get((k, d - one), set()) | by_cell.get((k, d + one), set()),
                                     by_unit.get((r.brigadir_manager_id, d), ())))
        if not hit:
            out["left"] += 1
            continue
        eid, name = identify(db, hit)
        out["matched"] += 1
        if not dry:
            r.worker_typed, r.worker_id = r.worker_name, eid
            r.worker_name = r.concern_owner = name
    if not dry:
        db.commit()
    return out
