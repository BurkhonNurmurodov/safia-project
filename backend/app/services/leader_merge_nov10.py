"""TEMPORARY one-shot (2026-11-09 → runs from 10 Nov): cell 7331's two leaders
are stopped and Majidov Ozodjon takes their history.

The operator (2026-11-09), asked one by one after production and Verifix were
read through the report door:

* Yuldashov Nodirbek (#298, Verifix 2920, dismissed 16 Oct, cut from 17 Oct)
  and Haydarov Zaynobiddin (#436, Verifix 30678 «Кондитер», 7331's
  «Boshqaruvchi» picked by hand on 17 Oct) are STOPPED and their profiles
  DELETED;
* a worker of the unit, MAJIDOV OZODJON XAMID O'G'LI (Verifix 2918, «Кондитер»
  in 7331), becomes 7331's «Boshqaruvchi» from tonight (the operator picks him
  on the cell form on 9 Nov — this pass picks him itself if that was not done)
  and his profile carries both leaders' history as his own;
* 17 Oct, which both hold → Haydarov's 95% day (5679) counts; Yuldashov's 15%
  day (5659, already cut) stays on #298 and goes with it;
* Majidov is «Lider o'rnida», as Verifix's job says (the pick sets that).

What moves #298 / #436 → Majidov: every checklist day and what hangs off a day
(photos, late proofs and shots, AI verdicts, objections — and «who filed» an
objection as the leader — the day-report ledger, admin overrides' label),
every automatic check, the concerns they held or filed, their tasks, #298's
excluded day (26 Aug). Majidov owes from #298's creation day (11 Jul), so the
moved history counts exactly as it did; #298's spelling becomes his alias, so
the three sheet-era rows (2–4 Aug, «YULDASHOV NODIRBEK») resolve to him; 7331's
dated «Boshqaruvchi» reads him on every day those leaders ran it.

Then each old profile is deleted the way the Profiles tab deletes one (its
Telegram role rows, browser login and sessions, config, the cutoff) — with
nothing filed left on it but #298's 17 Oct day. What stays under the old names
(authorship, snapshotted): comments, chat messages, read marks, bell rows,
activity, the Jurnal.

Runs ONCE, from 10 Nov between 11:00 and 19:00 Tashkent (the unit works nights;
the last night's filing shuts at 09:00 and its AI queue drains), in ONE
transaction with its flag, refused (`blocked`, nothing written) unless the data
is as read on 9 Nov. Every moved id and every deleted row is kept in the record
(app setting `leader_merge_majidov_7331_2026_11_10`) so it can be put back by
hand. Delete this module, `startup.merge_leader_majidov_7331` /
`_leader_merge_7331_job` and both entrypoint calls once the flag reads «done»
(or «blocked») and the report has gone.
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

FLAG = "leader_merge_majidov_7331_2026_11_10_v1"
RECORD = "leader_merge_majidov_7331_2026_11_10"
TRIES = 3
LOCK_KEY = 20261110
ACTOR = "Tizim · 7331 liderlari Majidovga (2026-11-10)"
REASON = ("The operator, 2026-11-09: Yuldashov Nodirbek (#298) and Haydarov Zaynobiddin (#436) are "
          "stopped and deleted; MAJIDOV OZODJON XAMID O'G'LI (Verifix 2918) runs 7331 and carries "
          "their history. 17 Oct counts Haydarov's 95% day.")

Y, Y_NAME = 298, "Yuldashov Nodirbek Kadamboy O'g'li"     # stopped, deleted
H, H_NAME = 436, "Haydarov Zaynobiddin Yusuf O'g'li"      # stopped, deleted
OLD = (Y, H)
UNIT, UNIT_NAME = 18, "Akbarov Tursunali"
CELL, CELL_ID = "7331", 211
VFX_M = "2918"
M_PREFIX = "Majidov Ozodjon"
OVERLAP = "2026-10-17"
Y_OVERLAP_DAY, H_OVERLAP_DAY = 5659, 5679                 # 15% (cut) · 95%
OWES_FROM = date(2026, 7, 11)                             # #298's creation: it owed from then
BEFORE_MARK = date(2026, 10, 12)                          # the dated links' floor
LINK_DAYS = (date(2026, 10, 13), date(2026, 10, 17))      # after event 100 · after event 173
FIRST_DAY = date(2026, 11, 10)
# Every Telegram role row that ever held #298 / #436 (128 Yuldashov's own, 370
# Majidov's account until 9 Nov, 451 / 455 Haydarov's) — concerns and tasks
# filed through them carry the id.
OLD_ROLE_ROWS = (128, 370, 451, 455)
WINDOW = (11, 19)                                         # Tashkent hours

# Tables naming a leader profile that this pass does not move: any row for
# #298 / #436 there blocks it (the delete would drop or detach it silently).
UNHANDLED = [
    ("leader_task_leader_settings", "leader_id"), ("leader_unit_moves", "leader_id"),
    ("leader_day_sources", "leader_profile_id"), ("leader_late_requests", "leader_profile_id"),
    ("leader_task_pending_changes", "leader_id"), ("leader_task_examples", "leader_id"),
]
# Rows that hang off a day by `day_id` and carry the day's leader.
DAY_CHILDREN = ("leader_task_photos", "leader_late_proof_shots", "leader_late_proofs")


def dm_flag(res: Optional[str]) -> str:
    return f"{FLAG}_dm_{res or 'none'}"


# ── helpers ───────────────────────────────────────────────────────────────────

def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(TZ).isoformat(timespec="minutes")
    return str(v)


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


def _q(db: Session, q: str, p: dict | None = None) -> list[dict]:
    return [dict(r._mapping) for r in db.execute(sql(q), p or {})]


def _one(db: Session, q: str, p: dict | None = None):
    return db.execute(sql(q), p or {}).scalar()


def _ids(db: Session, q: str, p: dict) -> list[int]:
    return [r[0] for r in db.execute(sql(q), p)]


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


def _row(obj) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


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
        d = _setting(db, dm_flag(result(db)))
        return not (d is not None and (d.value or "").startswith("sent"))
    if val.startswith("failed:"):
        try:
            return int(val.split(":")[-1]) < TRIES
        except ValueError:
            return False
    return True


def run_at(now: Optional[datetime] = None) -> datetime:
    """From 10 Nov, between 11:00 and 19:00 Tashkent: unit 18 works nights, its
    last night's filing shut at 09:00 and nothing is being filed."""
    now = now or datetime.now(timezone.utc)
    loc = now.astimezone(TZ)
    if loc.date() >= FIRST_DAY and WINDOW[0] <= loc.hour < WINDOW[1]:
        return now + timedelta(seconds=90)
    day = max(loc.date() if loc.hour < WINDOW[0] else loc.date() + timedelta(days=1), FIRST_DAY)
    return datetime(day.year, day.month, day.day, WINDOW[0], 5, tzinfo=TZ)


