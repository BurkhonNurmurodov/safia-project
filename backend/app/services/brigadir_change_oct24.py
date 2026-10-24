"""TEMPORARY one-shot (2026-10-24): four units change brigadir.

The operator's ten rulings are in `docs/plan-brigadir-change-oct24.md`; the
state this was written against is the 16:16 report of
`brigadir_change_report_oct24`. In this system a brigadir IS the unit
(`managers`), so the change is, per unit: the NAME, the Telegram HOLDERS, the
Verifix TIE, the browser LOGIN and the PHOTO — and nothing about cells,
leaders, figures or history (ruling 2: rename in place).

| unit | today | becomes | tie after | kind after |
|---|---|---|---|---|
| 9 | Mirmaxmudova Munira | Raximova Kamola | Kamola's Verifix id (taken from unit 10) | Verifix's (brigadir) |
| 6 | Suvonov Elshod | Erkanboyev Zafarjon | held UNTIED by hand | «Brigadir o'rnida» (acting) |
| 5 | Suvonov Elshod OF | Suvonov Elshod | unchanged (Suvonov) | Verifix's (brigadir) |
| 10 | Raximova Kamola | Niyozov Izzatilla | held UNTIED by hand | «Brigadir o'rnida» (acting) |

Erkanboyev and Niyozov keep their leader profiles and cells (ruling 4), so the
units cannot carry their Verifix ids (a person is tied to a profile OR a unit);
they are held untied until Verifix lists the men as brigadir, and a held-untied
unit keeps its cells against Verifix's brigadir (`verifix_sync` — ruling 5).

Holders (ruling 7): Munira's account leaves unit 9 (her only role — the account
goes with it); Kamola's account leaves unit 10 and keeps 9; Suvonov's account
leaves unit 6 and keeps 5. Erkanboyev already holds unit 6, Niyozov already
holds unit 10. Everybody else stays. Three accounts carry the name of the
profile they first claimed, not their own — those display names are corrected.

Names: the four renames and their role rows; the OLD spellings nobody carries
any more («Mirmaxmudova Munira», «Suvonov Elshod OF», with their Cyrillic and
English display forms) go into `name_aliases` so the sheet-era rows keyed by
them still resolve (`name_map.sheet_alias_map`), and their `name.*` translation
overrides are deleted. «Raximova Kamola» and «Suvonov Elshod» are NOT kept as
aliases of units 10 and 6 (ruling 6: rows naming Suvonov or Kamola, past and
future, resolve to the unit that now carries the name); their translation rows
stay and now describe the right unit.

Browser logins (`web_credentials`, one per profile): Munira's is deleted,
Suvonov's second one (unit 6) is deleted, Kamola's follows her to unit 9 with
its token version bumped (every open browser session on either unit must sign
in again). Units 6 and 10 are left with NO browser login — an admin creates
them on the Profiles tab if the two men need the browser.

Photos (`profile_photos`): unit 10's face (Kamola, fetched from Verifix) goes to
unit 9, each man's leader-profile face goes to his unit; a face that does not
exist is not invented (the row is removed so the initials show).

Everything is ONE transaction with the flag, so the change and its «done» can
never disagree. Preconditions that fail leave the database untouched and DM
the problems once (flag «blocked»); a crash is retried at the next boot, three
times. After the commit: the Jurnal rows, Kamola's photo from Verifix for unit
9, the leaders' and brigadirs' notifications (ruling 9, once — their own flag),
the admins' DM (its own flag, retried until delivered), and Munira's coming
`new_unit` sync item pre-dismissed (she is a Verifix brigadir with no unit here
by design now). Delete this module, `startup.apply_brigadir_change_oct24` and
both entrypoint calls once every flag reads «done».
"""
from __future__ import annotations

import html
import json
import logging
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    AppSetting, Manager, ProfilePhoto, RoleProfile, TelegramUser, TelegramUserRole,
    Translation, VerifixSyncItem, VerifixTie, WebCredential,
)
from app.services import action_log, supervisor_kind, verifix_org, verifix_sync
from app.services.cell_register import Refused

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Tashkent")

FLAG = "brigadir_change_2026_10_24_v1"
RECORD = "brigadir_change_2026_10_24"
NOTIFY_FLAG = FLAG + "_notify"
DM_FLAG = FLAG + "_dm"
ACTOR = "Tizim · 2026-10-24 brigadir o'zgarishi"
DAY = date(2026, 10, 24)
DAY_LABEL = "24.10.2026"
TRIES = 3
LOCK_KEY = 20261024          # pg advisory lock: one copy applies the change

