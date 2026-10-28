"""TEMPORARY boot report (2026-10-28): why the cells Maksumov Sanjar's and
Xakimov Ruslan's units swapped did not take all their «Zagruzka fayli»
positions along.

The report from the floor: the two brigadirs exchanged cells, Verifix and
/cells both show the new brigadirs, but the catalog on «Zagruzka fayli» did not
fully follow the cells (services/catalog_follow). Nothing here can be answered
off a laptop copy, so this pass reads production once and says, per cell, what
the catalog follow saw and decided:

* the switch — the retroactive one-shot's flag and record (`catalog_follow
  .enabled`), the move records by state;
* the two units (and any other unit the cells' changes name): catalog
  versions, the auto-fill switch;
* every cell that stands in either unit, or whose brigadir change or move
  record names one: its columns, its unit and letter on the days that matter,
  every link event (vfx included), every move record, the retro's own entry;
* both units' catalogs at every code those cells carry — today's lines one by
  one, the lines per day since the first move, the stored quantities and typed
  pins per day, the positions no living cell of the unit can own;
* the engine's own answer NOW, read-only: the group `_candidates` would hand
  over, `build_plan`, `_probe` and `transform` over the current rows (what would
  still move, where, and what is named), and the retro's `recheck`;
* the Jurnal rows about those cells since 6 October.

READS ONLY — no lock, no write but its flag (`startup.CATALOG_SWAP_REPORT_FLAG`).
Every section runs on its own and a failing one prints its error instead of
stopping the report. DMed to Burkhon (`startup.REPORT_CHAT_BURKHON`): a short
summary, then the whole report as a .txt file. Delete this module,
`startup.report_catalog_swap` / `_catalog_swap_job` and both entrypoint calls
once it has landed.
"""
from __future__ import annotations

import json
import time
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (ActionLog, AppSetting, Cell, CellLinkEvent, Manager, PPCatalogMove,
                        PPCatalogVersion, PPDaily, PPLineDaily, PPManagerSetting, PPProduct,
                        PPWorkCenter, PPWorkCenterDaily, RoleProfile)
from app.services.cell_lookup import norm_code

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
RETRO_RECORD = "catalog_follow_retro_2026_10_26"
FALLBACK_IDS = (8, 4)          # Maksumov Sanjar, Xakimov Ruslan on the September copies


# ── small helpers ───────────────────────────────────────────────────────────

def _j(v, n: int = 900) -> str:
    s = json.dumps(v, default=str, ensure_ascii=False)
    return s if len(s) <= n else s[:n] + f"…(+{len(s) - n})"


def _d(v) -> str:
    return v.isoformat() if hasattr(v, "isoformat") else ("—" if v is None else str(v))


def _fold(s: str) -> str:
    return " ".join((s or "").lower().replace("ʻ", "'").replace("‘", "'").split())


def _which(name: str) -> Optional[str]:
    n = _fold(name)
    if "maksum" in n or "максум" in n:
        return "Maksumov"
    if any(k in n for k in ("xakimov", "hakimov", "хаким")) and ("ruslan" in n or "руслан" in n):
        return "Xakimov"
    return None


class _W:
    """The report as lines; every section runs alone."""

    def __init__(self):
        self.lines: list[str] = []
        self.errors: list[str] = []

    def __call__(self, *parts) -> None:
        self.lines.append(" ".join(str(p) for p in parts))

    def sec(self, title: str) -> None:
        self.lines += ["", "=" * 78, title, "=" * 78]

    def run(self, db: Session, title: str, fn, *args) -> None:
        self.sec(title)
        try:
            fn(db, self, *args)
        except Exception as exc:  # noqa: BLE001 — one section never stops the report
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
            tb = traceback.format_exc().strip().splitlines()[-6:]
            self(f"!! SECTION FAILED: {type(exc).__name__}: {exc}")
            for t in tb:
                self("   " + t)
            self.errors.append(f"{title}: {type(exc).__name__}: {exc}"[:300])


# ── what the report is about ────────────────────────────────────────────────

def _units(db: Session) -> tuple[dict, str]:
    found = {}
    for m in db.query(Manager).all():
        k = _which(m.name or "")
        if k and (k not in found or (found[k].archived and not m.archived)):
            found[k] = m
    note = ""
    if len(found) < 2:
        for mid in FALLBACK_IDS:
            m = db.get(Manager, mid)
            if m is not None and m.id not in {x.id for x in found.values()}:
                found[f"id{mid}"] = m
        note = "!! a name did not match — the September ids were added"
    return found, note