def in_window(now: Optional[datetime] = None) -> bool:
    loc = (now or datetime.now(timezone.utc)).astimezone(TZ)
    return loc.date() >= FIRST_DAY and WINDOW[0] <= loc.hour < WINDOW[1]


# ── read ──────────────────────────────────────────────────────────────────────

def _majidov(db: Session) -> list[dict]:
    return _q(db, "SELECT id, role, name, manager_id, owes_from, leader_kind, name_aliases, created_at "
                  "FROM role_profiles WHERE vfx_employee_id = :v ORDER BY id", {"v": VFX_M})


def facts(db: Session) -> tuple[dict, list[str]]:
    """Everything read before anything is written. (facts, problems) — any
    problem blocks the pass."""
    F: dict = {"at": datetime.now(TZ).isoformat(timespec="seconds")}
    P: list[str] = []

    prof = {p["id"]: p for p in _q(db, "SELECT id, role, name, manager_id, owes_from, leader_kind, "
                                       "vfx_employee_id, created_at FROM role_profiles WHERE id IN (:y, :h)",
                                   {"y": Y, "h": H})}
    F["old_profiles"] = prof
    for pid, nm in ((Y, Y_NAME), (H, H_NAME)):
        p = prof.get(pid)
        if not p:
            P.append(f"profile #{pid} is gone")
        elif p["role"] != "leader" or p["name"] != nm or p["manager_id"] != UNIT:
            P.append(f"profile #{pid} is not leader «{nm}» of unit {UNIT}: "
                     f"{p['role']} «{p['name']}» unit {p['manager_id']}")

    # Majidov: picked on the cell form on 9 Nov, or not yet (this pass picks)
    ms = _majidov(db)
    F["majidov"] = ms
    if len(ms) > 1:
        P.append(f"{len(ms)} profiles are tied to Verifix {VFX_M}: {[m['id'] for m in ms]}")
    m = ms[0] if len(ms) == 1 else None
    if m is not None:
        if m["role"] != "leader" or not str(m["name"]).startswith(M_PREFIX) or m["manager_id"] not in (UNIT, None):
            P.append(f"the profile tied to Verifix {VFX_M} is {m['role']} «{m['name']}» unit {m['manager_id']}")
    M = m["id"] if m else None
    F["M"] = M

    # Verifix: Majidov works in 7331
    F["vfx"] = {}
    try:
        from app.services import verifix_org
        org, org_at = verifix_org.stored(db)
        F["org_read"] = _iso(org_at)
        if org:
            divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
            cn = verifix_org.cell_nodes(divs, emps, jobs)
            for r_ in verifix_org.people(divs, emps, jobs, cn):
                if r_["id"] in (VFX_M, "2920", "30678"):
                    F["vfx"][r_["id"]] = {k: r_.get(k) for k in ("name", "status", "job", "cell_raw", "where",
                                                                 "hired", "dismissed")}
        else:
            P.append("no stored Verifix org read")
    except Exception as exc:  # noqa: BLE001
        P.append(f"Verifix org could not be read: {type(exc).__name__}: {exc}"[:200])
    e = F["vfx"].get(VFX_M)
    if F["vfx"] and not (e and e["status"] == "W" and str(e.get("cell_raw") or "") == CELL):
        P.append(f"Verifix does not place {VFX_M} as working in {CELL}: {_j(e)}")

    # the cell
    cell = (_q(db, "SELECT id, verifix_code, manager_id, leader_id, owner_id, archived_at FROM cells "
                   "WHERE id = :c", {"c": CELL_ID}) or [None])[0]
    F["cell"] = cell
    if not cell or cell["verifix_code"] != CELL or cell["manager_id"] != UNIT or cell["archived_at"]:
        P.append(f"cell #{CELL_ID} is not live {CELL} in unit {UNIT}: {_j(cell)}")
    elif cell["leader_id"] not in (H, M) or cell["owner_id"] not in (None, M):
        P.append(f"{CELL}'s Boshqaruvchi #{cell['leader_id']} / Egasi #{cell['owner_id']} is somebody else")
    others = _q(db, "SELECT verifix_code FROM cells WHERE id <> :c AND (leader_id IN (:y, :h) OR owner_id IN (:y, :h))",
                {"c": CELL_ID, "y": Y, "h": H})
    if others:
        P.append(f"#298 / #436 run or own other cells: {[o['verifix_code'] for o in others]}")
    F["links"] = [{**x, "effective_from": str(x["effective_from"]), "applied_at": _iso(x["applied_at"])}
                  for x in _q(db, "SELECT id, field, value, prev, effective_from, applied_at, src, by_name "
                                  "FROM cell_link_events WHERE cell_id = :c ORDER BY effective_from, id",
                              {"c": CELL_ID})]
    if any(x["applied_at"] is None and x["field"] == "leader_id" for x in F["links"]):
        P.append(f"{CELL} has a «Boshqaruvchi» change still waiting")

    # the days: which move, which stay behind
    def days(pid):
        return [{**d, "closed_at": _iso(d["closed_at"]),
                 "completion": float(d["completion"]) if d["completion"] is not None else None}
                for d in _q(db, "SELECT id, leader_id, date, cell_id, manager_id, closed_at, completion "
                                "FROM leader_task_days WHERE leader_id = :p ORDER BY date, cell_id", {"p": pid})]
    yd, hd = days(Y), days(H)
    md = days(M) if M else []
    F["m_days"] = md
    key = lambda d: (d["date"], d["cell_id"] or 0)  # noqa: E731 — the day's unique key, sans leader
    yk, hk, mk = {key(d) for d in yd}, {key(d) for d in hd}, {key(d) for d in md}
    both = sorted(yk & hk)
    F["y_h_shared"] = both
    if both != [(OVERLAP, 0)]:
        P.append(f"#298 and #436 share days other than the ruled {OVERLAP}: {both}")
    if not any(d["id"] == Y_OVERLAP_DAY and d["date"] == OVERLAP for d in yd):
        P.append(f"#298's {OVERLAP} day is not {Y_OVERLAP_DAY}")
    if not any(d["id"] == H_OVERLAP_DAY and d["date"] == OVERLAP for d in hd):
        P.append(f"#436's {OVERLAP} day is not {H_OVERLAP_DAY}")
    stay = [d for d in yd if d["id"] == Y_OVERLAP_DAY]
    # Majidov's own day wins on a date he filed himself (only possible from 9 Nov)
    clash = [d for d in yd + hd if key(d) in mk and d["id"] != Y_OVERLAP_DAY]
    stay += clash
    stay_ids = {d["id"] for d in stay}
    move = [d for d in yd + hd if d["id"] not in stay_ids]
    F["days_move"] = [d["id"] for d in move]
    F["days_stay"] = stay
    F["days_clash_with_majidov"] = [d["id"] for d in clash]
    F["days_by_profile"] = {str(Y): len(yd), str(H): len(hd)}
    if [d for d in move if not str(d["date"]).startswith("2026-")]:
        P.append("a day to move lies outside 2026")

    # automatic checks: unique on (leader, date, cell, task)
    auto = _q(db, "SELECT id, leader_id, date, COALESCE(cell_id, 0) AS c, task_id FROM leader_auto_checks "
                  "WHERE leader_id IN (:y, :h) ORDER BY id", {"y": Y, "h": H})
    m_auto = {(a["date"], a["c"], a["task_id"]) for a in (_q(
        db, "SELECT date, COALESCE(cell_id, 0) AS c, task_id FROM leader_auto_checks WHERE leader_id = :m",
        {"m": M}) if M else [])}
    # A check stays only with the very day that stays — the SAME leader's
    # (Haydarov's 17 Oct checks follow his 95% day; Yuldashov's stay with his 15%).
    stay_days = {(d["leader_id"], d["date"], d["cell_id"] or 0) for d in stay}
    seen: dict = {}
    a_move, a_stay = [], []
    for a in auto:
        k = (a["date"], a["c"], a["task_id"])
        if k in m_auto or (a["leader_id"], a["date"], a["c"]) in stay_days:
            a_stay.append(a["id"])
            continue
        if k in seen:
            P.append(f"#298 and #436 both hold an automatic check on {k}")
        seen[k] = a["id"]
        a_move.append(a["id"])
    F["auto_move"], F["auto_stay"] = a_move, a_stay

    for t, col in UNHANDLED:
        try:
            with db.begin_nested():
                n = _one(db, f"SELECT count(*) FROM {t} WHERE {col} IN (:y, :h)", {"y": Y, "h": H})
        except Exception:  # noqa: BLE001 — a table this box lacks
            n = 0
        if n:
            P.append(f"{t} has {n} rows for #298 / #436 that this pass does not move")

    p = {"y": Y, "h": H}
    F["exclusions"] = _q(db, "SELECT id, leader_key, date, cell_id, leader_name FROM leader_day_exclusions "
                             "WHERE leader_profile_id IN (:y, :h) OR leader_key LIKE 'p298|%' "
                             "OR leader_key LIKE 'p436|%' ORDER BY id", p)
    F["cutoffs"] = [{**c, "set_at": _iso(c["set_at"])} for c in _q(
        db, "SELECT id, leader_key, from_date, leader_profile_id, leader_name, reason, set_by, set_at "
            "FROM leader_cutoffs WHERE leader_profile_id IN (:y, :h) OR leader_key IN ('p298', 'p436')", p)]
    F["role_rows"] = _q(db, "SELECT id, telegram_id, role_id, full_name, profile_key, status FROM telegram_user_roles "
                            "WHERE profile_key IN ('leader:298', 'leader:436') ORDER BY id")
    F["m_role_rows"] = _q(db, "SELECT id, telegram_id, status FROM telegram_user_roles WHERE profile_key = :k "
                              "ORDER BY (status = 'approved') DESC, id", {"k": f"leader:{M}"}) if M else []
    F["web_logins"] = _q(db, "SELECT profile_key, username, enabled FROM web_credentials "
                             "WHERE profile_key IN ('leader:298', 'leader:436')")
    try:
        with db.begin_nested():
            F["verifix_ties"] = _q(db, "SELECT id, kind, our_id, vfx_id, how FROM verifix_ties "
                                       "WHERE our_id IN (:y, :h)", p)
    except Exception:  # noqa: BLE001
        F["verifix_ties"] = []

    pm = {"y": Y, "h": H, "mv": F["days_move"] or [0]}
    F["counts"] = {
        "days": len(move), "days staying (destroyed with the profile)": len(stay),
        "automatic checks": len(a_move), "automatic checks staying": len(a_stay),
        "photos": _one(db, "SELECT count(*) FROM leader_task_photos WHERE day_id = ANY(:mv)", pm),
        "late proofs": _one(db, "SELECT count(*) FROM leader_late_proofs WHERE day_id = ANY(:mv)", pm),
        "AI verdicts": _one(db, "SELECT count(*) FROM leader_ai_reviews r JOIN leader_task_entries e "
                                "ON r.ref = 'bot:' || e.id::text WHERE e.day_id = ANY(:mv)", pm),
        "AI verdicts of #298/#436 in all": _one(db, "SELECT count(*) FROM leader_ai_reviews WHERE leader_id IN (:y, :h)", pm),
        "objections": _one(db, "SELECT count(*) FROM leader_ai_disputes x JOIN leader_task_entries e "
                               "ON x.ref = 'bot:' || e.id::text WHERE e.day_id = ANY(:mv)", pm),
        "objections of #298/#436 in all": _one(db, "SELECT count(*) FROM leader_ai_disputes WHERE leader_id IN (:y, :h)", pm),
        "day-report ledger": _one(db, "SELECT count(*) FROM leader_day_reports x JOIN leader_task_days d "
                                      "ON x.uid = 'bot-' || d.id::text WHERE d.id = ANY(:mv)", pm),
        "concerns held": _one(db, "SELECT count(*) FROM leader_concerns WHERE leader_profile_id IN (:y, :h)", pm),
        "concerns filed": _one(db, "SELECT count(*) FROM leader_concerns WHERE owner_role = 'leader' "
                                   "AND owner_profile_id IN (:y, :h)", pm),
        "tasks": _one(db, "SELECT count(*) FROM leader_tasks WHERE leader_profile_id IN (:y, :h)", pm),
    }
    F["open"] = {
        "concerns": _q(db, "SELECT id, seq, status, leader_profile_id FROM leader_concerns "
                           "WHERE leader_profile_id IN (:y, :h) AND status <> 'done' ORDER BY id", pm),
        "objections": _q(db, "SELECT id, status, date, leader_id FROM leader_ai_disputes WHERE leader_id IN (:y, :h) "
                             "AND status IN ('supervisor', 'admin') ORDER BY id", pm),
    }
    try:
        F["sync_mode"] = _one(db, "SELECT value FROM app_settings WHERE key = 'verifix_sync_mode'")
    except Exception:  # noqa: BLE001
        db.rollback()
    return F, P