# unit id → the change. `person` is the brigadir after; `holder` their account.
UNITS = {
    9:  {"today": "Mirmaxmudova Munira", "new": "Raximova Kamola",
         "tie": "kamola", "kind": None, "holder": 7503947576},
    6:  {"today": "Suvonov Elshod", "new": "Erkanboyev Zafarjon",
         "tie": "untie", "kind": "acting", "holder": 8381697456, "leader_from": 6},
    5:  {"today": "Suvonov Elshod OF", "new": "Suvonov Elshod",
         "tie": "keep", "kind": None, "holder": 807547194},
    10: {"today": "Raximova Kamola", "new": "Niyozov Izzatilla",
         "tie": "untie", "kind": "acting", "holder": 5378156022, "leader_from": 10},
}
ORDER = (9, 6, 5, 10)
# Supervisor role rows that go: (telegram_id, unit) — ruling 7.
REMOVE_HOLDERS = (
    (792986682, 9),     # Mirmaxmudova Munira — her only role; the account goes with it
    (7503947576, 10),   # Raximova Kamola — keeps unit 9
    (807547194, 6),     # Suvonov Elshod — keeps unit 5
)
# Account display names that were the first claimed profile's, not the person's.
RENAME_ACCOUNTS = (
    (7503947576, "Mirmaxmudova Munira", "Raximova Kamola"),
    (8381697456, "Suvonov Elshod OF", "Erkanboyev Zafarjon"),
    (5378156022, "Raximova Kamola", "Niyozov Izzatilla"),
)
# Old spellings that keep resolving the sheet-era rows of the renamed unit.
ALIASES = {
    9: ["Mirmaxmudova Munira", "Мирмахмудова Мунира", "Mirmakhmudova Munira"],
    5: ["Suvonov Elshod OF", "Сувонов Элшод ОФ"],
    6: [],
    10: [],
}
DROP_TRANSLATION_KEYS = ("name.Mirmaxmudova Munira", "name.Suvonov Elshod OF")


# ── helpers ───────────────────────────────────────────────────────────────────

def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _leader_profile(db: Session, unit: int, person: str) -> Optional[RoleProfile]:
    hits = [p for p in db.query(RoleProfile).filter_by(role="leader", manager_id=unit).all()
            if verifix_org.same_person(person, p.name or "")]
    return hits[0] if len(hits) == 1 else None


def _emp(org: dict, vid: Optional[str]) -> dict:
    return ((org or {}).get("emps") or {}).get(vid or "") or {}


def _emp_name(org: dict, vid: Optional[str]) -> str:
    return _emp(org, vid).get("name") or ""


# ── preconditions ─────────────────────────────────────────────────────────────

