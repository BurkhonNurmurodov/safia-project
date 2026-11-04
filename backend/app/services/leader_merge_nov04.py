"""TEMPORARY one-shot (2026-11-04): Elnora's leader profile takes her deputy's history.

The operator (2026-11-02): Maksumov Sanjar's leader Amirova Elnora (#254) was
away; a leader profile was made for her deputy («zam») Malikov Xasan (#430),
who ran cell 8911 from 15 Oct. She is back, and her profile is to carry his
history. Asked one by one (2026-11-02 → 04):

* who runs 8911 → «Recheck, it has been corrected on the verifix today» — this
  pass reads Verifix's stored org and refuses to APPLY unless Elnora (Verifix
  3016) is a working leader seated in 8911;
* 15 Oct, which both profiles hold → Xasan's 100% day counts: it goes to #254
  and her own 10% day of that date is parked on #430, where it counts nowhere;
* Xasan's profile → retired, the shared @Biskonti_8911 account stays on Elnora:
  his leader role row is removed from that account, his browser login
  disabled, and a cutoff from 14 Oct takes #430 out of every result. The
  profile itself is KEPT (deleting a leader profile cascades its history).

What moves #430 → #254 (the SUBJECT of the work): every checklist day and what
hangs off a day (photos, camera late shots, AI verdicts, objections, late
proofs, day-report ledger rows, admin overrides' label), every automatic check
on those dates (swapped date by date with #254's, so each side keeps exactly
one row per date · cell · task), the concerns he held or filed as the leader,
his tasks, an in-flight bot capture, and cell 8911's «Boshqaruvchi» from 15 Oct
(one dated link event, src manual). What stays with #430 (AUTHORSHIP): his
comments, chat messages, read marks, ojidaniya entries, bell rows, activity,
the Jurnal, «who filed this objection».

MODE "dry" (this release): reads and checks everything and DMs the plan; NO
row is written but the flag and the record. MODE "apply" (a later release,
after the operator reads the dry run): preconditions, then ONE transaction
with the flag, run between 21:00 and 06:00 Tashkent so no checklist is being
filled. Every id it moves is kept in the record so the merge can be put back
by hand. Delete this module, `startup.merge_leader_elnora_xasan` /
`_leader_merge_job` and both entrypoint calls once the apply flag reads «done»
(or «blocked») and its report has gone.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.config import settings

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Tashkent")

MODE = "dry"                       # "dry" → report only · "apply" → do it
FLAG = f"leader_merge_elnora_xasan_2026_11_04_{MODE}_v1"
RECORD = f"leader_merge_elnora_xasan_2026_11_04_{MODE}"
TRIES = 3
LOCK_KEY = 20261104
ACTOR = "Tizim · lider profillarini birlashtirish (2026-11-04)"
REASON = ("The operator, 2026-11-02/04: Amirova Elnora is back; her profile (#254) carries the "
          "history of her deputy Malikov Xasan (#430), who ran 8911 from 15 Oct. 15 Oct counts "
          "Xasan's 100% day; #430 is retired (role row removed from the shared account, browser "
          "login disabled, cutoff from 14 Oct).")

S, S_NAME, S_ROW = 254, "Amirova Elnora Uktamovna", 107          # survivor
R, R_NAME, R_ROW = 430, "Malikov Xasan Avaz O'g'li", 447           # retired
UNIT = 8                                                            # Maksumov Sanjar
TID = 7445646560                                                    # @Biskonti_8911
CELL = "8911"
VFX_S = "3016"
SWAP_DATE = "2026-10-15"
SWAP_S_DAY, SWAP_R_DAY = 5453, 5457      # #254's 10% day · #430's 100% day
LINK_FROM = date(2026, 10, 15)
CUTOFF_FROM = "2026-10-14"
TEMP_YEAR = "1900"                       # a swapped row waits here inside the transaction

# Tables that may name #430 and that this pass does NOT handle: any row there
# blocks the apply (a dry run lists them).
UNHANDLED = [
    ("leader_task_leader_settings", "leader_id"), ("leader_unit_moves", "leader_id"),
    ("leader_day_sources", "leader_profile_id"), ("leader_day_exclusions", "leader_profile_id"),
    ("leader_cutoffs", "leader_profile_id"), ("leader_late_requests", "leader_profile_id"),
    ("leader_task_pending_changes", "leader_id"), ("leader_task_examples", "leader_id"),
]


def dm_flag(result: Optional[str]) -> str:
    return f"{FLAG}_dm_{result or 'none'}"


# ── helpers ───────────────────────────────────────────────────────────────────

def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(TZ).isoformat(timespec="minutes")
    return str(v)


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


def _q(db: Session, q: str, params: dict | None = None) -> list[dict]:
    return [dict(r._mapping) for r in db.execute(sql(q), params or {})]


def _one(db: Session, q: str, params: dict | None = None):
    return db.execute(sql(q), params or {}).scalar()


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


def record(db: Session) -> dict:
    r = _setting(db, RECORD)
    try:
        return json.loads(r.value) if r is not None and r.value else {}
    except ValueError:
        return {}


def result(db: Session) -> Optional[str]:
    return record(db).get("result")


def pending(db: Session) -> bool:
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        res = result(db)
        d = _setting(db, dm_flag(res))
        return not (d is not None and (d.value or "").startswith("sent"))
    if val.startswith("failed:"):
        try:
            return int(val.split(":")[-1]) < TRIES
        except ValueError:
            return False
    return True


def run_at(now: Optional[datetime] = None) -> datetime:
    """When the pass may run: a dry run at once; the apply only between 21:00
    and 06:00 Tashkent, when unit 8 (shift 1) fills no checklist."""
    now = now or datetime.now(timezone.utc)
    if MODE == "dry":
        return now + timedelta(seconds=90)
    loc = now.astimezone(TZ)
    if loc.hour >= 21 or loc.hour < 6:
        return now + timedelta(seconds=90)
    return datetime.combine(loc.date(), datetime.min.time(), tzinfo=TZ).replace(hour=21, minute=5)


# ── read ──────────────────────────────────────────────────────────────────────

def facts(db: Session) -> tuple[dict, list[str]]:
    """Everything the pass reads before it writes. (facts, problems) — any
    problem blocks the apply."""
    F: dict = {"at": datetime.now(TZ).isoformat(timespec="seconds")}
    P: list[str] = []

    prof = {p["id"]: p for p in _q(db, "SELECT id, role, name, manager_id, owes_from, leader_kind, "
                                       "vfx_employee_id FROM role_profiles WHERE id IN (:s, :r)",
                                   {"s": S, "r": R})}
    F["profiles"] = {k: {**v, "owes_from": str(v["owes_from"]) if v.get("owes_from") else None}
                     for k, v in prof.items()}
    for pid, nm in ((S, S_NAME), (R, R_NAME)):
        p = prof.get(pid)
        if not p:
            P.append(f"profile #{pid} is gone")
        elif p["role"] != "leader" or p["name"] != nm or p["manager_id"] != UNIT:
            P.append(f"profile #{pid} is not leader «{nm}» of unit {UNIT}: "
                     f"{p['role']} «{p['name']}» unit {p['manager_id']}")

    # the shared account
    rows = _q(db, "SELECT id, telegram_id, role, role_id, profile_key, status, full_name FROM telegram_user_roles "
                  "WHERE telegram_id = :t OR profile_key IN (:sk, :rk) ORDER BY id",
              {"t": TID, "sk": f"leader:{S}", "rk": f"leader:{R}"})
    F["role_rows"] = rows
    F["active_ref"] = _one(db, "SELECT active_role_ref FROM telegram_users WHERE telegram_id = :t", {"t": TID})
    by_id = {r["id"]: r for r in rows}
    if by_id.get(S_ROW, {}).get("profile_key") != f"leader:{S}" or by_id.get(S_ROW, {}).get("telegram_id") != TID:
        P.append(f"role row {S_ROW} is not leader:{S} on account {TID}")
    if by_id.get(R_ROW, {}).get("profile_key") != f"leader:{R}" or by_id.get(R_ROW, {}).get("telegram_id") != TID:
        P.append(f"role row {R_ROW} is not leader:{R} on account {TID}")
    others = [r for r in rows if r["profile_key"] == f"leader:{R}" and r["id"] != R_ROW]
    if others:
        P.append(f"#{R} has other holders: {[r['telegram_id'] for r in others]}")
    F["web_login_r"] = _q(db, "SELECT username, enabled, token_version FROM web_credentials WHERE profile_key = :k",
                          {"k": f"leader:{R}"})

    # Verifix: where Elnora (and Xasan) stand now
    F["vfx"] = {}
    try:
        from app.services import verifix_org
        org, org_at = verifix_org.stored(db)
        F["org_read"] = _iso(org_at)
        if org:
            divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
            cn = verifix_org.cell_nodes(divs, emps, jobs)
            for r_ in verifix_org.people(divs, emps, jobs, cn):
                if r_["id"] in (VFX_S, "27375") or (str(r_.get("cell_raw") or "") == CELL
                                                    and verifix_org.is_leader_job(r_.get("job") or "")):
                    F["vfx"][r_["id"]] = {k: r_.get(k) for k in ("name", "status", "job", "unit_name",
                                                                  "cell_raw", "where", "hired", "dismissed")}
                    F["vfx"][r_["id"]]["leader_job"] = verifix_org.is_leader_job(r_.get("job") or "")
        else:
            P.append("no stored Verifix org read")
    except Exception as exc:  # noqa: BLE001
        P.append(f"Verifix org could not be read: {type(exc).__name__}: {exc}"[:200])
    e = F["vfx"].get(VFX_S)
    if not e:
        P.append(f"Verifix person {VFX_S} (Elnora) not in the stored org")
    elif not (e["status"] == "W" and str(e.get("cell_raw") or "") == CELL and e["leader_job"]):
        P.append(f"Verifix still places Elnora at {e.get('unit_name')} ({e.get('cell_raw')}), job "
                 f"«{e.get('job')}», status {e.get('status')} — not a working leader in {CELL}")

    # cells 8911 / 9411 and their link events since 14 Oct
    cells = _q(db, "SELECT id, verifix_code, manager_id, leader_id, owner_id, owner_meta FROM cells "
                   "WHERE verifix_code IN ('8911', '9411') OR leader_id = :r OR owner_id = :r", {"r": R})
    F["cells"] = cells
    c8911 = next((c for c in cells if c["verifix_code"] == CELL), None)
    F["cell_id"] = c8911["id"] if c8911 else None
    if not c8911:
        P.append(f"cell {CELL} not found")
    else:
        if c8911["leader_id"] != R:
            P.append(f"{CELL}'s Boshqaruvchi is #{c8911['leader_id']}, not #{R}")
        if c8911["manager_id"] != UNIT:
            P.append(f"{CELL} stands in unit {c8911['manager_id']}, not {UNIT}")
    extra = [c["verifix_code"] for c in cells if (c["leader_id"] == R or c["owner_id"] == R)
             and c["verifix_code"] != CELL]
    if extra:
        P.append(f"#{R} also runs / owns {extra}")
    ids = [c["id"] for c in cells]
    F["links"] = [{**x, "effective_from": str(x["effective_from"]), "applied_at": _iso(x["applied_at"]),
                   "created_at": _iso(x["created_at"])}
                  for x in (_q(db, "SELECT id, cell_id, field, value, prev, effective_from, applied_at, src, by_name, "
                                   "created_at FROM cell_link_events WHERE cell_id = ANY(:ids) AND "
                                   "effective_from >= '2026-10-14' ORDER BY cell_id, effective_from, id",
                               {"ids": ids}) if ids else [])]
    if c8911:
        later = [x for x in F["links"] if x["cell_id"] == c8911["id"] and x["field"] == "leader_id"
                 and (x["effective_from"] > SWAP_DATE or x["applied_at"] is None)]
        if later:
            P.append(f"{CELL} has leader links after {SWAP_DATE} or waiting: {[x['id'] for x in later]}")

    # the days
    def days(pid, since=None):
        q = ("SELECT id, date, cell_id, manager_id, closed_at, completion FROM leader_task_days "
             "WHERE leader_id = :p" + (" AND date >= :d" if since else "") + " ORDER BY date, cell_id")
        return [{**d, "closed_at": _iso(d["closed_at"]),
                 "completion": float(d["completion"]) if d["completion"] is not None else None}
                for d in _q(db, q, {"p": pid, "d": since})]
    F["r_days"] = days(R)
    F["s_days"] = days(S, "2026-10-01")
    d_r = sorted({d["date"] for d in F["r_days"]})
    F["r_dates"] = d_r
    if any(not str(x).startswith("2026-") for x in d_r):
        P.append("a #430 day outside 2026")
    s_on = [d for d in F["s_days"] if d["date"] in d_r]
    F["s_days_on_r_dates"] = s_on
    if sorted(d["id"] for d in s_on) != [SWAP_S_DAY]:
        P.append(f"#254 holds days on #430's dates other than the ruled 15 Oct swap: "
                 f"{[(d['id'], d['date']) for d in s_on]}")
    r_swap = [d["id"] for d in F["r_days"] if d["date"] == SWAP_DATE]
    if r_swap != [SWAP_R_DAY]:
        P.append(f"#430's {SWAP_DATE} day is {r_swap}, not {SWAP_R_DAY}")
    F["affected_days"] = sorted({d["id"] for d in F["r_days"]} | {d["id"] for d in s_on})

    # what would move — counted with the very conditions the apply uses
    aff, dr = F["affected_days"], d_r
    cnt: dict = {}
    if aff:
        p = {"aff": aff, "dr": dr, "s": S, "r": R}
        cnt["days R→S"] = len(F["r_days"])
        cnt["days S→R"] = len(s_on)
        cnt["entries on those days"] = _one(db, "SELECT count(*) FROM leader_task_entries WHERE day_id = ANY(:aff)", p)
        cnt["auto checks R→S (R's dates)"] = _one(db, "SELECT count(*) FROM leader_auto_checks WHERE leader_id = :r "
                                                       "AND date = ANY(:dr)", p)
        cnt["auto checks S→R (R's dates)"] = _one(db, "SELECT count(*) FROM leader_auto_checks WHERE leader_id = :s "
                                                       "AND date = ANY(:dr)", p)
        cnt["auto checks of #430 left (other dates)"] = _one(
            db, "SELECT count(*) FROM leader_auto_checks WHERE leader_id = :r AND NOT (date = ANY(:dr))", p)
        cnt["photos"] = _one(db, "SELECT count(*) FROM leader_task_photos WHERE day_id = ANY(:aff)", p)
        cnt["late shots"] = _one(db, "SELECT count(*) FROM leader_late_proof_shots WHERE day_id = ANY(:aff)", p)
        cnt["late proofs"] = _one(db, "SELECT count(*) FROM leader_late_proofs WHERE day_id = ANY(:aff)", p)
        cnt["AI verdicts"] = _one(db, "SELECT count(*) FROM leader_ai_reviews r JOIN leader_task_entries e "
                                      "ON r.ref = 'bot:' || e.id::text WHERE e.day_id = ANY(:aff)", p)
        cnt["objections"] = _one(db, "SELECT count(*) FROM leader_ai_disputes x JOIN leader_task_entries e "
                                     "ON x.ref = 'bot:' || e.id::text WHERE e.day_id = ANY(:aff)", p)
        cnt["day-report ledger"] = _one(db, "SELECT count(*) FROM leader_day_reports x JOIN leader_task_days d "
                                            "ON x.uid = 'bot-' || d.id::text WHERE d.id = ANY(:aff)", p)
        cnt["admin overrides (label)"] = _one(db, "SELECT count(*) FROM leader_task_overrides o JOIN leader_task_days d "
                                                  "ON o.uid = 'bot-' || d.id::text WHERE d.id = ANY(:aff)", p)
        # rows naming #430 that the day mapping would NOT reach (reported, left)
        cnt["AI verdicts of #430 off those days"] = _one(
            db, "SELECT count(*) FROM leader_ai_reviews r WHERE r.leader_id = :r AND NOT EXISTS ("
                "SELECT 1 FROM leader_task_entries e WHERE r.ref = 'bot:' || e.id::text AND e.day_id = ANY(:aff))", p)
        cnt["objections of #430 off those days"] = _one(
            db, "SELECT count(*) FROM leader_ai_disputes x WHERE x.leader_id = :r AND NOT EXISTS ("
                "SELECT 1 FROM leader_task_entries e WHERE x.ref = 'bot:' || e.id::text AND e.day_id = ANY(:aff))", p)
        # a client key both profiles used would break the photo unique keys
        for t in ("leader_task_photos", "leader_late_proof_shots"):
            n = _one(db, f"SELECT count(*) FROM {t} a JOIN {t} b ON a.client_key = b.client_key "
                         f"AND a.id <> b.id WHERE a.client_key IS NOT NULL AND a.day_id = ANY(:aff) "
                         f"AND b.leader_id IN (:s, :r)", p)
            if n:
                P.append(f"{t}: {n} client keys shared across the two profiles")
    cnt["concerns held by #430"] = _one(db, "SELECT count(*) FROM leader_concerns WHERE leader_profile_id = :r", {"r": R})
    cnt["concerns filed by #430"] = _one(db, "SELECT count(*) FROM leader_concerns WHERE owner_role = 'leader' "
                                             "AND owner_profile_id = :r", {"r": R})
    cnt["concerns with role ref 447"] = _one(db, "SELECT count(*) FROM leader_concerns WHERE leader_role_ref = :x",
                                             {"x": R_ROW})
    cnt["tasks of #430"] = _one(db, "SELECT count(*) FROM leader_tasks WHERE leader_profile_id = :r "
                                    "OR leader_role_ref = :x", {"r": R, "x": R_ROW})
    cnt["bot capture in flight"] = _one(db, "SELECT count(*) FROM leader_task_captures WHERE leader_id = :r", {"r": R})
    F["counts"] = cnt
    F["open"] = {
        "concerns": _q(db, "SELECT id, seq, status, level, entry_date FROM leader_concerns WHERE leader_profile_id = :r "
                           "AND status <> 'done' ORDER BY id", {"r": R}),
        "objections": _q(db, "SELECT id, status, date, task_id FROM leader_ai_disputes WHERE leader_id IN (:s, :r) "
                             "AND status IN ('supervisor', 'admin') ORDER BY id", {"s": S, "r": R}),
    }
    for t, col in UNHANDLED:
        try:
            with db.begin_nested():
                n = _one(db, f"SELECT count(*) FROM {t} WHERE {col} = :r", {"r": R})
        except Exception:  # noqa: BLE001 — a table this box lacks
            n = 0
        if n:
            P.append(f"{t} has {n} rows for #{R} that this pass does not move")
    if _one(db, "SELECT count(*) FROM leader_cutoffs WHERE leader_profile_id = :s", {"s": S}):
        P.append(f"#{S} has a cutoff")
    try:
        F["sync_mode"] = _one(db, "SELECT value FROM app_settings WHERE key = 'verifix_sync_mode'")
        F["sync_items"] = [i for i in _q(db, "SELECT id, kind, key, payload FROM verifix_sync_items WHERE status = 'open'")
                           if any(w in _j(i["payload"]) + str(i["key"]) for w in (VFX_S, "27375", CELL, "9411",
                                                                                  f'"{S}"', f'"{R}"', S_NAME))]
    except Exception:  # noqa: BLE001
        db.rollback()
        F["sync_items"] = []
    return F, P


# ── write ─────────────────────────────────────────────────────────────────────

def _ids(db: Session, q: str, p: dict) -> list[int]:
    return [r[0] for r in db.execute(sql(q), p)]


def _swap_by_date(db: Session, table: str, dr: list[str], moved: dict) -> None:
    """Swap every row of `table` on #430's dates: #254's rows → #430, #430's →
    #254. A table with a (leader, date, …) unique key cannot swap in one
    statement, so #254's rows wait on a 1900 date inside the transaction."""
    p = {"s": S, "r": R, "dr": dr}
    s_ids = _ids(db, f"SELECT id FROM {table} WHERE leader_id = :s AND date = ANY(:dr)", p)
    r_ids = _ids(db, f"SELECT id FROM {table} WHERE leader_id = :r AND date = ANY(:dr)", p)
    if s_ids:
        db.execute(sql(f"UPDATE {table} SET date = :y || substr(date, 5) WHERE id = ANY(:ids)"),
                   {"y": TEMP_YEAR, "ids": s_ids})
    if r_ids:
        db.execute(sql(f"UPDATE {table} SET leader_id = :s WHERE id = ANY(:ids)"), {"s": S, "ids": r_ids})
    if s_ids:
        db.execute(sql(f"UPDATE {table} SET leader_id = :r, date = '2026' || substr(date, 5) WHERE id = ANY(:ids)"),
                   {"r": R, "ids": s_ids})
    moved[table] = {"to_254": r_ids, "to_430": s_ids}