# ── write ─────────────────────────────────────────────────────────────────────

def _pick(db: Session, F: dict) -> int:
    """Majidov as 7331's «Boshqaruvchi» through the cell form's own pick —
    finds or creates his leader profile. Returns its id."""
    from app.models import Cell
    from app.services import cell_register
    cell = db.query(Cell).filter_by(id=CELL_ID).with_for_update().first()
    if F["M"] and cell.leader_id == F["M"]:
        return F["M"]
    res = cell_register.pick_manager(db, cell, VFX_M, by=ACTOR)
    db.flush()
    if not res.get("profile_id"):
        raise RuntimeError(f"the pick returned no profile: {res}")
    F["pick"] = res
    return res["profile_id"]


def _follow_days(db: Session, moved_days: list[int], m_name: str, moved: dict) -> None:
    """Rows hanging off a moved day take the day's new leader."""
    p = {"mv": moved_days, "n": m_name}
    for t in DAY_CHILDREN:
        extra = ", leader_name = :n" if t == "leader_late_proofs" else ""
        moved[t] = _ids(db, f"UPDATE {t} x SET leader_id = d.leader_id{extra} FROM leader_task_days d "
                            f"WHERE x.day_id = d.id AND d.id = ANY(:mv) "
                            f"AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id", p)
    moved["leader_ai_reviews"] = _ids(
        db, "UPDATE leader_ai_reviews x SET leader_id = d.leader_id FROM leader_task_entries e "
            "JOIN leader_task_days d ON d.id = e.day_id WHERE x.ref = 'bot:' || e.id::text "
            "AND d.id = ANY(:mv) AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id", p)
    moved["leader_ai_disputes"] = _ids(
        db, "UPDATE leader_ai_disputes x SET leader_id = d.leader_id, leader_name = :n FROM leader_task_entries e "
            "JOIN leader_task_days d ON d.id = e.day_id WHERE x.ref = 'bot:' || e.id::text "
            "AND d.id = ANY(:mv) AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id", p)
    moved["leader_day_reports"] = _ids(
        db, "UPDATE leader_day_reports x SET leader_id = d.leader_id, leader_name = :n FROM leader_task_days d "
            "WHERE x.uid = 'bot-' || d.id::text AND d.id = ANY(:mv) "
            "AND x.leader_id IS DISTINCT FROM d.leader_id RETURNING x.id", p)
    moved["leader_task_overrides"] = _ids(
        db, "UPDATE leader_task_overrides x SET leader = :n FROM leader_task_days d "
            "WHERE x.uid = 'bot-' || d.id::text AND d.id = ANY(:mv) AND x.leader IS DISTINCT FROM :n RETURNING x.id", p)