def check(db: Session) -> tuple[dict, list[str]]:
    """What the run reads before it writes anything. Returns (facts, problems);
    any problem blocks the whole run — nothing half-applied."""
    problems: list[str] = []
    facts: dict = {}
    org, org_at = verifix_org.stored(db)
    if not org:
        problems.append("no stored Verifix org read (tie_by_hand needs it)")
    facts["org_at"] = org_at.isoformat(timespec="minutes") if org_at else None

    units = {m.id: m for m in db.query(Manager).all()}
    for uid, spec in UNITS.items():
        m = units.get(uid)
        if m is None:
            problems.append(f"unit {uid} does not exist")
            continue
        if m.archived:
            problems.append(f"unit {uid} is archived")
        if (m.name or "").strip() != spec["today"]:
            problems.append(f"unit {uid} is «{m.name}», expected «{spec['today']}»")
    for uid, spec in UNITS.items():
        for m in units.values():
            if m.id == uid or m.archived or not verifix_org.same_person(spec["new"], m.name or ""):
                continue
            if m.id in UNITS and verifix_org.same_person(UNITS[m.id]["today"], spec["new"]):
                continue                      # the chain itself: 10 → 9, 6 → 5
            problems.append(f"live unit {m.id} «{m.name}» already carries the name meant for unit {uid}")
    if problems:
        return facts, problems

    # The Verifix ids move with the people: Kamola's from unit 10 to unit 9;
    # Suvonov's stays on unit 5 (and leaves unit 6). Verified by NAME, never
    # assumed from the report.
    kamola = units[10].vfx_employee_id
    if not kamola or not verifix_org.same_person("Raximova Kamola", _emp_name(org, kamola)):
        problems.append(f"unit 10's Verifix tie ({kamola} «{_emp_name(org, kamola)}») is not Raximova Kamola")
    suvonov = units[5].vfx_employee_id
    if not suvonov or not verifix_org.same_person("Suvonov Elshod", _emp_name(org, suvonov)):
        problems.append(f"unit 5's Verifix tie ({suvonov} «{_emp_name(org, suvonov)}») is not Suvonov Elshod")
    if units[6].vfx_employee_id and units[6].vfx_employee_id != suvonov:
        problems.append(f"unit 6 is tied to {units[6].vfx_employee_id} «{_emp_name(org, units[6].vfx_employee_id)}», not to unit 5's Suvonov")
    munira = units[9].vfx_employee_id
    if munira and not verifix_org.same_person("Mirmaxmudova Munira", _emp_name(org, munira)):
        problems.append(f"unit 9 is tied to {munira} «{_emp_name(org, munira)}», not to Mirmaxmudova Munira")
    facts.update(kamola_vfx=kamola, suvonov_vfx=suvonov, munira_vfx=munira)

    # The two men must still be leaders of their units (ruling 4 keeps them).
    for uid, person in ((6, "Erkanboyev Zafarjon"), (10, "Niyozov Izzatilla")):
        p = _leader_profile(db, uid, person)
        if p is None:
            problems.append(f"no single leader profile for {person} in unit {uid}")
        else:
            facts[f"leader_{uid}"] = p.id
            if p.vfx_employee_id and db.query(Manager.id).filter(
                    Manager.vfx_employee_id == p.vfx_employee_id).first():
                problems.append(f"{person}'s Verifix id {p.vfx_employee_id} is already on a unit")
    # The new brigadirs hold their units already (Kamola 9, Erkanboyev 6,
    # Suvonov 5, Niyozov 10) — the change must not leave a unit with no brigadir.
    for uid, spec in UNITS.items():
        r = db.query(TelegramUserRole).filter_by(role="supervisor", role_id=uid,
                                                 telegram_id=spec["holder"], status="approved").first()
        if r is None:
            problems.append(f"account {spec['holder']} does not hold unit {uid} approved — "
                            f"{spec['new']} would be left without their unit")
    return facts, problems


# ── the change ────────────────────────────────────────────────────────────────

