"""WHEN the ФАКТ behind a task-#9 verdict was typed — and the concerns behind
a #8 one written — shown on the objection.

Task #9 (`leader_auto`, `plan_pct`) fails a leader whose «Bajarish %» is under
the target at the check hour. The objection almost always says the same thing
(«I entered 50%, on time») and the ledger only stores what the page read AT the
hour, so nothing on the objection could say whether that is true. The 2 Oct
2026 one-shot report showed the answer is in the action register: every ФАКТ
save is timestamped (`production.override_set`), and so is every SAP upload.

`for_dispute` replays those saves and returns, for the objection page:

* the «Bajarish %» REBUILT at the hour — a FLOOR: only ФАКТ a logged save or a
  stored row untouched since proves was there counts, so a «met it on time»
  answer is evidence, never a guess;
* the first moment the target was reached, and how long after the hour;
* the same figure today, and every save behind it (who, when, what, the % after
  it) — so a figure the brigadir typed the next morning is never read as the
  leader's;
* ФАКТ the same leader saved on the neighbouring dates' pages.

The % is over the leader's work centres, ONE at a time (the best), the rule the
check itself applies since 2026-09-22. It READS and writes nothing. Computed
per request (one production page per work centre), so it is a separate
endpoint the page asks once, never part of the polled thread.
"""
from __future__ import annotations

from datetime import date as _date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    ActionLog, Cell, LeaderAiDispute, LeaderAutoCheck, LeaderConcern, Manager,
    PPDaily, PPLineDaily, PPManagerSetting, RoleProfile,
)
from app.services import cell_lookup, latin_code, leader_auto, leader_dispute

TZ = leader_auto.TASHKENT
CHECK = "plan_pct"
CONCERNS = "concerns"


# ── small helpers ────────────────────────────────────────────────────────────

def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _d(iso: str) -> _date:
    return datetime.strptime(str(iso)[:10], "%Y-%m-%d").date()


def _norm(code) -> str:
    return cell_lookup.norm_code(latin_code.latin_code(str(code or "")) if code else code) or ""


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _details(r: ActionLog) -> dict:
    out = {}
    for pair in (r.details or []):
        try:
            out[str(pair[0])] = pair[1]
        except Exception:
            continue
    return out


# ── the unit-date replay (ФАКТ half, copied from auto_check_restore._Unit) ──

class _Unit:
    def __init__(self, db: Session, mid: int, date: str):
        self.db, self.mid, self.date, self.d = db, mid, date, _d(date)
        st = db.query(PPManagerSetting).filter_by(manager_id=mid).first()
        self.auto_fill = True if st is None else bool(st.auto_fill)
        self._facts = self._uploads = self._sapwc = self._pp = self._pl = None

    def facts(self) -> list[dict]:
        if self._facts is None:
            out = []
            for r in (self.db.query(ActionLog)
                      .filter(ActionLog.unit_id == self.mid, ActionLog.day == self.d,
                              ActionLog.outcome == "done",
                              ActionLog.action == "production.override_set")
                      .order_by(ActionLog.created_at, ActionLog.id).all()):
                det = _details(r)
                for ch in (r.changes or []):
                    try:
                        field, _old, new = ch[0], ch[1], ch[2]
                    except Exception:
                        continue
                    if field == "plan":
                        continue
                    out.append({"at": _aware(r.created_at), "wc": _norm(det.get("work_center")),
                                "sap": str(det.get("sap_code") or ""),
                                "line": det.get("line") or None,
                                "new": _num(new), "who_name": (r.actor_name or "").strip() or None,
                                "who_role": r.actor_role})
            self._facts = out
        return self._facts

    def uploads(self) -> list[dict]:
        if self._uploads is None:
            out = []
            for r in (self.db.query(ActionLog)
                      .filter(ActionLog.action == "production.phase_uploaded",
                              ActionLog.day == self.d, ActionLog.outcome == "done")
                      .order_by(ActionLog.created_at).all()):
                det = _details(r)
                out.append({"at": _aware(r.created_at), "mode": det.get("mode"),
                            "type": det.get("type") or "", "note": det.get("note"),
                            "who_name": (r.actor_name or "").strip() or None,
                            "who_role": r.actor_role})
            self._uploads = out
        return self._uploads

    def sap_wcs(self) -> set:
        if self._sapwc is None:
            self._sapwc = {_norm(w) for (w,) in self.db.query(PPDaily.work_center).filter(
                PPDaily.manager_id == self.mid, PPDaily.date == self.d,
                PPDaily.plan_qty > 0).all()}
        return self._sapwc

    def reaching_faza(self) -> list[dict]:
        got_sap = bool(self.sap_wcs())
        return [x for x in self.uploads() if "faza" in x["type"]
                and (self.auto_fill if x["note"] == "auto-fill" else got_sap)]

    def facts_at(self, t: datetime) -> tuple[dict, dict]:
        """The hand-typed ФАКТ standing at `t`: `(per line, per group)`."""
        lines: dict = {}
        groups: dict = {}
        evs = [("typed", e["at"], e) for e in self.facts()]
        evs += [("upload", x["at"], x) for x in self.reaching_faza()
                if x["mode"] in ("both", "actual")]
        for kind, at, e in sorted(evs, key=lambda z: z[1]):
            if at > t:
                break
            if kind == "upload":
                lines.clear()
                groups.clear()
                continue
            g = (e["sap"], e["wc"])
            if e["line"]:
                k = g + (str(e["line"]),)
                if e["new"] is None:
                    lines.pop(k, None)
                else:
                    lines[k] = e["new"]
            else:
                for k in [k for k in lines if k[:2] == g]:
                    lines.pop(k)
                if e["new"] is None:
                    groups.pop(g, None)
                else:
                    groups[g] = e["new"]
        return lines, groups

    def pp_rows(self) -> dict:
        if self._pp is None:
            self._pp = {(str(r.sap_code or ""), _norm(r.work_center)): r
                        for r in self.db.query(PPDaily).filter(
                            PPDaily.manager_id == self.mid, PPDaily.date == self.d).all()}
        return self._pp

    def line_rows(self) -> dict:
        if self._pl is None:
            self._pl = {(str(r.qty_key or ""), _norm(r.work_center), str(r.line_key or "")): r
                        for r in self.db.query(PPLineDaily).filter(
                            PPLineDaily.manager_id == self.mid,
                            PPLineDaily.date == self.d).all()}
        return self._pl

    def fact_lb(self, rows: list, t: datetime) -> float:
        """ФАКТ minutes that PROVABLY stood on these positions at `t` — a floor."""
        lines, groups = self.facts_at(t)
        pp, pl = self.pp_rows(), self.line_rows()
        total = 0.0
        for r in rows:
            labor = _num(r.get("labor_time"))
            if not labor:
                continue
            g = (str(r.get("qty_key") or ""), _norm(r.get("work_center")))
            k = g + (str(r.get("line_key") or ""),)
            val = None
            lrow = pl.get(k)
            if lrow is not None and _aware(lrow.updated_at) and _aware(lrow.updated_at) <= t:
                val = _num(lrow.actual_override)
            elif k in lines:
                val = lines[k]
            if val is None:
                grow = pp.get(g)
                if grow is not None and _aware(grow.updated_at) and _aware(grow.updated_at) <= t:
                    if grow.actual_override is not None:
                        val = _num(grow.actual_override)
                    elif r.get("sap_filled"):
                        val = _num(grow.actual_qty)
                elif g in groups:
                    val = groups[g]
            if val:
                total += labor * val / 60.0
        return total


