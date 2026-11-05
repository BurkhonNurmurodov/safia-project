"""⚠ TEMPORARY one-shot (2026-11-05): put back the ПЛАН/ФАКТ typed for 3 Nov 2026
that a SAP upload wiped.

The upload (Jurnal #788771, 4 Nov 23:24, Abbos Mustafakulov) was filed under
03.11 for Suvonov Elshod (unit 5) and Aripova Manzura (unit 1), mode «both».
03.11 is before `pp_calc.TYPED_ONLY_FROM`, so the old rule applied: every value
typed on a line that takes SAP was deleted and the file's numbers took over
(Elshod's load 91% → 76%, Aripova's 93% → 57%). The operator asked for the typed
numbers back.

The Jurnal holds every typed value — `production.override_set` rows carry
`details` [date, sap_code (the qty key), work_center, line] and `changes`
[[field, old, new]]. Replayed in order up to the upload, the last value per
(line, field) is what the page showed before it.

What it writes, per ACTIVE line of the 3 Nov catalog that takes SAP (lines kept
by hand kept their numbers through the upload and are not touched):
  - a field typed before the upload → that value, as the line's own override;
  - a field never typed (or cleared) whose group now carries a nonzero SAP
    number → 0, the number it read before the upload (no snapshot existed for
    3 Nov until then, so an untyped line read 0);
  - else nothing.
Only where the field carries no override now (compare-and-set: anything typed
after the upload stands). The SAP snapshot stays — it fills the «SAP» columns.

It checks itself against figures read off production before it shipped
(`EXPECT`): how many values each unit gets, and the unit's plan/fact minutes
afterwards (`_build_dashboard`'s own totals). Any difference → nothing written,
recorded as «blocked». The record (app setting `RECORD`) lists every value
written with what the field held, so the restore can be undone by hand.

Delete this module, `startup.restore_typed_nov03` / `_typed_restore_job` and
both entrypoint calls once `FLAG` reads «done» (or «blocked»).
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text as sql
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

FLAG = "typed_restore_2026_11_03_v1"
RECORD = "typed_restore_2026_11_03"
LOCK_KEY = 61_105_301
TRIES = 3

DAY = date(2026, 11, 3)
UPLOAD_LOG_ID = 788771          # the upload that wiped them
UNITS = {5: "Suvonov Elshod", 1: "Aripova Manzura"}

# Read off production on 5 Nov through the same rule (the Jurnal replayed over
# the 3 Nov dashboard rows): values written per field, and the unit's minutes
# once they are back.
EXPECT = {
    5: {"plan": (65, 2), "actual": (65, 2), "plan_min": 18875.23, "actual_min": 18786.86},
    1: {"plan": (84, 6), "actual": (82, 1), "plan_min": 15158.99, "actual_min": 14918.21},
}
MIN_TOLERANCE = 1.0             # minutes — the expectations were rounded to 0.01
FIELD = {"plan": "plan", "fact": "actual"}      # Jurnal change key → our field
COL = {"plan": "plan_override", "actual": "actual_override"}


def _setting(db: Session, key: str):
    from app.models import AppSetting
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    from app.models import AppSetting
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def pending(db: Session) -> bool:
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        return False
    if val.startswith("failed:"):
        try:
            return int(val.split(":")[-1]) < TRIES
        except ValueError:
            return False
    return True


def run_at(now: Optional[datetime] = None) -> datetime:
    return (now or datetime.now(timezone.utc)) + timedelta(seconds=60)


# ── the plan ──────────────────────────────────────────────────────────────────

def _typed(db: Session, mid: int, cutoff) -> dict:
    """{(qty_key, wc, line, field): last value} typed for DAY before `cutoff`."""
    from app.models import ActionLog
    rows = (db.query(ActionLog)
            .filter(ActionLog.action == "production.override_set",
                    ActionLog.unit_id == mid, ActionLog.day == DAY,
                    ActionLog.outcome == "done", ActionLog.created_at < cutoff)
            .order_by(ActionLog.created_at, ActionLog.id).all())
    out: dict = {}
    for r in rows:
        d = {k: v for k, v in (r.details or []) if isinstance(k, str)}
        if d.get("date") not in (None, DAY.isoformat()):
            continue
        key = (str(d.get("sap_code") or ""), str(d.get("work_center") or ""),
               str(d.get("line") or ""))
        for ch in (r.changes or []):
            if len(ch) < 3 or ch[0] not in FIELD:
                continue
            out[key + (FIELD[ch[0]],)] = ch[2]
    return out


def plan(db: Session, mid: int, cutoff) -> dict:
    from app.models import PPDaily, PPLineDaily
    from app.services import pp_catalog
    from app.services.pp_calc import daily_key, line_keys, takes_sap

    typed = _typed(db, mid, cutoff)
    lines = pp_catalog.at(db, mid, DAY).lines
    keys = line_keys(lines)
    snap = {(r.sap_code, r.work_center or ""): r for r in db.query(PPDaily).filter(
        PPDaily.manager_id == mid, PPDaily.date == DAY).all()}
    over = {(r.qty_key, r.work_center or "", r.line_key): r for r in db.query(PPLineDaily).filter(
        PPLineDaily.manager_id == mid, PPLineDaily.date == DAY).all()}

    writes, kept, seen = [], [], set()
    counts = {"plan": [0, 0], "actual": [0, 0]}
    for p in lines:
        if not p.active or p.id not in keys:
            continue
        lk = keys[p.id]
        qk, wc = daily_key(p.sap_code, p.name), p.work_center or ""
        seen.add((qk, wc, lk))
        if not takes_sap(p.sap_code, p.auto_fill):
            continue
        g = snap.get((qk, wc))
        o = over.get((qk, wc, lk))
        for f in ("plan", "actual"):
            tv = typed.get((qk, wc, lk, f))
            if tv is not None:
                value, kind = float(tv), 0
            elif g is not None and float(getattr(g, f"{f}_qty") or 0) != 0:
                value, kind = 0.0, 1
            else:
                continue
            now = getattr(o, COL[f]) if o is not None else None
            if now is not None:
                kept.append({"qty_key": qk, "wc": wc, "line": lk, "field": f, "now": float(now),
                             "would": value})
                continue
            counts[f][kind] += 1
            writes.append({"qty_key": qk, "wc": wc, "line": lk, "field": f, "value": value,
                           "typed": kind == 0, "name": p.name})
    unmatched = sorted({"|".join(k[:3]) for k in typed if k[:3] not in seen})
    return {"writes": writes, "kept": kept, "counts": counts, "unmatched": unmatched,
            "typed_values": len(typed)}


def _problems(mid: int, P: dict) -> list[str]:
    e = EXPECT[mid]
    out = []
    for f in ("plan", "actual"):
        got = tuple(P["counts"][f])
        if got != e[f]:
            out.append(f"unit {mid} {f}: (typed, zero) {got} ≠ expected {e[f]}")
    if P["kept"]:
        out.append(f"unit {mid}: {len(P['kept'])} field(s) were typed again after the upload")
    return out


# ── run ───────────────────────────────────────────────────────────────────────

def run(db: Session) -> Optional[dict]:
    if not pending(db):
        return None
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    tries = int(val.split(":")[-1]) if val.startswith("failed:") else 0
    try:
        got = db.execute(sql("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY}).scalar()
    except Exception:  # noqa: BLE001 — not Postgres
        db.rollback()
        got = True
    if not got:
        db.rollback()
        return None
    db.expire_all()
    if not pending(db):
        db.rollback()
        return None

    def finish(result: str, flag: str, rec: dict) -> dict:
        rec.update({"at": _now_iso(), "result": result})
        _put(db, FLAG, flag)
        _put(db, RECORD, json.dumps(rec, ensure_ascii=False, default=str))
        db.commit()
        return rec

    try:
        from app.models import ActionLog
        from app.services import pp_catalog
        from app.routers import production

        up = db.query(ActionLog).filter(ActionLog.id == UPLOAD_LOG_ID).first()
        if up is None or up.action != "production.phase_uploaded" or up.day != DAY:
            db.rollback()
            return finish("blocked", "blocked", {"problems": ["the upload's Jurnal row is not as read"]})
        cutoff = up.created_at
        pp_catalog.lock(db, list(UNITS), ns=pp_catalog.NS_QTY, shared=True)

        plans = {mid: plan(db, mid, cutoff) for mid in UNITS}
        problems = [p for mid in UNITS for p in _problems(mid, plans[mid])]
        if problems:
            db.rollback()
            return finish("blocked", "blocked", {"problems": problems, "plans": plans})

        before = {}
        for mid in UNITS:
            t = production._build_dashboard(db, mid, DAY)["totals"]
            before[mid] = {"plan_min": round(t["total_plan_labor"], 2),
                           "actual_min": round(t["total_actual_labor"], 2),
                           "load": t.get("avg_load"), "completion": t.get("completion")}
            for w in plans[mid]["writes"]:
                production._set_line_override(db, mid, DAY, w["qty_key"], w["wc"], w["line"],
                                              COL[w["field"]], w["value"])
                # The session does not autoflush: a line's ПЛАН and ФАКТ are two
                # writes, and the second must find the row the first added, or
                # it adds another (uq_pp_line_daily_key — v1 died on exactly that).
                db.flush()
        db.flush()
        after = {}
        for mid in UNITS:
            t = production._build_dashboard(db, mid, DAY)["totals"]
            after[mid] = {"plan_min": round(t["total_plan_labor"], 2),
                          "actual_min": round(t["total_actual_labor"], 2),
                          "load": t.get("avg_load"), "completion": t.get("completion")}
            e = EXPECT[mid]
            for f in ("plan", "actual"):
                if abs(after[mid][f"{f}_min"] - e[f"{f}_min"]) > MIN_TOLERANCE:
                    problems.append(f"unit {mid} {f} minutes {after[mid][f'{f}_min']} "
                                    f"≠ expected {e[f'{f}_min']}")
        if problems:
            db.rollback()
            return finish("blocked", "blocked", {"problems": problems, "before": before,
                                                 "after_check": after, "plans": plans})
        rec = finish("applied", "done", {"before": before, "after": after, "plans": plans,
                                         "upload_log_id": UPLOAD_LOG_ID})
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.exception("typed restore 03.11 failed")
        _put(db, FLAG, f"failed:{tries + 1}")
        _put(db, RECORD, json.dumps({"at": _now_iso(), "result": "failed", "attempt": tries + 1,
                                     "error": f"{type(exc).__name__}: {exc}"[:600]},
                                    ensure_ascii=False))
        db.commit()
        return None
    _after(db, rec)
    return rec


def _after(db: Session, rec: dict) -> None:
    """After the commit: the kept answers and one Jurnal row per unit."""
    try:
        from app.services import kept_answer
        kept_answer.forget_all()
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.services import action_log
        for mid, name in UNITS.items():
            c = rec["plans"][mid]["counts"]
            b, a = rec["before"][mid], rec["after"][mid]
            action_log.record_system(
                "shopfloor", "production.typed_restored", db,
                target_kind="batch", target_id=f"pp:{DAY}", unit_id=mid, unit_name=name, day=DAY,
                details=[("date", str(DAY)), ("count", sum(c["plan"]) + sum(c["actual"])),
                         ("typed", c["plan"][0] + c["actual"][0]),
                         ("zero", c["plan"][1] + c["actual"][1]),
                         ("upload", UPLOAD_LOG_ID)],
                changes=[("plan_min", b["plan_min"], a["plan_min"]),
                         ("fact_min", b["actual_min"], a["actual_min"])],
                reason="ПЛАН/ФАКТ typed for 03.11 restored from the Jurnal after a SAP upload wiped them")
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