def apply(db: Session, facts: dict) -> dict:
    """Every write, staged on `db`; the caller commits. Returns the record."""
    from app.routers import profiles as _profiles
    org, _ = verifix_org.stored(db)
    rec: dict = {"at": _now_iso(), "units": {}, "holders": [], "accounts": [], "web": [],
                 "photos": [], "translations": [], "ties": [], "left": []}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(list(UNITS))).all()}

    # Snapshots BEFORE anything moves: faces and logins keyed by profile.
    photo = {r.profile_key: (r.data, r.mime) for r in db.query(ProfilePhoto).filter(
        ProfilePhoto.profile_key.in_([f"supervisor:{u}" for u in UNITS]
                                     + [f"leader:{facts['leader_6']}", f"leader:{facts['leader_10']}"])).all()}
    meta_photo = {u: (units[u].vfx_meta or {}).get("photo_set") for u in UNITS}
    leader_meta = {p.id: (p.vfx_meta or {}).get("photo_set")
                   for p in db.query(RoleProfile).filter(RoleProfile.id.in_(
                       [facts["leader_6"], facts["leader_10"]])).all()}

    # 1. Names — the unit and every supervisor role row that names it (what
    #    profiles._rename_profile does, minus the translation re-key: a brigadir
    #    REPLACEMENT must not hand one person's Cyrillic spelling to another).
    for uid in ORDER:
        m, spec = units[uid], UNITS[uid]
        old = m.name
        m.name = spec["new"]
        n = 0
        for r in db.query(TelegramUserRole).filter_by(role="supervisor", role_id=uid).all():
            r.full_name = spec["new"]
            n += 1
        m.name_aliases = ALIASES[uid] or None
        rec["units"][uid] = {"from": old, "to": spec["new"], "role_rows": n,
                             "aliases": ALIASES[uid]}
    for key in DROP_TRANSLATION_KEYS:
        rows = db.query(Translation).filter(Translation.key == key).all()
        for t in rows:
            db.delete(t)
        rec["translations"].append({"key": key, "deleted": len(rows)})

    # 2. Holders — three supervisor rows go (ruling 7).
    for tid, uid in REMOVE_HOLDERS:
        row = db.query(TelegramUserRole).filter_by(role="supervisor", role_id=uid, telegram_id=tid).first()
        if row is None:
            rec["left"].append(f"no supervisor:{uid} row for account {tid} — nothing to remove")
            continue
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        others = db.query(TelegramUserRole).filter(TelegramUserRole.telegram_id == tid,
                                                   TelegramUserRole.id != row.id).count()
        rec["holders"].append({"row": row.id, "telegram_id": tid, "unit": uid,
                               "account": user.full_name if user else None,
                               "account_deleted": others == 0})
        _profiles._remove_role_row(db, row)
    db.flush()
    for tid, was, new in RENAME_ACCOUNTS:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        if user is None:
            rec["left"].append(f"account {tid} not found — display name not corrected")
            continue
        if not verifix_org.same_person(was, user.full_name or ""):
            rec["left"].append(f"account {tid} is «{user.full_name}», not «{was}» — display name left")
            continue
        rec["accounts"].append({"telegram_id": tid, "from": user.full_name, "to": new})
        user.full_name = new

    # 3. Verifix ties — unit 9 takes Kamola's id (hand tie, with the refusal
    #    rules of the Verifix sinxron page), units 6 and 10 are held untied.
    #    Done AFTER the renames so tie_by_hand's `confirmed` name is the new one.
    verifix_sync.tie_by_hand(db, "unit", 9, facts["kamola_vfx"], by=ACTOR)
    rec["ties"].append({"unit": 9, "tied_to": facts["kamola_vfx"], "name": _emp_name(org, facts["kamola_vfx"])})
    for uid in (10, 6):
        verifix_sync.tie_by_hand(db, "unit", uid, None, by=ACTOR)
        rec["ties"].append({"unit": uid, "untied": True, "was": facts["kamola_vfx"] if uid == 10 else facts["suvonov_vfx"]})
    db.flush()
    for uid in ORDER:
        m, spec = units[uid], UNITS[uid]
        if spec["kind"]:
            supervisor_kind.set_manual(m, spec["kind"], ACTOR)
            # The evidence beside the choice names the man Verifix lists as a
            # leader — not the brigadir who left, whom the old check had found.
            lp = db.query(RoleProfile).filter_by(id=facts.get(f"leader_{uid}")).first()
            e = _emp(org, lp.vfx_employee_id if lp else None)
            if e:
                km = dict(m.supervisor_kind_meta or {})
                km["vfx"] = {"checked_at": _now_iso(), "found": True, "name": e.get("name"),
                             "job": verifix_org.job_name(org, e.get("job")), "status": e.get("status")}
                m.supervisor_kind_meta = km
    # Unit 9's kind evidence named Munira; say what Verifix lists for Kamola.
    e9 = _emp(org, facts["kamola_vfx"])
    m9 = units[9]
    km = dict(m9.supervisor_kind_meta or {})
    km.update(src="verifix", at=_now_iso(), by="Verifix",
              vfx={"checked_at": _now_iso(), "found": True, "name": e9.get("name"),
                   "job": verifix_org.job_name(org, e9.get("job")), "status": e9.get("status")})
    m9.supervisor_kind = "supervisor" if verifix_org.is_supervisor_job(km["vfx"]["job"]) else "acting"
    m9.supervisor_kind_meta = km

    # 4. Browser logins — one per profile; they follow the PEOPLE.
    cred = {c.profile_key: c for c in db.query(WebCredential).filter(
        WebCredential.profile_key.in_([f"supervisor:{u}" for u in UNITS])).all()}
    c9, c10, c6 = cred.get("supervisor:9"), cred.get("supervisor:10"), cred.get("supervisor:6")
    if c9 is not None:
        rec["web"].append({"deleted": c9.username, "was": "supervisor:9 (Mirmaxmudova Munira)"})
        db.delete(c9)
    if c6 is not None:
        rec["web"].append({"deleted": c6.username, "was": "supervisor:6 (Suvonov Elshod's second login)"})
        db.delete(c6)
    db.flush()
    if c10 is not None:
        bump = max(int(c10.token_version or 0), int(c9.token_version or 0) if c9 is not None else 0) + 1
        rec["web"].append({"moved": c10.username, "from": "supervisor:10", "to": "supervisor:9",
                           "token_version": bump})
        c10.profile_key = "supervisor:9"
        c10.token_version = bump
    db.flush()

    # 5. Photos — Kamola's face to unit 9, each man's face to his unit.
    def put_photo(key: str, src: Optional[tuple], sha, note: str) -> None:
        from app.services import profile_photo
        if src is None:
            row = db.query(ProfilePhoto).filter_by(profile_key=key).first()
            if row is not None:
                db.delete(row)
            rec["photos"].append({"key": key, "removed": True, "why": note})
            return
        profile_photo.store(db, key, src[0])
        rec["photos"].append({"key": key, "copied_from": note, "sha": sha})

    put_photo("supervisor:9", photo.get("supervisor:10"), meta_photo.get(10), "supervisor:10 (Raximova Kamola)")
    put_photo("supervisor:6", photo.get(f"leader:{facts['leader_6']}"), leader_meta.get(facts["leader_6"]),
              f"leader:{facts['leader_6']} (Erkanboyev Zafarjon)")
    put_photo("supervisor:10", photo.get(f"leader:{facts['leader_10']}"), leader_meta.get(facts["leader_10"]),
              f"leader:{facts['leader_10']} (Niyozov Izzatilla)")
    # The sync's photo bookkeeping follows: unit 9 carries Kamola's sha (so a
    # pass does not fetch it again) when the copy happened; units 6 and 10 carry
    # the men's shas, so a tie made later finds the face current.
    for uid, sha in ((9, meta_photo.get(10)), (6, leader_meta.get(facts["leader_6"])),
                     (10, leader_meta.get(facts["leader_10"]))):
        m = units[uid]
        vm = dict(m.vfx_meta or {})
        vm.pop("photo_kept", None)
        vm.pop("photo_failed", None)
        if sha:
            vm["photo_set"] = sha
        else:
            vm.pop("photo_set", None)
        m.vfx_meta = vm or None

    # 6. Munira is a Verifix brigadir with no unit here BY DESIGN now: the
    #    `new_unit` item the next pass would raise is dismissed in advance
    #    (same key and value hash as the pass computes — a change on Verifix's
    #    side brings it back, as it should).
    try:
        munira = facts.get("munira_vfx")
        if munira:
            divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
            cn = verifix_org.cell_nodes(divs, emps, jobs)
            e = next((p for p in verifix_org.people(divs, emps, jobs, cn) if p["id"] == munira), None)
            if e is not None:
                payload = {"vfx": verifix_org.who(e), "name": verifix_org.profile_name(e["name"])}
                h = verifix_sync._hash("new_unit", payload)
                key = f"emp:{munira}"
                if not db.query(VerifixSyncItem.id).filter_by(kind="new_unit", key=key,
                                                              value_hash=h).first():
                    now = datetime.now(timezone.utc)
                    db.add(VerifixSyncItem(kind="new_unit", key=key, payload=payload, value_hash=h,
                                           status="dismissed", first_seen=now, last_seen=now,
                                           decided_at=now, decided_by=ACTOR,
                                           note="Left the platform 24.10.2026 (brigadir change)"))
                    rec["munira_new_unit"] = "pre-dismissed"
    except Exception as exc:  # noqa: BLE001 — a nicety, never the change
        rec["left"].append(f"could not pre-dismiss Munira's new_unit item: {exc}"[:200])
    return rec