def _scope(db: Session, unit_ids: set) -> tuple[list, set]:
    """Every cell that stands in one of the units, or whose brigadir change or
    move record names one; and every unit those changes name."""
    E = CellLinkEvent
    ids = {cid for (cid,) in db.query(Cell.id).filter(Cell.manager_id.in_(unit_ids)).all()}
    for cid, prev, value in db.query(E.cell_id, E.prev, E.value).filter(
            E.field == "manager_id", or_(E.prev.in_(unit_ids), E.value.in_(unit_ids))).all():
        ids.add(cid)
    for cid, a, b in db.query(PPCatalogMove.cell_id, PPCatalogMove.from_unit,
                              PPCatalogMove.to_unit).filter(
            or_(PPCatalogMove.from_unit.in_(unit_ids), PPCatalogMove.to_unit.in_(unit_ids))).all():
        ids.add(cid)
    cells = db.query(Cell).filter(Cell.id.in_(ids)).order_by(Cell.verifix_code, Cell.id).all() \
        if ids else []
    other = set()
    for prev, value in db.query(E.prev, E.value).filter(
            E.field == "manager_id", E.cell_id.in_(ids)).all() if ids else []:
        other |= {u for u in (prev, value) if u is not None}
    return cells, other - unit_ids


# ── the sections ────────────────────────────────────────────────────────────

def _s_switch(db: Session, w: _W, ctx: dict) -> None:
    from app.services import catalog_follow as cf
    from app.services import cell_archive
    now = datetime.now(timezone.utc)
    w("now (UTC):", now.isoformat(timespec="seconds"), "· Tashkent:",
      now.astimezone(TZ).strftime("%Y-%m-%d %H:%M"), "· plant today:", _d(cell_archive.today()))
    w("catalog_follow.enabled (the live sweep is ON):", cf.enabled(db))
    w("FOLLOW_FROM:", _d(cf.FOLLOW_FROM))
    for k, v in db.query(AppSetting.key, AppSetting.value).filter(
            or_(AppSetting.key.like("catalog_follow%"), AppSetting.key.like("cell_links%"))
    ).order_by(AppSetting.key).all():
        if k == RETRO_RECORD:
            continue
        w(f"  setting {k} = {(v or '')[:160]}")
    raw = db.query(AppSetting.value).filter(AppSetting.key == RETRO_RECORD).scalar()
    rec = {}
    if raw:
        try:
            rec = json.loads(raw)
        except Exception:  # noqa: BLE001
            w("  retro record: unreadable JSON, first 400:", raw[:400])
    ctx["retro"] = rec
    if rec:
        head = {k: v for k, v in rec.items() if not isinstance(v, (list, dict))}
        w("retro record head:", _j(head, 1200))
        for k, v in rec.items():
            if isinstance(v, list):
                w(f"  retro record list {k}: {len(v)} entries")
            elif isinstance(v, dict) and k != "units":
                w(f"  retro record {k}: {_j(v, 600)}")
    else:
        w("retro record: none")
    w("move records by kind · state:")
    for kind, state, n in db.query(PPCatalogMove.kind, PPCatalogMove.state,
                                   func.count(PPCatalogMove.id)).group_by(
            PPCatalogMove.kind, PPCatalogMove.state).order_by(PPCatalogMove.kind,
                                                              PPCatalogMove.state).all():
        w(f"  {kind} · {state}: {n}")
    E = CellLinkEvent
    pend = db.query(func.count(E.id)).filter(E.field == "manager_id", E.applied_at.is_(None)).scalar()
    w("brigadir changes recorded and not landed (whole platform):", pend)


def _s_units(db: Session, w: _W, ctx: dict) -> None:
    from app.services import pp_catalog
    units, note = ctx["units"], ctx["units_note"]
    if note:
        w(note)
    ids = sorted({m.id for m in units.values()} | set(ctx["other_units"]))
    off = {m for (m,) in db.query(PPManagerSetting.manager_id).filter(
        PPManagerSetting.manager_id.in_(ids), PPManagerSetting.auto_fill.is_(False)).all()}
    for mid in ids:
        m = db.get(Manager, mid)
        if m is None:
            w(f"unit {mid}: GONE")
            continue
        tag = next((k for k, x in units.items() if x.id == mid), "other (named by a change)")
        w(f"unit {m.id} «{m.name}» [{tag}] shift={m.shift} factory={m.factory_id} "
          f"archived={m.archived} zagruzka_on={m.zagruzka_on} sap_autofill={'OFF' if mid in off else 'on'} "
          f"vfx_employee={m.vfx_employee_id} aliases={_j(m.name_aliases, 200)}")
        w(f"  catalog current_from={_d(pp_catalog.current_from(db, mid))} · "
          f"lines now={db.query(func.count(PPProduct.id)).filter(PPProduct.manager_id == mid).scalar()} "
          f"(active {db.query(func.count(PPProduct.id)).filter(PPProduct.manager_id == mid, PPProduct.active.is_(True)).scalar()}) · "
          f"work centres={db.query(func.count(PPWorkCenter.id)).filter(PPWorkCenter.manager_id == mid).scalar()}")
        for v in db.query(PPCatalogVersion).filter(PPCatalogVersion.manager_id == mid).order_by(
                PPCatalogVersion.valid_to, PPCatalogVersion.id).all():
            lines = v.lines or []
            w(f"  version #{v.id} [{_d(v.valid_from)} → {_d(v.valid_to)}] reason={v.reason!r} "
              f"lines={len(lines)} active={sum(1 for d in lines if d.get('active') is not False)} "
              f"wcs={len(v.work_centers or [])} made={_d(v.created_at)}")