def _follow_days(db: Session, aff: list[int], moved: dict) -> None:
    """Rows hanging off a day take the day's (new) leader."""
    p = {"aff": aff, "s": S, "s_name": S_NAME, "r_name": R_NAME}
    name = "CASE d.leader_id WHEN :s THEN :s_name ELSE :r_name END"
    stmts = {
        "leader_task_photos": "UPDATE leader_task_photos x SET leader_id = d.leader_id FROM leader_task_days d "
                              "WHERE x.day_id = d.id AND d.id = ANY(:aff) AND x.leader_id <> d.leader_id RETURNING x.id",
        "leader_late_proof_shots": "UPDATE leader_late_proof_shots x SET leader_id = d.leader_id FROM leader_task_days d "
                                   "WHERE x.day_id = d.id AND d.id = ANY(:aff) AND x.leader_id <> d.leader_id "
                                   "RETURNING x.id",
        "leader_late_proofs": f"UPDATE leader_late_proofs x SET leader_id = d.leader_id, leader_name = {name} "
                              f"FROM leader_task_days d WHERE x.day_id = d.id AND d.id = ANY(:aff) "
                              f"AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id",
        "leader_ai_reviews": "UPDATE leader_ai_reviews x SET leader_id = d.leader_id FROM leader_task_entries e "
                             "JOIN leader_task_days d ON d.id = e.day_id WHERE x.ref = 'bot:' || e.id::text "
                             "AND d.id = ANY(:aff) AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id",
        "leader_ai_disputes": f"UPDATE leader_ai_disputes x SET leader_id = d.leader_id, leader_name = {name} "
                              f"FROM leader_task_entries e JOIN leader_task_days d ON d.id = e.day_id "
                              f"WHERE x.ref = 'bot:' || e.id::text AND d.id = ANY(:aff) "
                              f"AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id",
        "leader_day_reports": f"UPDATE leader_day_reports x SET leader_id = d.leader_id, leader_name = {name} "
                              f"FROM leader_task_days d WHERE x.uid = 'bot-' || d.id::text AND d.id = ANY(:aff) "
                              f"AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id",
        "leader_task_overrides": f"UPDATE leader_task_overrides x SET leader = {name} FROM leader_task_days d "
                                 f"WHERE x.uid = 'bot-' || d.id::text AND d.id = ANY(:aff) "
                                 f"AND x.leader IS DISTINCT FROM ({name}) RETURNING x.id",
    }
    for t, q in stmts.items():
        moved[t] = _ids(db, q, p)