def run(db: Session) -> Optional[dict]:
    """One pass. None = already done (or blocked / out of tries)."""
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

    # One copy at a time (the worker swap boots the new copy beside the old
    # one): a transaction-scoped advisory lock, then the flag read again
    # under it — the other copy sees «done» or is told to wait.
    from sqlalchemy import text as _text
    try:
        got = db.execute(_text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY}).scalar()
    except Exception:  # noqa: BLE001 — not Postgres: no second copy either
        got = True
    if not got:
        db.rollback()
        print("[startup] brigadir change: another copy holds the lock — left to it")
        return None
    db.expire_all()
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        db.rollback()
        return None

    facts, problems = check(db)
    if problems:
        db.rollback()
        rec = {"at": _now_iso(), "result": "blocked", "problems": problems, "facts": facts}
        _put(db, FLAG, "blocked")
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
        print("[startup] brigadir change REFUSED: " + "; ".join(problems))
        return rec
    try:
        rec = apply(db, facts)
        rec.update(result="applied", facts=facts)
        _put(db, FLAG, "done")
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _put(db, FLAG, f"failed:{tries + 1}")
        _put(db, RECORD, json.dumps({"at": _now_iso(), "result": "failed", "attempt": tries + 1,
                                     "retried": tries + 1 < TRIES,
                                     "error": f"{type(exc).__name__}: {exc}"[:500]}))
        db.commit()
        log.exception("brigadir change failed")
        print(f"[startup] brigadir change failed (attempt {tries + 1}/{TRIES}): {exc}")
        return None

    # After the commit: the Jurnal, Kamola's face from Verifix, the sync rule's
    # memory of what was decided.
    for uid in ORDER:
        u = rec["units"][uid]
        action_log.record_system(
            "org", "org.brigadir_changed", db, target_kind="unit", target_id=uid,
            target_name=u["to"], unit_id=uid, unit_name=u["to"], day=DAY.isoformat(),
            changes=[("name", u["from"], u["to"]), ("brigadir", UNITS[uid]["today"], UNITS[uid]["new"])],
            details=[("role_rows", u["role_rows"]), ("aliases", ", ".join(u["aliases"]) or None),
                     ("verifix", next((json.dumps(t, default=str) for t in rec["ties"] if t["unit"] == uid), "unchanged")),
                     ("kind", UNITS[uid]["kind"] or "Verifix's")],
            reason="The operator's ruling of 2026-10-24 (docs/plan-brigadir-change-oct24.md): "
                   "rename in place, the unit keeps its cells, leaders and history")
    db.commit()
    try:
        rec["photo_fetch_9"] = verifix_sync.fetch_photo_now(db, "unit", 9)
    except Exception as exc:  # noqa: BLE001 — a pass fetches it later
        rec["photo_fetch_9"] = f"failed: {exc}"[:200]
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    return rec