def _s_cells(db: Session, w: _W, ctx: dict) -> None:
    from app.services import cell_archive, cell_links
    from app.services import catalog_follow as cf
    cells = ctx["cells"]
    names = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    profs = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name).filter(
        RoleProfile.id.in_({c.leader_id for c in cells if c.leader_id}
                           | {c.owner_id for c in cells if c.owner_id})).all()} if cells else {}
    cell_links.forget()             # read the links as committed now
    evs = defaultdict(list)
    E = CellLinkEvent
    for e in db.query(E).filter(E.cell_id.in_([c.id for c in cells]), E.field == "manager_id") \
            .order_by(E.effective_from, E.id).all() if cells else []:
        evs[e.cell_id].append(e)
    today = cell_archive.today()
    w(f"{len(cells)} cells. «unit@day» = cell_links.value_on (what every dated reader reads), "
      "«letter@day» = cell_links.letter_on.")
    for c in cells:
        days = sorted({cf.FOLLOW_FROM - timedelta(days=1), today}
                      | {d for e in evs.get(c.id, []) for d in (e.effective_from - timedelta(days=1),
                                                               e.effective_from)})
        trail = " · ".join(
            f"{d:%d.%m}:{cell_links.value_on(c, 'manager_id', d)}/{cell_links.letter_on(c, d) or '-'}"
            f"{'' if cell_archive.alive(c, d) else '(arch)'}" for d in days)
        w(f"cell #{c.id} {c.verifix_code} sap={c.sap_code!r} norm={norm_code(c.sap_code)!r} "
          f"letter={c.wc_group!r} unit={c.manager_id} «{names.get(c.manager_id)}» "
          f"boshqaruvchi={c.leader_id} «{profs.get(c.leader_id)}» egasi={c.owner_id} "
          f"in_load={c.in_load} archived={_d(c.archived_at)}")
        w(f"   unit/letter by day: {trail}")
    ctx["names"] = names


def _s_events(db: Session, w: _W, ctx: dict) -> None:
    E = CellLinkEvent
    cells = ctx["cells"]
    vc = {c.id: c.verifix_code for c in cells}
    if not cells:
        w("no cells")
        return
    for e in db.query(E).filter(E.cell_id.in_(list(vc))).order_by(
            E.cell_id, E.field, E.effective_from, E.id).all():
        w(f"ev #{e.id} cell {vc.get(e.cell_id)} {e.field}: {e.prev} → {e.value} "
          f"from {_d(e.effective_from)} at {_d(e.effective_at)} applied={_d(e.applied_at)} "
          f"src={e.src} by={e.by_name!r} made={_d(e.created_at)}")
        if e.vfx:
            w(f"     vfx={_j(e.vfx, 700)}")


def _s_moves(db: Session, w: _W, ctx: dict) -> None:
    cells = ctx["cells"]
    unit_ids = ctx["unit_ids"]
    vc = {c.id: c.verifix_code for c in cells}
    q = db.query(PPCatalogMove).filter(or_(
        PPCatalogMove.cell_id.in_(list(vc) or [0]),
        PPCatalogMove.from_unit.in_(unit_ids), PPCatalogMove.to_unit.in_(unit_ids))) \
        .order_by(PPCatalogMove.home_from, PPCatalogMove.id)
    rows = q.all()
    if not rows:
        w("NO move record for any of these cells or units.")
    for r in rows:
        w(f"move #{r.id} cell {vc.get(r.cell_id, r.cell_id)} event={r.event_id} kind={r.kind} "
          f"STATE={r.state} {r.from_unit}→{r.to_unit} h={_d(r.home_from)} S={_d(r.storage_from)} "
          f"code={r.code} letter {r.letter_from!r}→{r.letter_to!r} whole={r.whole_code} "
          f"tries={r.tries} next={_d(r.next_try_at)} made={_d(r.created_at)} upd={_d(r.updated_at)} by={r.by_name!r}")
        w(f"     lines moved={len(r.line_ids or [])} wc={_j(r.wc_ids, 120)} wc_dropped={_j(r.wc_dropped, 300)}")
        w(f"     named={_j(r.named, 1500)}")
        if r.error:
            w(f"     error={r.error[:600]}")
        w(f"     letters={_j(r.letters, 300)} rekey={_j(r.rekey, 300)}")
        w(f"     versions={_j(r.versions, 600)}")
        if r.lines:
            w(f"     line entries={_j(r.lines, 900)}")
        if r.impact:
            w(f"     impact={_j(r.impact, 600)}")