# ── one objection ────────────────────────────────────────────────────────────

def _code_page(db: Session, mid: int, date: str, code: str) -> tuple[list, float, float]:
    from app.routers.production import _build_dashboard
    dash = _build_dashboard(db, mid, _d(date), wc_scope={code}, payload=None)
    t = dash.get("totals") or {}
    return (dash.get("rows") or [], float(t.get("total_plan_labor") or 0),
            float(t.get("total_actual_labor") or 0))


def _other_days(db: Session, mid: int, date: str, codes: set, prof_key: str) -> list[dict]:
    """ФАКТ this leader saved on the neighbouring dates, on their work centres."""
    d = _d(date)
    seen, out = set(), []
    for r in (db.query(ActionLog)
              .filter(ActionLog.unit_id == mid, ActionLog.outcome == "done",
                      ActionLog.action == "production.override_set",
                      ActionLog.day.in_([d - timedelta(days=1), d + timedelta(days=1)]),
                      ActionLog.actor_profile_key == prof_key)
              .order_by(ActionLog.created_at).all()):
        if _norm(_details(r).get("work_center")) not in codes:
            continue
        if any(ch and ch[0] != "plan" and ch[2] is not None for ch in (r.changes or [])):
            if r.day not in seen:
                seen.add(r.day)
                out.append({"day": r.day.isoformat(), "at": _iso(r.created_at)})
    return out


def _iso(v: datetime | None) -> str | None:
    v = _aware(v)
    return v.astimezone(TZ).isoformat(timespec="minutes") if v else None


def _position(e: dict) -> str:
    line = str(e.get("line") or "")
    return (line.split("|", 1)[0].strip() or e.get("sap") or "—")