# ── after: the people are told, the admins get the record ─────────────────────

def notify(db: Session) -> None:
    """Ruling 9: the leaders of the four units learn their new brigadir, and
    the four brigadirs learn their unit — once (own flag), through the
    notification centre (bell row + DM in each account's language)."""
    f = _setting(db, NOTIFY_FLAG)
    if f is not None and (f.value or "").startswith("done"):
        return
    r = _setting(db, RECORD)
    rec = json.loads(r.value) if r is not None and r.value else {}
    if rec.get("result") != "applied":
        return
    from app.routers.staff import _notify, notify_profile
    sent: dict = {"leaders": 0, "brigadirs": 0}
    for uid in ORDER:
        spec = UNITS[uid]
        params = {"unit": spec["today"], "name": spec["new"], "date": DAY_LABEL}
        skip = {spec["holder"]}          # the man himself is a leader of his unit (6, 10)
        for p in db.query(RoleProfile).filter_by(role="leader", manager_id=uid).all():
            try:
                skip |= notify_profile(db, f"leader:{p.id}", "brigadir_changed", params,
                                       skip_accounts=skip)
                sent["leaders"] += 1
            except Exception:  # noqa: BLE001
                log.exception("brigadir change: leader %s not told", p.id)
        try:
            _notify(db, spec["holder"], nkey="brigadir_appointed", params=params,
                    profile=f"supervisor:{uid}")
            sent["brigadirs"] += 1
        except Exception:  # noqa: BLE001
            log.exception("brigadir change: brigadir of unit %s not told", uid)
    _put(db, NOTIFY_FLAG, f"done:{sent['leaders']}+{sent['brigadirs']}")
    db.commit()