def apply(db: Session, F: dict) -> dict:
    """The handover, in the caller's transaction. Returns what moved (every id)."""
    from app.models import Cell, CellLinkEvent, RoleProfile, WebCredential
    from app import web_auth
    from app.routers import profiles as _profiles
    from app.services import cell_links, leader_exclusions
    moved: dict = {}

    # 1. Majidov runs 7331 (the pick), and his profile carries the history
    M = _pick(db, F)
    moved["M"] = M
    m = db.query(RoleProfile).filter_by(id=M).with_for_update().first()
    if m is None or m.role != "leader" or not m.name.startswith(M_PREFIX):
        raise RuntimeError(f"profile #{M} is not Majidov's leader profile")
    if m.manager_id != UNIT:
        raise RuntimeError(f"#{M} stands in unit {m.manager_id}, not {UNIT}")
    if F["M"] is None:
        # Just created: re-check the date keys against the new (empty) profile.
        if db.execute(sql("SELECT count(*) FROM leader_task_days WHERE leader_id = :m"), {"m": M}).scalar():
            raise RuntimeError(f"the new profile #{M} already holds days")
    moved["M_before"] = {"owes_from": str(m.owes_from) if m.owes_from else None,
                         "name_aliases": m.name_aliases, "leader_kind": m.leader_kind}
    m_name = m.name
    # His approved Telegram role row, when he has logged in by now — else none:
    # the concerns and tasks still find him by profile id.
    m_row = _one(db, "SELECT id FROM telegram_user_roles WHERE profile_key = :k AND status = 'approved' "
                     "ORDER BY id LIMIT 1", {"k": f"leader:{M}"})

    # 2. the days, every automatic check, then what hangs off a day
    mv = F["days_move"]
    if mv:
        db.execute(sql("UPDATE leader_task_days SET leader_id = :m WHERE id = ANY(:ids)"), {"m": M, "ids": mv})
    moved["leader_task_days"] = mv
    if F["auto_move"]:
        db.execute(sql("UPDATE leader_auto_checks SET leader_id = :m WHERE id = ANY(:ids)"),
                   {"m": M, "ids": F["auto_move"]})
    moved["leader_auto_checks"] = F["auto_move"]
    db.flush()
    if mv:
        _follow_days(db, mv, m_name, moved)
    # «Who filed» an objection as the leader: the history is his now.
    moved["objections_filed_by"] = _ids(
        db, "UPDATE leader_ai_disputes SET requested_by_profile = :k WHERE leader_id = :m "
            "AND requested_by_profile IN ('leader:298', 'leader:436') RETURNING id", {"m": M, "k": f"leader:{M}"})

    # 3. the concerns and tasks the two leaders held or filed
    p = {"y": Y, "h": H, "m": M, "n": m_name, "x": m_row,
         "refs": sorted({*OLD_ROLE_ROWS, *(r["id"] for r in F["role_rows"])})}
    moved["leader_concerns.held"] = _ids(
        db, "UPDATE leader_concerns SET leader_profile_id = :m, leader_name = :n, leader_role_ref = :x "
            "WHERE leader_profile_id IN (:y, :h) RETURNING id", p)
    moved["leader_concerns.role_ref"] = _ids(
        db, "UPDATE leader_concerns SET leader_role_ref = :x WHERE leader_role_ref = ANY(:refs) RETURNING id", p)
    moved["leader_concerns.filed"] = _ids(
        db, "UPDATE leader_concerns SET owner_profile_id = :m WHERE owner_role = 'leader' "
            "AND owner_profile_id IN (:y, :h) RETURNING id", p)
    moved["leader_tasks"] = _ids(
        db, "UPDATE leader_tasks SET leader_profile_id = :m, leader_name = :n, leader_role_ref = :x "
            "WHERE leader_profile_id IN (:y, :h) OR leader_role_ref = ANY(:refs) RETURNING id", p)

    # 4. #298's excluded day goes with its day; the cutoffs go with the profiles
    moved["leader_day_exclusions"] = []
    for x in F["exclusions"]:
        nk = leader_exclusions.key(M, m_name, x["date"])
        if _one(db, "SELECT count(*) FROM leader_day_exclusions WHERE leader_key = :k "
                    "AND cell_id IS NOT DISTINCT FROM :c AND id <> :i", {"k": nk, "c": x["cell_id"], "i": x["id"]}):
            continue
        db.execute(sql("UPDATE leader_day_exclusions SET leader_key = :k, leader_profile_id = :m, "
                       "leader_name = :n WHERE id = :i"), {"k": nk, "m": M, "n": m_name, "i": x["id"]})
        moved["leader_day_exclusions"].append({"id": x["id"], "was": x["leader_key"], "now": nk})
    moved["leader_cutoffs_deleted"] = F["cutoffs"]
    if F["cutoffs"]:
        db.execute(sql("DELETE FROM leader_cutoffs WHERE id = ANY(:ids)"), {"ids": [c["id"] for c in F["cutoffs"]]})

    # 5. Majidov owes from #298's creation, so the moved history counts as it did;
    #    #298's spelling becomes his alias (the 2–4 Aug sheet rows)
    m.owes_from = OWES_FROM
    m.name_aliases = list(dict.fromkeys([*(m.name_aliases or []), Y_NAME]))
    moved["M_after"] = {"owes_from": str(OWES_FROM), "name_aliases": m.name_aliases}

    # 6. 7331's dated «Boshqaruvchi» is Majidov on every day the two ran it
    cell = db.query(Cell).filter_by(id=CELL_ID).with_for_update().first()
    now = datetime.now(timezone.utc)
    vfx = {"merge": f"leaders #{Y}, #{H} → #{M}", "reason": "2026-11-10 leader handover"}
    mark = CellLinkEvent(cell_id=CELL_ID, field="leader_id", value=M, prev=M, effective_from=BEFORE_MARK,
                         effective_at=datetime.combine(BEFORE_MARK, datetime.min.time(), tzinfo=TZ),
                         applied_at=now, src="manual", by_name=ACTOR, vfx={**vfx, "before_mark": True})
    db.add(mark)
    db.flush()
    evs = [mark.id]
    for d in LINK_DAYS:
        ev = cell_links.record(db, cell, "leader_id", M, src="manual", by=ACTOR, vfx=vfx, effective_from=d,
                               effective_at=datetime.combine(d, datetime.min.time(), tzinfo=TZ).replace(hour=23),
                               now=now)
        db.flush()
        evs.append(getattr(ev, "id", None))
    moved["cell_link_events"] = evs
    cell_links.forget()
    if cell.leader_id != M:
        raise RuntimeError(f"{CELL}'s Boshqaruvchi did not become #{M} (is #{cell.leader_id})")

    # 7. nothing filed is left on the two profiles but the days ruled to stay
    stay = [d["id"] for d in F["days_stay"]] or [0]
    ps = {"y": Y, "h": H, "stay": stay}
    left = {
        "days": _one(db, "SELECT count(*) FROM leader_task_days WHERE leader_id IN (:y, :h) "
                         "AND NOT (id = ANY(:stay))", ps),
        **{t: _one(db, f"SELECT count(*) FROM {t} WHERE leader_id IN (:y, :h) AND NOT (day_id = ANY(:stay))", ps)
           for t in DAY_CHILDREN},
        "leader_ai_reviews": _one(db, "SELECT count(*) FROM leader_ai_reviews r WHERE r.leader_id IN (:y, :h) "
                                      "AND NOT EXISTS (SELECT 1 FROM leader_task_entries e WHERE "
                                      "r.ref = 'bot:' || e.id::text AND e.day_id = ANY(:stay))", ps),
        "leader_ai_disputes": _one(db, "SELECT count(*) FROM leader_ai_disputes r WHERE r.leader_id IN (:y, :h) "
                                       "AND NOT EXISTS (SELECT 1 FROM leader_task_entries e WHERE "
                                       "r.ref = 'bot:' || e.id::text AND e.day_id = ANY(:stay))", ps),
        "leader_day_reports": _one(db, "SELECT count(*) FROM leader_day_reports WHERE leader_id IN (:y, :h) "
                                       "AND NOT (uid = ANY(SELECT 'bot-' || unnest(CAST(:stay AS int[]))::text))", ps),
        "leader_auto_checks": _one(db, "SELECT count(*) FROM leader_auto_checks WHERE leader_id IN (:y, :h) "
                                       "AND NOT (id = ANY(:a))", {**ps, "a": F["auto_stay"] or [0]}),
    }
    left = {k: v for k, v in left.items() if v}
    if left:
        raise RuntimeError(f"filed rows still on #298 / #436 that the delete would destroy: {left}")

    # 8. stop and delete both old profiles — the Profiles tab's own delete
    moved["deleted"] = {}
    for pid in OLD:
        prof = db.query(RoleProfile).filter_by(id=pid).with_for_update().first()
        roles = _profiles._bound_role_rows(db, "leader", pid)
        role_snaps = [_row(r) for r in roles]
        for r in roles:
            _profiles._remove_role_row(db, r)
        cred = db.query(WebCredential).filter_by(profile_key=f"leader:{pid}").first()
        login = {"username": cred.username, "enabled": bool(cred.enabled)} if cred is not None else None
        web_auth.revoke_browser_sessions(db, f"leader:{pid}")
        db.flush()   # the version bump lands before the purge deletes the login row
        destroyed = _profiles._leader_footprint(db, pid)
        snap = _row(prof)
        _profiles._purge_leader_profile(db, pid)
        _profiles._purge_profile_key(db, "leader", pid)
        db.delete(prof)
        db.flush()
        moved["deleted"][str(pid)] = {"profile": snap, "role_rows": role_snaps, "web_login": login,
                                      "destroyed": destroyed}

    # 9. after: the two are gone, Majidov runs the cell and holds the days
    if _one(db, "SELECT count(*) FROM role_profiles WHERE id IN (:y, :h)", {"y": Y, "h": H}):
        raise RuntimeError("an old profile survived its delete")
    got = _one(db, "SELECT count(*) FROM leader_task_days WHERE id = ANY(:ids) AND leader_id = :m",
               {"ids": mv or [0], "m": M})
    if got != len(mv):
        raise RuntimeError(f"{got} of {len(mv)} moved days are on #{M}")
    return moved