def apply(db: Session, F: dict) -> dict:
    """The merge, in the caller's transaction. Returns what moved (every id)."""
    from app.models import Cell, LeaderTaskCapture, TelegramUserRole, WebCredential
    from app.routers import profiles as _profiles
    from app.services import cell_links, leader_cutoffs
    moved: dict = {}
    dr, aff = F["r_dates"], F["affected_days"]

    # 1. the days (the 15 Oct pair swaps), then everything that follows a day
    _swap_by_date(db, "leader_task_days", dr, moved)
    _swap_by_date(db, "leader_auto_checks", dr, moved)
    db.flush()
    _follow_days(db, aff, moved)

    # 2. what names #430 as a person on the cell, not a day
    p = {"s": S, "r": R, "s_name": S_NAME, "sx": S_ROW, "rx": R_ROW}
    moved["leader_concerns.held"] = _ids(db, "UPDATE leader_concerns SET leader_profile_id = :s, leader_name = :s_name, "
                                             "leader_role_ref = CASE WHEN leader_role_ref = :rx THEN :sx "
                                             "ELSE leader_role_ref END WHERE leader_profile_id = :r RETURNING id", p)
    moved["leader_concerns.role_ref"] = _ids(db, "UPDATE leader_concerns SET leader_role_ref = :sx "
                                                 "WHERE leader_role_ref = :rx RETURNING id", p)
    moved["leader_concerns.filed"] = _ids(db, "UPDATE leader_concerns SET owner_profile_id = :s WHERE owner_role = 'leader' "
                                              "AND owner_profile_id = :r RETURNING id", p)
    moved["leader_tasks"] = _ids(db, "UPDATE leader_tasks SET leader_profile_id = :s, leader_name = :s_name, "
                                     "leader_role_ref = CASE WHEN leader_role_ref = :rx THEN :sx ELSE leader_role_ref END "
                                     "WHERE leader_profile_id = :r OR leader_role_ref = :rx RETURNING id", p)
    caps = db.query(LeaderTaskCapture).filter(LeaderTaskCapture.leader_id == R).all()
    for c in caps:
        c.leader_id = S
    moved["leader_task_captures"] = [c.telegram_id for c in caps]

    # 3. cell 8911's «Boshqaruvchi» is #254 from 15 Oct (one dated event)
    cell = db.query(Cell).filter_by(id=F["cell_id"]).with_for_update().first()
    ev = cell_links.record(db, cell, "leader_id", S, src="manual", by=ACTOR,
                           vfx={"merge": f"leader #{R} → #{S}", "reason": "2026-11-04 leader merge"},
                           effective_from=LINK_FROM,
                           effective_at=datetime.combine(LINK_FROM, datetime.min.time(), tzinfo=TZ).replace(hour=8))
    db.flush()
    moved["cell_link_event"] = getattr(ev, "id", None)
    if cell.leader_id != S:
        raise RuntimeError(f"{CELL}'s Boshqaruvchi did not become #{S} (is #{cell.leader_id})")

    # 4. #430 retired: the role row off the shared account, the login, a cutoff
    row = db.query(TelegramUserRole).filter_by(id=R_ROW).first()
    snap = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    _profiles._remove_role_row(db, row)
    db.flush()
    moved["role_row_removed"] = snap
    moved["active_ref_now"] = _one(db, "SELECT active_role_ref FROM telegram_users WHERE telegram_id = :t", {"t": TID})
    cred = db.query(WebCredential).filter_by(profile_key=f"leader:{R}").first()
    if cred is not None:
        moved["web_login"] = {"username": cred.username, "was_enabled": bool(cred.enabled),
                              "token_version": [cred.token_version, int(cred.token_version or 0) + 1]}
        cred.enabled = False
        cred.token_version = int(cred.token_version or 0) + 1
    leader_cutoffs.set_cutoff(db, leader_id=R, leader_name=R_NAME, from_date=CUTOFF_FROM, manager_id=UNIT,
                              reason="Elnora (#254) qaytdi — bu profilning tarixi unga o'tkazildi (2026-11-04).",
                              actor=ACTOR)
    try:
        moved["ai_queue_dropped"] = leader_cutoffs.drop_pending_reviews(db, R, CUTOFF_FROM)
    except Exception as exc:  # noqa: BLE001 — nothing queued is the usual answer
        moved["ai_queue_dropped"] = f"skipped: {exc}"[:200]
    db.flush()

    # 5. after: nothing of #430's dated work is left on #430's dates
    left = _one(db, "SELECT count(*) FROM leader_task_days WHERE leader_id = :r AND id <> :d", {"r": R, "d": SWAP_S_DAY})
    if left:
        raise RuntimeError(f"{left} days still on #{R}")
    return moved