def summary(rec: dict) -> str:
    e = html.escape
    L = ["🔁 <b>Brigadir o'zgarishi · 24.10.2026</b>", ""]
    if rec.get("result") == "blocked":
        L.append("<b>REFUSED — nothing was written.</b> Problems:")
        L += [f"• {e(p)}" for p in rec.get("problems") or []]
        L.append("")
        L.append("Fix the state (or the expectations in services/brigadir_change_oct24.py, with a NEW flag key) and redeploy.")
        return "\n".join(L)
    if rec.get("result") == "failed":
        tail = ("retried at the next boot" if rec.get("retried")
                else f"attempts spent ({TRIES}) — NOT retried; fix and redeploy with a new flag key")
        return (f"❌ Brigadir change failed (attempt {rec.get('attempt')}/{TRIES}): "
                f"{e(rec.get('error') or '')} — {tail}.")
    for uid in ORDER:
        u = (rec.get("units") or {}).get(str(uid)) or (rec.get("units") or {}).get(uid) or {}
        tie = next((t for t in rec.get("ties") or [] if t.get("unit") == uid), None)
        tie_s = ("untied by hand (held)" if tie and tie.get("untied")
                 else f"tied to Verifix {tie.get('tied_to')} {e(tie.get('name') or '')}" if tie
                 else "Verifix tie unchanged")
        L.append(f"<b>Unit {uid}</b>: «{e(u.get('from') or '')}» → «{e(u.get('to') or '')}» · "
                 f"{u.get('role_rows')} role rows renamed · {tie_s}"
                 + (f" · kind «Brigadir o'rnida»" if UNITS[uid]["kind"] else ""))
    L.append("")
    L.append("<b>Holders</b>:")
    for h in rec.get("holders") or []:
        L.append(f"• {e(h.get('account') or '')} (tid {h.get('telegram_id')}) left unit {h.get('unit')}"
                 + (" — account deleted (no roles left)" if h.get("account_deleted") else ""))
    for a in rec.get("accounts") or []:
        L.append(f"• account {a['telegram_id']} display name «{e(a['from'])}» → «{e(a['to'])}»")
    L.append("<b>Browser logins</b>: " + ("; ".join(
        f"{w.get('moved')} → {w.get('to')} (v{w.get('token_version')})" if w.get("moved")
        else f"{w.get('deleted')} deleted ({w.get('was')})" for w in rec.get("web") or []) or "none touched"))
    L.append("Units 6 and 10 have NO browser login now — create them on the Profiles tab if Erkanboyev / Niyozov need the browser.")
    L.append("<b>Photos</b>: " + "; ".join(
        f"{p['key']} ← {e(p.get('copied_from') or '')}" if p.get("copied_from") else f"{p['key']} removed ({e(p.get('why') or '')})"
        for p in rec.get("photos") or []))
    L.append(f"Unit 9's photo from Verifix: {e(str(rec.get('photo_fetch_9')))}")
    L.append("<b>Translations</b>: " + "; ".join(f"{e(t['key'])} ×{t['deleted']} deleted" for t in rec.get("translations") or []))
    if rec.get("munira_new_unit"):
        L.append("Munira's coming «new_unit» sync item: pre-dismissed.")
    if rec.get("left"):
        L.append("")
        L.append("<b>Left as it was</b>:")
        L += [f"• {e(x)}" for x in rec["left"]]
    L.append("")
    L.append("Still yours: Erkanboyev's account also holds unit 5 (Suvonov Elshod) since 12 Sep — remove it on the Users tab if that was only for the hand-over; "
             "two PENDING claims on unit 10 (accounts 5722491071 «TexnomartHR» and 143181579) wait for a decision; "
             "when Verifix lists Erkanboyev / Niyozov as brigadir: FIRST retire or untie the man's leader profile (a person is tied to a profile OR a unit), "
             "THEN tie unit 6 / 10 to him on «Verifix sinxron» — that lifts the hold. "
             "Telegram app sessions already open keep the old unit for up to 24 h or until the app is relaunched; browser sessions on units 9, 10 and 6 ended now.")
    return "\n".join(L)


def dm_admins(db: Session) -> None:
    """The record to every admin, once PER RESULT: a «failed» DM does not
    silence the «applied» one the retry produces. A failure to send is
    retried at the next boot."""
    r = _setting(db, RECORD)
    if r is None or not r.value:
        return
    rec = json.loads(r.value)
    f = _setting(db, DM_FLAG)
    if f is not None and (f.value or "").startswith(f"done:{rec.get('result')}:"):
        return
    text = summary(rec)
    print("[startup] " + text.replace("\n", "\n[startup] "))
    try:
        from app.routers.boot import _recipients
        from app.telegram_bot import bot
        n = 0
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text[:4000], parse_mode="HTML")
                n += 1
            except Exception:  # noqa: BLE001
                log.exception("brigadir change: admin %s not told", chat_id)
        if not n:
            raise RuntimeError("no admin reached")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] brigadir change DM failed: {exc}")
        return
    _put(db, DM_FLAG, f"done:{rec.get('result')}:{n}")
    db.commit()