def _s_retro(db: Session, w: _W, ctx: dict) -> None:
    rec = ctx.get("retro") or {}
    cells = ctx["cells"]
    ids = {c.id for c in cells}
    vcs = {c.verifix_code for c in cells}
    units = ctx["unit_ids"]
    n = 0
    for k, v in rec.items():
        if not isinstance(v, list):
            continue
        for e in v:
            if not isinstance(e, dict):
                continue
            if (e.get("cell") in ids or e.get("vcode") in vcs or e.get("from") in units
                    or e.get("to") in units):
                w(f"retro.{k}: {_j(e, 900)}")
                n += 1
    if not n:
        w("the retro record names none of these cells or units")


def _codes(ctx: dict) -> list[str]:
    out = {norm_code(c.sap_code) for c in ctx["cells"] if norm_code(c.sap_code)}
    return sorted(out)


def _s_catalog_now(db: Session, w: _W, ctx: dict) -> None:
    from app.services import cell_archive, pp_catalog
    from app.services.pp_calc import takes_sap
    unit_ids = sorted(ctx["unit_ids"])
    codes = set(_codes(ctx))
    today = cell_archive.today()
    by_unit_cells = defaultdict(lambda: defaultdict(list))
    for c in db.query(Cell).filter(Cell.manager_id.in_(unit_ids)).all():
        by_unit_cells[c.manager_id][norm_code(c.sap_code)].append(c)
    for mid in unit_ids:
        cat = pp_catalog.current(db, mid)
        per = defaultdict(list)
        for p in cat.lines:
            per[norm_code(p.work_center)].append(p)
        w(f"── unit {mid} «{ctx['names'].get(mid)}» — today's catalog by work centre "
          f"(* = a code these cells carry):")
        for code in sorted(per, key=lambda k: (k not in codes, k)):
            ps = per[code]
            here = by_unit_cells[mid].get(code, [])
            live = [c for c in here if cell_archive.alive(c, today)]
            lets = Counter((p.wc_group or "-") for p in ps if p.active)
            w(f"  {'*' if code in codes else ' '} {code or '(blank)'}: {len(ps)} lines, active "
              f"{sum(1 for p in ps if p.active)}, letters {dict(lets)}, sap-filled "
              f"{sum(1 for p in ps if p.active and takes_sap(p.sap_code, p.auto_fill))} · cells here: "
              + (", ".join(f"{c.verifix_code}/{c.wc_group or '-'}" for c in live) or "NONE")
              + (f" · archived cells {[c.verifix_code for c in here if c not in live]}" if len(live) < len(here) else ""))
        for code in sorted(codes - set(per)):
            w(f"  * {code}: no line in this unit")
        for wc in cat.work_centers:
            if norm_code(wc.code) in codes:
                w(f"    work-centre row #{wc.id} {wc.code!r} shtatka={wc.shtatka} active={wc.active}")
    w("")
    w("── every line at the codes these cells carry, in both units, today:")
    for mid in unit_ids:
        cat = pp_catalog.current(db, mid)
        for p in sorted(cat.lines, key=lambda p: (norm_code(p.work_center), p.sort_order or 0, p.id)):
            if norm_code(p.work_center) not in codes:
                continue
            w(f"  u{mid} #{p.id} [{p.work_center}] g={p.wc_group or '-'} act={p.active} "
              f"auto={p.auto_fill} sap={p.sap_code!r} labor={p.labor_time} sort={p.sort_order} "
              f"«{(p.name or '')[:60]}»"
              + (f" ARCH by={p.archived_by!r} from={_d(p.archived_from)}" if p.archived_at else ""))


