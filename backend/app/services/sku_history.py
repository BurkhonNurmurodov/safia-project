"""«SKU tarixi» (/sku-history, 2026-11-24) — which SKUs came into the
«Zagruzka fayli» catalog, which left, which came back, and when.

Read off the DATED catalog (`pp_catalog.spans`) and nothing else: every unit's
catalog as it stood on each day since dating began (`TRACK_FROM`). An SKU is
`pp_calc.daily_key` — the SAP code, or «~name» for a line that has none — and
it is IN the catalog of a scope (the units the page's filters leave) on a day
when any of those units holds an ACTIVE line with that key. Three states:

    live      at least one active line
    archived  lines kept, none active (`pp_products.active` = False)
    absent    no line at all

A change is an SKU going live, or stopping being live, between two days, and
each one is told by WHY, because most of what looks like «removed» is not
(the 9 Nov copy: 350 of 460 «removals» were these):

    recoded   a line that kept its id carries another key — a code-less line
              given its SAP code (the `production.catalog.sap` grant), a code
              retyped, a code-less line renamed. Several code-less lines often
              take ONE code, so the count of SKUs moves; it is its own step.
    moved     the key left a unit inside the scope for one outside it on the
              same day (a cell's positions follow the cell, a unit merge) —
              only a narrowed scope can see one; the whole plant cannot.
    restored  it was archived in the scope the day before
    new       none of the above
    removed   it stopped being live: `how` = archived (can come back) or
              deleted

`build` is pure (no database) so the rules have a test; `load` is the one read.
A unit whose FIRST catalog came after `TRACK_FROM` left no version (an import
into an empty unit is not dated — `pp_catalog.is_empty`), so before its rows'
own creation day it is read as empty: its catalog arrives as «new» that day.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import PPCatalogVersion, PPProduct
from app.services import pp_catalog
from app.services.pp_calc import LOCAL_PREFIX, daily_key

TRACK_FROM = date(2026, 9, 24)   # the first day a catalog edit was dated

COUNTED = ("new", "restored", "removed", "archived", "deleted",
           "moved_in", "moved_out", "recoded_in", "recoded_out")
DAY_KINDS = ("new", "restored", "removed", "moved_in", "moved_out", "recoded_in", "recoded_out")


def _key(p) -> str:
    return daily_key(p.sap_code, p.name)


def _state(lines_by_unit: dict, scope: Iterable[int]) -> dict[str, str]:
    st: dict[str, str] = {}
    for m in scope:
        for p in lines_by_unit.get(m, ()):
            k = _key(p)
            if p.active:
                st[k] = "live"
            else:
                st.setdefault(k, "arch")
    return st


def _size(st: dict) -> dict:
    live = [k for k, s in st.items() if s == "live"]
    return {"total": len(live),
            "coded": sum(1 for k in live if not k.startswith(LOCAL_PREFIX))}


def _live(lines) -> set[str]:
    return {_key(p) for p in lines if p.active}


def build(segs: dict[int, list[tuple[date, list]]], scope: set[int],
          d0: date, d1: date) -> dict:
    """The history of the scope's SKUs over [d0, d1].

    `segs` = {unit: [(first day, lines), …]} oldest first, for EVERY unit with
    a catalog (units outside `scope` tell a move from a removal); each line has
    `id`, `sap_code`, `name`, `work_center`, `active`."""
    eve = d0 - timedelta(days=1)
    cur: dict[int, list] = {}
    bounds: dict[date, list] = defaultdict(list)
    for m, ss in segs.items():
        for a, lines in sorted(ss, key=lambda s: s[0]):
            if a <= eve:
                cur[m] = lines
            elif a <= d1:
                bounds[a].append((m, lines))

    state = _state(cur, scope)
    start = _size(state)
    opened = {k: d0 for k, s in state.items() if s == "live"}
    lives: dict[str, list] = defaultdict(list)
    events: list[dict] = []
    totals: Counter = Counter()
    by_day: dict[date, Counter] = defaultdict(Counter)
    size_after: dict[date, dict] = {}

    for b in sorted(bounds):
        new = dict(bounds[b])
        old = {m: cur.get(m, []) for m in new}
        cur.update(new)
        nstate = _state(cur, scope)

        id_old = {p.id: (m, p) for m, ls in old.items() for p in ls if p.id is not None}
        id_new = {p.id: (m, p) for m, ls in new.items() for p in ls if p.id is not None}
        lost_out: set[str] = set()
        gained_out: set[str] = set()
        for m in new:
            if m not in scope:
                o, n = _live(old[m]), _live(new[m])
                lost_out |= o - n
                gained_out |= n - o
        came: dict[str, list] = defaultdict(list)    # key → [(unit, line)] live now
        went: dict[str, list] = defaultdict(list)    # key → [(unit, line)] live before
        for m in new:
            if m in scope:
                for p in new[m]:
                    if p.active:
                        came[_key(p)].append((m, p))
                for p in old[m]:
                    if p.active:
                        went[_key(p)].append((m, p))

        pairs: dict[tuple, dict] = {}

        def pair(m, before, after):
            k = (_key(before), _key(after))
            pairs.setdefault(k, {
                "date": b.isoformat(), "kind": "recoded", "key": k[1], "from_key": k[0],
                "name": after.name or "", "from_name": before.name or "",
                "manager_id": m, "wc": after.work_center or "", "how": None})

        def record(kind, k, m, p, how=None):
            events.append({"date": b.isoformat(), "kind": kind, "key": k,
                           "name": p.name or "", "manager_id": m,
                           "wc": p.work_center or "", "how": how,
                           "from_key": None, "from_name": None})

        for k, s in nstate.items():
            if s != "live" or state.get(k) == "live":
                continue
            ls = came.get(k) or []
            m, p = ls[0] if ls else (None, None)
            src = [(mm, pp, id_old[pp.id][1]) for mm, pp in ls
                   if pp.id in id_old and _key(id_old[pp.id][1]) != k]
            if src:
                kind = "recoded_in"
                for mm, pp, before in src:
                    pair(mm, before, pp)
            elif k in lost_out:
                kind = "moved_in"
                record("moved_in", k, m, p)
            elif state.get(k) == "arch":
                kind = "restored"
                record("restored", k, m, p)
            else:
                kind = "new"
                record("new", k, m, p)
            totals[kind] += 1
            by_day[b][kind] += 1
            opened[k] = b

        for k, s in state.items():
            if s != "live" or nstate.get(k) == "live":
                continue
            ls = went.get(k) or []
            m, p = ls[0] if ls else (None, None)
            dst = [(mm, pp, id_new[pp.id][1]) for mm, pp in ls
                   if pp.id in id_new and _key(id_new[pp.id][1]) != k]
            if dst:
                kind = "recoded_out"
                for mm, pp, after in dst:
                    pair(mm, pp, after)
            elif k in gained_out:
                kind = "moved_out"
                record("moved_out", k, m, p)
            else:
                how = "archived" if nstate.get(k) == "arch" else "deleted"
                kind = "removed"
                totals[how] += 1
                record("removed", k, m, p, how)
            totals[kind] += 1
            by_day[b][kind] += 1
            lives[k].append((opened.pop(k, d0), b - timedelta(days=1)))

        events.extend(pairs.values())
        state = nstate
        size_after[b] = _size(state)

    for k, a in opened.items():
        lives[k].append((a, d1))

    days, size = [], start
    d = d0
    while d <= d1:
        size = size_after.get(d, size)
        days.append({"date": d.isoformat(), **{k: by_day[d][k] for k in DAY_KINDS}, **size})
        d += timedelta(days=1)

    named = {e["key"] for e in events} | {e["from_key"] for e in events if e["from_key"]}
    order = {"new": 0, "restored": 1, "recoded": 2, "moved_in": 3, "moved_out": 4, "removed": 5}
    events.sort(key=lambda e: (e["date"], -order[e["kind"]], e["key"]), reverse=True)
    return {
        "start": start,
        "end": _size(state),
        "totals": {k: totals[k] for k in COUNTED},
        "days": days,
        "events": events,
        "lives": {k: [[a.isoformat(), z.isoformat()] for a, z in v if a <= z]
                  for k, v in lives.items() if k in named},
    }


def per_unit(segs: dict, scope: Iterable[int], d0: date, d1: date) -> list[dict]:
    """Each brigadir's OWN catalog over the period — the unit as its own
    scope, so its row adds up (start + ins − outs = end) and a unit merge
    reads as a move in one row and out of the other."""
    out = []
    for m in sorted(scope):
        one = build(segs, {m}, d0, d1)
        out.append({"manager_id": m, "start": one["start"]["total"],
                    "end": one["end"]["total"], **one["totals"]})
    return out


def _born(db: Session, unit_ids: list[int]) -> dict[int, date]:
    """{unit: the day its rows were first created} for a unit whose catalog
    came after dating began and left no version older than that day."""
    first_version = dict(db.query(PPCatalogVersion.manager_id, func.min(PPCatalogVersion.valid_to))
                         .filter(PPCatalogVersion.manager_id.in_(unit_ids))
                         .group_by(PPCatalogVersion.manager_id).all())
    out = {}
    for m, created in (db.query(PPProduct.manager_id, func.min(PPProduct.created_at))
                       .filter(PPProduct.manager_id.in_(unit_ids))
                       .group_by(PPProduct.manager_id).all()):
        if created is None:
            continue
        day = created.astimezone(pp_catalog.TZ).date() if created.tzinfo else created.date()
        fv = first_version.get(m)
        if day > TRACK_FROM and (fv is None or fv >= day):
            out[int(m)] = day
    return out


def _blank_before(segs: list[tuple[date, list]], born: date) -> list[tuple[date, list]]:
    out = []
    for i, (a, ls) in enumerate(segs):
        nxt = segs[i + 1][0] if i + 1 < len(segs) else None
        if a >= born:
            out.append((a, ls))
        elif nxt is None or nxt > born:
            out += [(a, []), (born, ls)]
        else:
            out.append((a, []))
    return out


def load(db: Session, unit_ids: Iterable[int], d0: date, d1: date) -> dict:
    """{unit: [(first day, lines), …]} from the day before `d0` to `d1`."""
    ids = sorted({int(m) for m in unit_ids})
    eve = d0 - timedelta(days=1)
    born = _born(db, ids) if ids else {}
    out = {}
    for m, cats in pp_catalog.spans(db, ids, eve, d1).items():
        segs = [(a, list(cat.lines)) for cat, a, _z in cats]
        if m in born and born[m] > eve:
            segs = _blank_before(segs, born[m])
        out[m] = segs
    return out


def catalog_units(db: Session) -> set[int]:
    """Every unit that has ever had a catalog line (archived units too — their
    past is part of the history)."""
    ids = {int(m) for (m,) in db.query(PPProduct.manager_id).distinct()}
    ids |= {int(m) for (m,) in db.query(PPCatalogVersion.manager_id).distinct()}
    return ids