# ── run ───────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run(db: Session) -> Optional[dict]:
    if not in_window():
        return None
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
        _put(db, RECORD, _j({"at": _now_iso(), "result": "failed", "attempt": tries + 1,
                             "retried": tries + 1 < TRIES, "error": f"{where}: {type(exc).__name__}: {exc}"[:600]}))
        db.commit()
        log.exception("7331 leader handover: %s failed", where)

    try:
        F, P = facts(db)
    except Exception as exc:  # noqa: BLE001
        fail("read", exc)
        return None
    if P:
        db.rollback()
        rec = {"at": _now_iso(), "result": "blocked", "problems": P, "facts": F}
        _put(db, FLAG, "blocked")
        _put(db, RECORD, _j(rec))
        db.commit()
        return rec
    try:
        moved = apply(db, F)
        rec = {"at": _now_iso(), "result": "applied", "problems": [], "facts": F, "moved": moved}
        _put(db, FLAG, "done")
        _put(db, RECORD, _j(rec))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        fail("apply", exc)
        return None
    _after(db, rec)
    return rec


def _after(db: Session, rec: dict) -> None:
    """After the commit: the caches and the Jurnal. Never undoes the handover."""
    for fn in ("cell_register.after_commit", "leader_register.forget", "kept_answer.forget_all",
               "cell_links.forget"):
        mod, name = fn.split(".")
        try:
            getattr(__import__(f"app.services.{mod}", fromlist=[name]), name)()
        except Exception:  # noqa: BLE001
            pass
    try:
        from app.services import action_log
        mv, c = rec.get("moved") or {}, rec["facts"].get("counts") or {}
        M = mv.get("M")
        action_log.record_system(
            "identity", "identity.profiles_merged", db, target_kind="profile", target_id=f"leader:{M}",
            target_name="MAJIDOV OZODJON XAMID O'G'LI", unit_id=UNIT, unit_name=UNIT_NAME,
            details=[("from", f"leader:{Y} {Y_NAME}; leader:{H} {H_NAME}"), ("days", c.get("days")),
                     ("17 Oct", f"day {H_OVERLAP_DAY} (95%) → #{M}; day {Y_OVERLAP_DAY} (15%) deleted with #{Y}"),
                     ("cell", f"{CELL} Boshqaruvchi #{M}, dated from {BEFORE_MARK}"),
                     ("deleted", f"#{Y}, #{H}")],
            reason=REASON)
        for pid, nm in ((Y, Y_NAME), (H, H_NAME)):
            d = (mv.get("deleted") or {}).get(str(pid)) or {}
            action_log.record_system(
                "identity", "identity.profile_deleted", db, target_kind="profile", target_id=f"leader:{pid}",
                target_name=nm, unit_id=UNIT, unit_name=UNIT_NAME,
                details=[("role", "leader"), ("profile", nm), ("history", f"→ leader:{M}"),
                         *[(k, v) for k, v in (d.get("destroyed") or {}).items()]],
                reason=REASON)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