def _s_orphans(db: Session, w: _W, ctx: dict) -> None:
    from app.services import cell_archive
    from app.services import catalog_follow_retro as retro
    by_code = defaultdict(list)
    for c in db.query(Cell).all():
        k = norm_code(c.sap_code)
        if k:
            by_code[k].append(c)
    got = retro._orphans(db, by_code, cell_archive.today(), units=sorted(ctx["unit_ids"]))
    if not got:
        w("no orphaned positions in these units (every active line at a cell's code has a cell to own it)")
    for (x, code), info in sorted(got.items()):
        lines = info["lines"]
        w(f"unit {x} code {code}: {len(lines)} orphan line(s) · living cells here={info['has_cells']} "
          f"orphan letters={info['letters']} all letters={info['all_letters']} dead={info['dead']}")
        others = [c for c in by_code.get(code, []) if c.manager_id != x]
        w(f"   cells at {code} in OTHER units: "
          + (", ".join(f"{c.verifix_code}@u{c.manager_id}/{c.wc_group or '-'}" for c in others) or "none"))
        for p in lines[:40]:
            w(f"   #{p.id} g={p.wc_group or '-'} «{(p.name or '')[:60]}»")


def _s_by_day(db: Session, w: _W, ctx: dict) -> None:
    from app.services import cell_archive, pp_catalog
    from app.services import catalog_follow as cf
    unit_ids = sorted(ctx["unit_ids"])
    codes = _codes(ctx)
    today = cell_archive.today()
    a = cf.FOLLOW_FROM - timedelta(days=2)
    sp = pp_catalog.spans(db, unit_ids, a, today)
    w("Active catalog lines per day, per unit, at each code («-» = none). The day the counts "
      "change is the day a catalog reading moved.")
    w("date       | " + " | ".join(f"u{u}: " + " ".join(c for c in codes) for u in unit_ids))
    prev = None
    d = a
    while d <= today:
        parts = []
        for u in unit_ids:
            cat = pp_catalog.catalog_for(sp.get(u, []), d)
            cnt = Counter(norm_code(p.work_center) for p in (cat.lines if cat else []) if p.active)
            parts.append(" ".join(str(cnt.get(c, "-")) for c in codes))
        row = " | ".join(parts)
        if row != prev or d == today:
            w(f"{d}  | {row}")
            prev = row
        d += timedelta(days=1)
    w("")
    w("Stored quantities per day at those codes (pp_daily rows · Σplan · Σfact (overrides win) · "
      "line rows · pins Σpeople):")
    codes_set = set(codes)
    agg = defaultdict(lambda: [0, 0.0, 0.0, 0, 0, 0.0])
    for r in db.query(PPDaily.manager_id, PPDaily.date, PPDaily.work_center, PPDaily.plan_qty,
                      PPDaily.actual_qty, PPDaily.plan_override, PPDaily.actual_override).filter(
            PPDaily.manager_id.in_(unit_ids), PPDaily.date >= a).all():
        c = norm_code(r.work_center)
        if c in codes_set:
            k = (r.date, r.manager_id, c)
            agg[k][0] += 1
            agg[k][1] += float(r.plan_override if r.plan_override is not None else r.plan_qty or 0)
            agg[k][2] += float(r.actual_override if r.actual_override is not None else r.actual_qty or 0)
    for r in db.query(PPLineDaily.manager_id, PPLineDaily.date, PPLineDaily.work_center).filter(
            PPLineDaily.manager_id.in_(unit_ids), PPLineDaily.date >= a).all():
        c = norm_code(r.work_center)
        if c in codes_set:
            agg[(r.date, r.manager_id, c)][3] += 1
    for r in db.query(PPWorkCenterDaily.manager_id, PPWorkCenterDaily.date,
                      PPWorkCenterDaily.work_center, PPWorkCenterDaily.people,
                      PPWorkCenterDaily.wc_group).filter(
            PPWorkCenterDaily.manager_id.in_(unit_ids), PPWorkCenterDaily.date >= a).all():
        c = norm_code(r.work_center)
        if c in codes_set:
            agg[(r.date, r.manager_id, c)][4] += 1
            agg[(r.date, r.manager_id, c)][5] += float(r.people or 0)
    for (dd, u, c), v in sorted(agg.items()):
        w(f"  {dd} u{u} {c}: rows {v[0]} · plan {v[1]:.0f} · fact {v[2]:.0f} · line rows {v[3]} "
          f"· pins {v[4]} ({v[5]:.1f} people)")