# ── run ───────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run(db: Session) -> Optional[dict]:
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        return None
    tries = 0
    if val.startswith("failed:"):
        try:
            tries = int(val.split(":")[-1])
        except ValueError:
            tries = TRIES
    if tries >= TRIES:
        return None
    try:
        got = db.execute(sql("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY}).scalar()
    except Exception:  # noqa: BLE001 — not Postgres
        db.rollback()
        got = True
    if not got:
        db.rollback()
        return None
    db.expire_all()
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        db.rollback()
        return None

    def fail(where: str, exc: Exception) -> None:
        db.rollback()
        _put(db, FLAG, f"failed:{tries + 1}")
        _put(db, RECORD, _j({"at": _now_iso(), "result": "failed", "mode": MODE, "attempt": tries + 1,
                             "retried": tries + 1 < TRIES, "error": f"{where}: {type(exc).__name__}: {exc}"[:600]}))
        db.commit()
        log.exception("leader merge %s: %s failed", MODE, where)

    try:
        F, P = facts(db)
    except Exception as exc:  # noqa: BLE001
        fail("read", exc)
        return None
    if MODE == "dry":
        db.rollback()
        rec = {"at": _now_iso(), "result": "dry", "mode": MODE, "problems": P, "facts": F}
        _put(db, FLAG, "done")
        _put(db, RECORD, _j(rec))
        db.commit()
        return rec
    if P:
        db.rollback()
        rec = {"at": _now_iso(), "result": "blocked", "mode": MODE, "problems": P, "facts": F}
        _put(db, FLAG, "blocked")
        _put(db, RECORD, _j(rec))
        db.commit()
        return rec
    try:
        moved = apply(db, F)
        rec = {"at": _now_iso(), "result": "applied", "mode": MODE, "problems": [], "facts": F, "moved": moved}
        _put(db, FLAG, "done")
        _put(db, RECORD, _j(rec))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        fail("apply", exc)
        return None
    _after(db, rec)
    return rec


def _after(db: Session, rec: dict) -> None:
    """After the commit: the caches and one Jurnal row. Never undoes the merge."""
    for fn in ("cell_register.after_commit", "leader_register.forget", "kept_answer.forget_all"):
        mod, name = fn.split(".")
        try:
            getattr(__import__(f"app.services.{mod}", fromlist=[name]), name)()
        except Exception:  # noqa: BLE001
            pass
    try:
        from app.services import action_log
        mv, c = rec.get("moved") or {}, rec["facts"].get("counts") or {}
        action_log.record_system(
            "identity", "identity.profiles_merged", db, target_kind="profile", target_id=f"leader:{S}",
            target_name=S_NAME, unit_id=UNIT, unit_name="Maksumov Sanjar",
            details=[("from", f"leader:{R} {R_NAME}"), ("days", c.get("days R→S")),
                     ("swap", f"{SWAP_DATE}: day {SWAP_R_DAY} → #{S}, day {SWAP_S_DAY} → #{R}"),
                     ("cell", f"{CELL} Boshqaruvchi #{S} from {LINK_FROM}"),
                     ("role_row", f"{R_ROW} removed from {TID}"),
                     ("web_login", (mv.get("web_login") or {}).get("username")),
                     ("cutoff", f"#{R} from {CUTOFF_FROM}")],
            reason=REASON)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


# ── report ────────────────────────────────────────────────────────────────────

def summary(rec: dict) -> str:
    F = rec.get("facts") or {}
    L: list[str] = []
    res = rec.get("result")
    head = {"dry": "DRY RUN — nothing was written", "blocked": "REFUSED — nothing was written",
            "applied": "APPLIED", "failed": "FAILED — nothing was written"}.get(res, res)
    L.append(f"LEADER MERGE · Elnora #{S} ← Xasan #{R} · {head}")
    L.append(f"at {rec.get('at')} · mode {rec.get('mode')}")
    if rec.get("error"):
        L.append(f"error: {rec['error']}")
    P = rec.get("problems") or []
    L.append("")
    if res == "dry":
        L.append("WOULD THE APPLY RUN? " + ("YES — every precondition holds." if not P else
                                            "NO — it would be refused for:"))
    elif P:
        L.append("REFUSED FOR:")
    L += [f"  ✗ {x}" for x in P]
    if not F:
        return "\n".join(L)
    L.append("")
    L.append(f"VERIFIX (stored org read {F.get('org_read')}):")
    for k, v in (F.get("vfx") or {}).items():
        L.append(f"  {k} {v.get('name')} · {v.get('status')} · «{v.get('job')}»{' (leader job)' if v.get('leader_job') else ''} "
                 f"· {v.get('unit_name')} [{v.get('cell_raw')}] · hired {v.get('hired')}"
                 + (f" · dismissed {v['dismissed']}" if v.get("dismissed") else ""))
    L.append(f"  sync mode: {F.get('sync_mode')}")
    for i in F.get("sync_items") or []:
        L.append(f"  open sync item #{i['id']} {i['kind']} {i['key']}: {_j(i['payload'])[:300]}")
    L.append("")
    L.append("CELLS NOW:")
    for c in F.get("cells") or []:
        om = c.get("owner_meta") or {}
        L.append(f"  {c['verifix_code']} · unit {c['manager_id']} · Boshqaruvchi #{c['leader_id']} · Egasi #{c['owner_id']}"
                 f" ({om.get('src') if isinstance(om, dict) else ''})")
    L.append("  link events from 14 Oct:")
    for x in F.get("links") or []:
        L.append(f"    #{x['id']} cell {x['cell_id']} {x['field']} {x['prev']} → {x['value']} from {x['effective_from']} "
                 f"· {x['src']} · {x['by_name']} · applied {x['applied_at']}")
    L.append("")
    L.append(f"SHARED ACCOUNT {TID} (active role row {F.get('active_ref')}):")
    for r in F.get("role_rows") or []:
        L.append(f"  row {r['id']} · {r['profile_key']} · {r['status']} · «{r['full_name']}»")
    L.append(f"  #{R} browser login: {_j(F.get('web_login_r'))}")
    L.append("")
    L.append(f"#{R}'s DAYS ({len(F.get('r_days') or [])}) → #{S}:")
    for d in F.get("r_days") or []:
        L.append(f"  {d['id']} · {d['date']} · {d['completion']} · {d['closed_at'] or 'OPEN'}")
    L.append(f"#{S}'s DAYS FROM 1 OCT:")
    for d in F.get("s_days") or []:
        mark = "  ← parked on #430 (counts nowhere)" if d["id"] == SWAP_S_DAY else ""
        L.append(f"  {d['id']} · {d['date']} · {d['completion']} · {d['closed_at'] or 'OPEN'}{mark}")
    L.append("")
    L.append("WHAT MOVES (counted with the apply's own conditions):")
    for k, v in (F.get("counts") or {}).items():
        L.append(f"  {k}: {v}")
    op = F.get("open") or {}
    L.append(f"  open concerns of #{R} (→ #{S}): {_j(op.get('concerns'))}")
    L.append(f"  open objections of both: {_j(op.get('objections'))}")
    L.append("")
    L.append("THEN:")
    L.append(f"  · {CELL}'s Boshqaruvchi: #{S} from {LINK_FROM} (one dated event, manual)")
    L.append(f"  · role row {R_ROW} (leader:{R}) removed from the shared account — it then works as #{S}")
    L.append(f"  · #{R}'s browser login disabled · cutoff on #{R} from {CUTOFF_FROM}")
    L.append(f"  · stays with #{R} (authorship): comments, chat messages, ojidaniya entries, bell rows, "
             f"activity, the Jurnal, «who filed» on his objections")
    L.append("  · NOT changed: #254's own 14 Oct day (10%, the transition day) — it still counts; "
             "past digests are not re-sent; nobody is DMed but this report")
    mv = rec.get("moved")
    if mv:
        L.append("")
        L.append("MOVED (ids, for an undo by hand):")
        for k, v in mv.items():
            L.append(f"  {k}: {_j(v)}")
    return "\n".join(L)


def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, 4):
        wait = 0
        try:
            r = requests.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=120)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
        if attempt < 3:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send_report(db: Session, chat_id: int, *_window) -> int:
    """`startup._send_report_once`'s sender: the record as a .txt file plus
    its head as messages. Raises on a failed send, so it is retried."""
    rec = record(db)
    db.rollback()
    if not rec:
        raise RuntimeError("no record yet")
    body = summary(rec)
    print("[startup] leader merge:\n" + body[:20000])
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": f"Elnora #{S} ← Xasan #{R}: leader merge, {rec.get('result')}. "
                      "Forward this file to the Claude session doing the merge."},
          files={"document": (f"leader-merge-{rec.get('result')}-{stamp}.txt", body.encode("utf-8"), "text/plain")})
    head = body if len(body) < 7600 else body[:7600] + "\n… (the rest is in the file above)"
    chunks, cur = [], ""
    for line in head.split("\n"):
        line = line[:3800]
        if len(cur) + len(line) + 1 > 3800:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    if cur:
        chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks) + 1