# ── report ────────────────────────────────────────────────────────────────────

def summary(rec: dict) -> str:
    F = rec.get("facts") or {}
    res = rec.get("result")
    head = {"blocked": "REFUSED — nothing was written", "applied": "APPLIED",
            "failed": "FAILED — nothing was written"}.get(res, res)
    L = [f"7331 · Yuldashov #{Y} + Haydarov #{H} → Majidov Ozodjon · {head}", f"at {rec.get('at')}"]
    if rec.get("error"):
        L.append(f"error: {rec['error']}")
    P = rec.get("problems") or []
    if P:
        L += ["", "REFUSED FOR:", *[f"  ✗ {x}" for x in P]]
    if not F:
        return "\n".join(L)
    L += ["", f"VERIFIX (stored read {F.get('org_read')}, sync {F.get('sync_mode')}):"]
    for k, v in (F.get("vfx") or {}).items():
        L.append(f"  {k} {v.get('name')} · {v.get('status')} · «{v.get('job')}» · [{v.get('cell_raw')}] · "
                 f"hired {v.get('hired')}" + (f" · dismissed {v['dismissed']}" if v.get("dismissed") else ""))
    c = F.get("cell") or {}
    L += ["", f"CELL {CELL} before: unit {c.get('manager_id')} · Boshqaruvchi #{c.get('leader_id')} · "
              f"Egasi #{c.get('owner_id')}"]
    for x in F.get("links") or []:
        L.append(f"  event #{x['id']} {x['field']} {x['prev']} → {x['value']} from {x['effective_from']} · "
                 f"{x['src']} · {x['by_name']}")
    L += ["", f"MAJIDOV before: {_j(F.get('majidov'))}", f"  his role rows: {_j(F.get('m_role_rows'))}"]
    L += ["", "WHAT MOVES:"] + [f"  {k}: {v}" for k, v in (F.get("counts") or {}).items()]
    L.append(f"  days staying with the deleted profiles: "
             f"{_j([(d['id'], d['leader_id'], d['date'], d['completion']) for d in F.get('days_stay') or []])}")
    if F.get("days_clash_with_majidov"):
        L.append(f"  ↑ includes days Majidov filed himself on the same date (his win): {F['days_clash_with_majidov']}")
    L.append(f"  excluded days → Majidov: {_j(F.get('exclusions'))}")
    L.append(f"  cutoffs deleted: {_j(F.get('cutoffs'))}")
    op = F.get("open") or {}
    L.append(f"  open concerns → Majidov: {_j(op.get('concerns'))}")
    L.append(f"  open objections → Majidov: {_j(op.get('objections'))}")
    L += ["", "STOPPED AND DELETED:",
          f"  Telegram role rows removed: {_j(F.get('role_rows'))}",
          f"  browser logins removed: {_j(F.get('web_logins'))}",
          f"  Verifix hand ties left as they are: {_j(F.get('verifix_ties'))}",
          "  stays under the old names (authorship): comments, chat messages, read marks, bell rows, "
          "activity, the Jurnal"]
    mv = rec.get("moved")
    if mv:
        L += ["", f"Majidov is profile #{mv.get('M')} · owes from {OWES_FROM} · alias «{Y_NAME}»",
              f"  7331 «Boshqaruvchi» events: {mv.get('cell_link_events')}",
              "", "MOVED (ids, for an undo by hand):"]
        L += [f"  {k}: {_j(v)}" for k, v in mv.items() if k != "deleted"]
        L += ["", "DELETED ROWS (snapshots):"] + [f"  #{k}: {_j(v)}" for k, v in (mv.get("deleted") or {}).items()]
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
    """`startup._send_report_once`'s sender: the record as a .txt file plus its
    head as messages. Raises on a failed send, so it is retried."""
    rec = record(db)
    db.rollback()
    if not rec:
        raise RuntimeError("no record yet")
    body = summary(rec)
    print("[startup] 7331 leader handover:\n" + body[:20000])
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": f"7331: Yuldashov + Haydarov → Majidov, {rec.get('result')}. "
                      "Forward this file to the Claude session that did the handover."},
          files={"document": (f"leader-handover-7331-{rec.get('result')}-{stamp}.txt",
                              body.encode("utf-8"), "text/plain")})
    head = body if len(body) < 3800 else body[:3800] + "\n… (the rest is in the file above)"
    _post("sendMessage", {"chat_id": chat_id, "text": head})
    return 1