def _s_engine(db: Session, w: _W, ctx: dict) -> None:
    """What the follow would do NOW — reads only: no lock, nothing written."""
    from app.services import catalog_follow as cf
    from app.services import cell_archive, cell_links, pp_catalog
    cell_links.forget()
    cell_archive.forget()
    cells = ctx["cells"]
    ids = {c.id for c in cells}
    now = datetime.now(timezone.utc)
    groups = cf._candidates(db, now)
    mine = [g for g in groups if any(t.cell_id in ids for t in g)]
    w(f"_candidates now: {len(groups)} group(s) ready on the whole platform, "
      f"{len(mine)} with these cells")
    for g in mine:
        w("  ready: " + _j([t.__dict__ for t in g], 600))
    pend = [p for p in cf._pending_moves(db) if p[1] in ids]
    for p in pend:
        w(f"  recorded, not landed: event {p[0]} cell {p[1]} code {p[2]} {p[3]}→{p[4]} from {_d(p[5])}")

    # Every landed brigadir change of these cells from FOLLOW_FROM, as the
    # sweep would build its transfer, grouped (h, code) like `_candidates`.
    E = CellLinkEvent
    evs = [e for e in db.query(E).filter(
        E.cell_id.in_(list(ids) or [0]), E.field == "manager_id", E.applied_at.isnot(None),
        E.effective_from >= cf.FOLLOW_FROM, E.value.is_distinct_from(E.prev))
        .order_by(E.effective_from, E.id).all() if not cf._mark(e.vfx)]
    by_cell = {c.id: c for c in cells}
    groups2 = defaultdict(list)
    for e in evs:
        c = by_cell[e.cell_id]
        vfx = e.vfx if isinstance(e.vfx, dict) else {}
        letter = vfx.get("letter_before", vfx.get("wc_group_was", c.wc_group))
        groups2[(e.effective_from, norm_code(c.sap_code))].append(cf.Transfer(
            cell_id=c.id, event_id=e.id, src=e.prev, dst=e.value, home_from=e.effective_from,
            letter_src=letter or None))
    for r in db.query(PPCatalogMove).filter(PPCatalogMove.cell_id.in_(list(ids) or [0]),
                                            PPCatalogMove.event_id.is_(None)).all():
        c = by_cell.get(r.cell_id)
        if c is not None and r.home_from is not None:
            groups2[(r.home_from, norm_code(c.sap_code))].append(cf.Transfer(
                cell_id=c.id, event_id=None, src=r.from_unit, dst=r.to_unit,
                home_from=r.home_from, letter_src=r.letter_from or None))
    if not groups2:
        w("no landed brigadir change of these cells since FOLLOW_FROM — and no event-less record")
    for (h, code), ts in sorted(groups2.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
        w("")
        w(f"── group h={h} code={code!r}: " + ", ".join(
            f"{by_cell[t.cell_id].verifix_code} {t.src}→{t.dst} letter {t.letter_src!r} ev {t.event_id}"
            for t in ts))
        if not code:
            w("   the cell carries NO SAP code — the follow moves nothing for it")
            continue
        try:
            plan = cf.build_plan(db, ts)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            w(f"   build_plan failed: {type(exc).__name__}: {exc}")
            continue
        w(f"   plan: stayers={_j(plan.stayers)} whole={_j(plan.whole)} letter_dst={_j(plan.letter_dst)} "
          f"staying_dst={_j(plan.staying_dst)} sibling={_j(plan.sibling)} own_dst={_j(plan.own_dst)}")
        w(f"   plan named={_j(plan.named, 900)}")
        units = sorted({t.src for t in ts if t.src is not None}
                       | {t.dst for t in ts if t.dst is not None})
        try:
            moves, pn = cf._probe(db, plan, units)
            w(f"   _probe (from h on): moves={moves} named={_j(pn, 900)}")
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            w(f"   _probe failed: {type(exc).__name__}: {exc}")
        # The current rows, as the follow would hand them out NOW.
        try:
            contents = {u: cf._contents({"lines": pp_catalog.current(db, u).lines,
                                         "work_centers": pp_catalog.current(db, u).work_centers})
                        for u in units}
            out, rep = cf.transform(contents, plan, current=False)
            moved = Counter((rep["src"].get(pid), rep["dst"].get(pid)) for pid in rep["moved"])
            w(f"   transform(current rows): would move {len(rep['moved'])} line(s) "
              f"{ {f'{a}->{b}': n for (a, b), n in moved.items()} } · joined {len(rep['joined'])} "
              f"· wc moved {_j(rep['wc_moved'])} · named {_j(rep['named'], 900)}")
            for u in units:
                left = [p for p in (contents.get(u) or {}).get("lines") or []
                        if norm_code(p.get("work_center")) == code]
                w(f"   unit {u} holds {len(left)} line(s) at {code} now "
                  f"(letters {dict(Counter((p.get('wc_group') or '-') for p in left))})")
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            w(f"   transform failed: {type(exc).__name__}: {exc}")

    # The retro's own guards for any retro record of these cells.
    try:
        from app.services import catalog_follow_retro as retro
        rows = db.query(PPCatalogMove).filter(PPCatalogMove.cell_id.in_(list(ids) or [0]),
                                              PPCatalogMove.kind == "retro").all()
        # The team the sweep would follow each record with: the other landed
        # changes of its (move day, code) group (`catalog_follow._recheck_retro`).
        by_group = defaultdict(list)
        for ts in groups2.values():
            for t in ts:
                by_group[(t.home_from, norm_code(by_cell[t.cell_id].sap_code))].append(t)
        for r in rows:
            c = by_cell.get(r.cell_id)
            mates = by_group.get((r.home_from, norm_code(c.sap_code) if c else ""), [])
            team = {t.cell_id: (t.home_from, t.src, t.dst) for t in mates
                    if t.cell_id != r.cell_id and t.event_id is not None and t.src is not None} \
                if r.event_id is not None else {}
            try:
                v = cf._recheck_one(retro, db, r, team) if hasattr(cf, "_recheck_one") \
                    else retro.recheck(db, r)
                v = {"verdict": v, "team": sorted(team)}
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                v = f"recheck failed: {type(exc).__name__}: {exc}"
            w(f"   retro.recheck(move #{r.id}, cell {by_cell.get(r.cell_id).verifix_code if by_cell.get(r.cell_id) else r.cell_id}, "
              f"state {r.state}) → {_j(v, 600)}")
    except ImportError:
        w("   catalog_follow_retro is gone — no recheck")


def _s_refusal(db: Session, w: _W, ctx: dict) -> None:
    """The door rule asked NOW for every cell standing in one of the units:
    would moving it to the OTHER unit be refused (ruling 2)?"""
    from app.services import catalog_refusal, cell_links
    from app.services import cell_archive
    units = [m.id for m in ctx["units"].values()]
    if len(units) < 2:
        w("fewer than two units — skipped")
        return
    day, _at = cell_links.opening_for_move(db, units[0], units[1])
    for c in ctx["cells"]:
        if c.manager_id not in units or not norm_code(c.sap_code) or not cell_archive.alive(c, day):
            continue
        to = units[1] if c.manager_id == units[0] else units[0]
        try:
            ref = catalog_refusal.shared_positions(db, c, to, day=day)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            w(f"  {c.verifix_code}: refusal check failed {type(exc).__name__}: {exc}")
            continue
        if ref is None:
            w(f"  {c.verifix_code} u{c.manager_id}→u{to}: would be ALLOWED")
        else:
            w(f"  {c.verifix_code} u{c.manager_id}→u{to}: REFUSED {getattr(ref, 'code', '')} "
              f"{_j(getattr(ref, 'params', None), 500)}")


def _s_journal(db: Session, w: _W, ctx: dict) -> None:
    from app.services import catalog_follow as cf
    cells = ctx["cells"]
    vcs = {c.verifix_code for c in cells if c.verifix_code}
    ids = {c.id for c in cells}
    since = datetime.combine(cf.FOLLOW_FROM - timedelta(days=1), datetime.min.time(), tzinfo=TZ)
    q = (db.query(ActionLog).filter(ActionLog.created_at >= since, or_(
        ActionLog.action.in_(("org.catalog_moved", "org.cell_links_applied", "org.verifix_sync_pass")),
        ActionLog.target_kind == "cell", ActionLog.path.like("%/cells%"),
        ActionLog.action.like("%cell%"), ActionLog.action.like("%catalog%")))
         .order_by(ActionLog.created_at))
    n = 0
    for r in q.all():
        blob = " ".join(str(x) for x in (r.target_id, r.target_name, r.details, r.changes, r.path))
        if not (r.target_kind == "cell" and (str(r.target_id) in {str(i) for i in ids}
                                             or r.target_name in vcs)) \
                and not any(v and v in blob for v in vcs):
            continue
        n += 1
        if n > 120:
            w("  … more rows cut")
            break
        w(f"{r.created_at.astimezone(TZ):%d.%m %H:%M} {r.action} [{r.outcome}] by {r.actor_name!r} "
          f"({r.actor_role}, {r.source}) target={r.target_kind}:{r.target_name or r.target_id} "
          f"status={r.status} path={r.path}")
        if r.changes:
            w(f"     changes={_j(r.changes, 500)}")
        if r.details:
            w(f"     details={_j(r.details, 700)}")
        if r.reason:
            w(f"     reason={r.reason[:300]}")
    if not n:
        w("no Jurnal row names these cells since FOLLOW_FROM")


def _s_teams(db: Session, w: _W, ctx: dict) -> None:
    """Retro records named `window_cells_moved` alone, grouped by (move day,
    code), whose reasons name only each other — what the team repair
    (`catalog_team_repair_oct28`, after this report) re-arms for these two
    units and only lists for the rest."""
    from app.services import catalog_team_repair_oct28 as rep
    teams = rep.stuck_teams(db)
    if not teams:
        w("none")
    vc = {c.id: c.verifix_code for c in db.query(Cell.id, Cell.verifix_code).all()}
    units = {m.id for m in ctx["units"].values()}
    for rs in teams:
        here = any(r.from_unit in units or r.to_unit in units for r in rs)
        w(f"{'THESE UNITS' if here else 'elsewhere  '} {rs[0].code} h={_d(rs[0].home_from)}: "
          + ", ".join(f"{vc.get(r.cell_id, r.cell_id)} {r.from_unit}→{r.to_unit} (move #{r.id})"
                      for r in rs))


# ── the report ──────────────────────────────────────────────────────────────

def collect(db: Session) -> tuple[str, str, list]:
    w = _W()
    units, note = _units(db)
    unit_ids = {m.id for m in units.values()}
    cells, other = _scope(db, unit_ids)
    ctx = {"units": units, "units_note": note, "unit_ids": unit_ids | other,
           "other_units": other, "cells": cells, "names": {}}
    w("Catalog swap report — Maksumov Sanjar ↔ Xakimov Ruslan (READ-ONLY)")
    w("units:", ", ".join(f"{k}=#{m.id} «{m.name}»" for k, m in units.items()), note)
    w("other units the cells' brigadir changes name:", sorted(other) or "none")
    w("cells in scope:", ", ".join(f"{c.verifix_code}(#{c.id},u{c.manager_id})" for c in cells))
    w.run(db, "1. THE SWITCH — retro flag, record, move records", _s_switch, ctx)
    w.run(db, "2. THE UNITS — catalog versions, SAP auto-fill", _s_units, ctx)
    w.run(db, "3. THE CELLS — columns, unit and letter by day", _s_cells, ctx)
    w.run(db, "4. LINK EVENTS of those cells (every field)", _s_events, ctx)
    w.run(db, "5. MOVE RECORDS (pp_catalog_moves)", _s_moves, ctx)
    w.run(db, "6. THE RETRO RECORD's entries about them", _s_retro, ctx)
    w.run(db, "7. TODAY'S CATALOG at their codes", _s_catalog_now, ctx)
    w.run(db, "8. ORPHANED POSITIONS (no living cell of the unit can own them)", _s_orphans, ctx)
    w.run(db, "9. BY DAY — catalog lines, stored quantities, pins", _s_by_day, ctx)
    w.run(db, "10. THE ENGINE NOW (read-only: candidates, plan, probe, transform, recheck)",
          _s_engine, ctx)
    w.run(db, "11. THE DOOR RULE NOW (would a move to the other unit be refused?)", _s_refusal, ctx)
    w.run(db, "12. JURNAL rows about these cells since 5 Oct", _s_journal, ctx)
    w.run(db, "13. TEAMS the retro named one at a time (whole platform)", _s_teams, ctx)
    try:
        db.rollback()
    except Exception:  # noqa: BLE001
        pass
    body = "\n".join(w.lines)

    # The summary message: what a person reads first.
    states = Counter()
    named = Counter()
    for r in db.query(PPCatalogMove).filter(PPCatalogMove.cell_id.in_([c.id for c in cells] or [0])).all():
        states[r.state] += 1
        for n in r.named or []:
            if isinstance(n, dict) and n.get("kind"):
                named[n["kind"]] += 1
    from app.services import catalog_follow as cf
    flag = db.query(AppSetting.value).filter(AppSetting.key == cf.RETRO_FLAG).scalar()
    summary = (f"Catalog swap report (Maksumov ↔ Xakimov)\n"
               f"retro flag: {flag!r} · live sweep on: {cf.enabled(db)}\n"
               f"cells in scope: {len(cells)} · their move records: {dict(states) or 'none'}\n"
               f"named on them: {dict(named) or 'none'}\n"
               + (f"sections that failed: {len(w.errors)}\n" if w.errors else "")
               + "The whole report is the attached .txt — please send it to Claude.")
    return summary, body, w.errors


def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=180)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    """The summary, then the whole report as a .txt file. Returns the messages sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    try:
        summary, body, _errors = collect(db)
    except Exception as exc:
        db.rollback()
        _post("sendMessage", {"chat_id": chat_id,
                              "text": f"Catalog swap report FAILED — {type(exc).__name__}: {exc}"[:3500]
                                      + "\nIt tries again at the next deploy (3 tries in all)."})
        raise
    print("[startup] catalog swap report:\n" + body[:20000])
    _post("sendMessage", {"chat_id": chat_id, "text": summary[:4000]})
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument", {"chat_id": chat_id,
                           "caption": "Catalog swap report — Maksumov Sanjar ↔ Xakimov Ruslan (read-only)."},
          files={"document": (f"catalog-swap-{stamp}.txt", body.encode("utf-8"), "text/plain")})
    return 2