def for_dispute(db: Session, d: LeaderAiDispute, now: datetime | None = None) -> dict | None:
    """The timing of a #9 objection, or None when it argues with anything else."""
    e = leader_dispute.auto_entry(db, d)
    if e is None:
        return None
    row = db.query(LeaderAutoCheck).filter_by(entry_id=e.id).first()
    if row is None or row.outcome != leader_auto.FAILED:
        return None
    if row.check == CONCERNS:
        return _concerns(db, row)
    if row.check != CHECK:
        return None
    prof = db.query(RoleProfile).filter_by(id=row.leader_id).first()
    m = db.query(Manager).filter_by(id=row.manager_id).first()
    due = _aware(row.due_at) or _aware(row.checked_at)
    if prof is None or m is None or due is None:
        return None
    facts = row.facts or {}
    target = float(facts.get("target") or 30)
    now = now or datetime.now(timezone.utc)
    cell = db.query(Cell).filter_by(id=row.cell_id).first() if row.cell_id else None
    ctx = leader_auto._Ctx(db, prof, m, m.shift, row.date, cell, due, now)
    mid = ctx.unit_id
    out = {"target": target, "due": _iso(due), "date": row.date}
    pages = {}
    for c in sorted({c for c, _g in ctx.pairs if c}):
        rows, plan, fact = _code_page(db, mid, row.date, c)
        if plan > 0:
            pages[c] = (rows, plan, fact)
    if not pages:
        return {**out, "check": CHECK, "verdict": "no_plan", "events": []}
    u = _Unit(db, mid, row.date)

    def pct_at(t):
        return max(u.fact_lb(rows, t) / plan * 100 for rows, plan, _f in pages.values())

    hour_pct = pct_at(due)
    now_pct = max(f / p * 100 for _r, p, f in pages.values())
    mine = [x for x in u.facts() if x["wc"] in pages]
    ups = u.reaching_faza()
    events, reached = [], None
    for kind, at, x in sorted([("fact", x["at"], x) for x in mine]
                              + [("sap", x["at"], x) for x in ups], key=lambda z: z[1]):
        p = pct_at(at)
        if reached is None and p >= target:
            reached = at
        events.append({"kind": kind, "at": _iso(at), "after": at > due,
                       "who": x.get("who_name"), "role": x.get("who_role"),
                       "code": x.get("wc"), "position": _position(x) if kind == "fact" else None,
                       "value": x.get("new") if kind == "fact" else None,
                       "pct": round(p, 1)})
    if hour_pct >= target:
        verdict = "on_time"
    elif now_pct < target:
        verdict = "never"
    elif reached is not None and reached > due:
        verdict = "late"
    else:
        verdict = "unexplained"
    return {**out, "check": CHECK, "verdict": verdict, "hour_pct": round(hour_pct, 1),
            "now_pct": round(now_pct, 1), "reached": _iso(reached),
            "late_min": (int((reached - due).total_seconds() // 60)
                         if reached is not None and reached > due else None),
            "events": events,
            "other_days": [] if mine else _other_days(db, mid, row.date, set(pages),
                                                       f"leader:{prof.id}")}


# ── #8: when the concerns were written ──────────────────────────────────────

def _concerns(db: Session, row: LeaderAutoCheck) -> dict | None:
    """Every concern that would have counted for #8 — the check's OWN filter
    (`leader_auto._check_concerns`: written by the leader, or filed by a worker
    against one of their cells) — from 00:00 of the checklist day to a day after
    the hour, each with WHEN it was created. `created_at` cannot move, so an
    «on time» here is exact, not a floor. The day before is asked too, for the
    concern written on the wrong day."""
    from sqlalchemy import and_, or_
    due = _aware(row.due_at) or _aware(row.checked_at)
    if due is None:
        return None
    start = leader_auto._day_start(row.date)
    if row.cell_id:
        c = db.query(Cell).filter_by(id=row.cell_id).first()
        codes = [c.verifix_code] if c is not None and c.verifix_code else []
    else:
        codes = [x for (x,) in db.query(Cell.verifix_code).filter(
            Cell.leader_id == row.leader_id, Cell.verifix_code.isnot(None)).all()]
    mine = and_(LeaderConcern.worker_name.is_(None),
                LeaderConcern.owner_role == "leader",
                LeaderConcern.owner_profile_id == row.leader_id)
    by_worker = (and_(LeaderConcern.worker_name.isnot(None),
                      LeaderConcern.cell_code.in_(codes)) if codes else None)
    who = mine if by_worker is None else or_(mine, by_worker)
    rows = (db.query(LeaderConcern)
            .filter(who, LeaderConcern.created_at >= start - timedelta(days=1),
                    LeaderConcern.created_at < due + timedelta(days=1))
            .order_by(LeaderConcern.created_at, LeaderConcern.id).all())
    events, before_day = [], []
    for c in rows:
        at = _aware(c.created_at)
        if at < start:
            before_day.append(c)
            continue
        text = " ".join(str(c.concern_text or "").split())
        events.append({"kind": "concern", "at": _iso(at), "after": at >= due,
                       "worker": bool(c.worker_name), "cell": c.cell_code,
                       "position": text[:90] + ("…" if len(text) > 90 else ""),
                       "seq": c.seq or c.id})
    first = next((e for e in events if e["after"]), None)
    if any(not e["after"] for e in events):
        verdict = "on_time"
    elif first is not None:
        verdict = "late"
    else:
        verdict = "never"
    late_min = None
    if verdict == "late":
        late_min = int((datetime.fromisoformat(first["at"]) - due).total_seconds() // 60)
    return {"check": CONCERNS, "date": row.date, "due": _iso(due), "verdict": verdict,
            "found": sum(1 for e in events if not e["after"]),
            "reached": first["at"] if first else None, "late_min": late_min,
            "events": events,
            "other_days": ([{"day": _aware(before_day[-1].created_at).astimezone(TZ)
                             .date().isoformat(), "at": _iso(before_day[-1].created_at)}]
                           if before_day and not events else [])}
