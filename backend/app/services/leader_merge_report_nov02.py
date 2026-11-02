"""TEMPORARY boot report (2026-11-02): Elnora and her deputy Xasan Malikov.

The operator (2026-11-02): one of Maksumov Sanjar's leaders, Elnora, was away
for a while and a leader profile was made for her deputy («zam»), Xasan
Malikov. She is back, and her current profile is to be MERGED with the
deputy's history. Before a merge is planned, production's own record of both
people is DMed once — the merge one-shot is written against THIS, never a copy.

READS and writes nothing but its flag (`startup.LEADER_MERGE_REPORT_FLAG`):
Maksumov Sanjar's unit(s); every profile named Elnora or Malikov (any role) and
every leader profile of those units; per such profile its columns, Telegram
holders, browser login, photo, hand ties, cells, dated cell links, unit moves,
cutoffs, exclusions, day sources, per-leader task settings, a count of every
row in every table that names it, its checklist days one by one, the dates two
of them share, its auto checks, verdicts, objections, late proofs, concerns,
tasks and the action-register rows about it; the units' cells and their link
history; Verifix's stored org, turnover directory and leavers for both people;
their attendance per month (the absence window); the Google-Form rows under
their names; open sync items naming them. Text in chunks plus the same text as
a .txt file. Delete this module, `startup.report_leader_merge` and both
entrypoint calls once it has landed.
"""
from __future__ import annotations

import json
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.config import settings
from app.services.name_map import _name_tokens

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3

UNIT_TOKENS = {"MAKSUMOV"}            # the brigadir, surname
ATT_FROM = date(2026, 6, 1)           # attendance window read per month

# Every column that names a profile: (table, column, kind) — kind «id» is
# role_profiles.id, «key» is "role:id", «tid» a Telegram id of its holders.
FOOTPRINT = [
    ("cells", "leader_id", "id"), ("cells", "owner_id", "id"),
    ("leader_task_days", "leader_id", "id"),
    ("leader_auto_checks", "leader_id", "id"),
    ("leader_task_captures", "leader_id", "id"),
    ("leader_task_photos", "leader_id", "id"),
    ("leader_ai_reviews", "leader_id", "id"),
    ("leader_day_reports", "leader_id", "id"),
    ("leader_ai_disputes", "leader_id", "id"),
    ("leader_ai_disputes", "requested_by_profile", "key"),
    ("leader_late_proofs", "leader_id", "id"),
    ("leader_late_proof_shots", "leader_id", "id"),
    ("leader_late_requests", "leader_profile_id", "id"),
    ("leader_late_requests", "requested_by_profile", "key"),
    ("leader_task_pending_changes", "leader_id", "id"),
    ("leader_task_config_audit", "leader_id", "id"),
    ("leader_task_leader_settings", "leader_id", "id"),
    ("leader_task_examples", "leader_id", "id"),
    ("leader_day_sources", "leader_profile_id", "id"),
    ("leader_day_exclusions", "leader_profile_id", "id"),
    ("leader_cutoffs", "leader_profile_id", "id"),
    ("leader_unit_moves", "leader_id", "id"),
    ("leader_concerns", "leader_profile_id", "id"),
    ("leader_concerns", "owner_profile_id", "id"),
    ("leader_concern_comments", "author_profile", "key"),
    ("leader_tasks", "leader_profile_id", "id"),
    ("leader_tasks", "created_by_profile", "key"),
    ("leader_task_comments", "author_profile", "key"),
    ("leader_appeal_messages", "author_profile", "key"),
    ("leader_appeal_reads", "profile_key", "key"),
    ("leader_appeal_members", "profile_key", "key"),
    ("comments", "author_profile", "key"),
    ("cell_ojidaniya", "entered_by_profile", "key"),
    ("cell_ojidaniya_intervals", "entered_by_profile", "key"),
    ("cell_ojidaniya_intervals", "decided_by_profile", "key"),
    ("cell_perenaladka", "entered_by_profile", "key"),
    ("notifications", "recipient_profile", "key"),
    ("telegram_user_roles", "profile_key", "key"),
    ("web_credentials", "profile_key", "key"),
    ("profile_photos", "profile_key", "key"),
    ("ui_prefs", "profile_key", "key"),
    ("user_activity", "profile_key", "key"),
    ("profile_capabilities", "profile_key", "key"),
    ("profile_permissions", "profile_key", "key"),
    ("capability_audit", "profile_key", "key"),
    ("action_logs", "actor_profile_key", "key"),
    ("education_lesson_targets", "profile_key", "key"),
    ("education_lesson_views", "profile_key", "key"),
    ("education_lesson_progress", "profile_key", "key"),
    ("idle_category_owners", "profile_key", "key"),
    ("exam_attempts", "profile_key", "key"),
    ("assessment_evaluations", "judge_key", "key"),
]


def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=ZoneInfo("UTC"))).astimezone(TZ).isoformat(timespec="minutes")
    return str(v)


def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


def _q(db: Session, q: str, params: dict | None = None, problems: list | None = None) -> list:
    """One read in a savepoint: a table this box lacks costs that line only."""
    try:
        with db.begin_nested():
            return [dict(r._mapping) for r in db.execute(sql(q), params or {})]
    except Exception as exc:  # noqa: BLE001
        if problems is not None:
            problems.append(f"{q[:70]}… → {type(exc).__name__}: {str(exc)[:120]}")
        return []


def _names_of(row: dict) -> list[str]:
    out = [row.get("name"), row.get("name_uz_cyrl"), row.get("name_ru"), row.get("name_en")]
    al = row.get("name_aliases")
    if isinstance(al, list):
        out += [a for a in al if isinstance(a, str)]
    return [n for n in out if n]


def _match(name: str) -> Optional[str]:
    toks = set(_name_tokens(name or ""))
    if "ELNORA" in toks:
        return "elnora"
    if "MALIKOV" in toks and "XASAN" in toks:
        return "xasan"
    if "MALIKOV" in toks:
        return "malikov?"
    return None


def _runs(days: list[date]) -> list[str]:
    """Consecutive dates folded into «a..b» ranges."""
    out, start, prev = [], None, None
    for d in sorted(set(days)):
        if start is None:
            start = prev = d
        elif d == prev + timedelta(days=1):
            prev = d
        else:
            out.append(f"{start}" if start == prev else f"{start}..{prev}")
            start = prev = d
    if start is not None:
        out.append(f"{start}" if start == prev else f"{start}..{prev}")
    return out


# ── collect ───────────────────────────────────────────────────────────────────

def collect(db: Session) -> dict:
    P: list[str] = []
    rep: dict = {"at": datetime.now(TZ).isoformat(timespec="seconds"), "problems": P}

    # A. the brigadir's unit(s)
    units = []
    for m in _q(db, "SELECT * FROM managers ORDER BY id", problems=P):
        names = [m.get("name")] + (m.get("name_aliases") or [] if isinstance(m.get("name_aliases"), list) else [])
        if any(UNIT_TOKENS & set(_name_tokens(n or "")) for n in names):
            units.append({k: m.get(k) for k in ("id", "name", "name_aliases", "shift", "factory_id",
                                                 "archived_at", "vfx_employee_id", "zagruzka_on")})
    unit_ids = [u["id"] for u in units]
    rep["units"] = units
    if not unit_ids:
        P.append("no unit named Maksumov found")

    # B. profiles
    profs = _q(db, "SELECT * FROM role_profiles ORDER BY id", problems=P)
    cand: dict[int, dict] = {}
    for p in profs:
        hit = next((h for n in _names_of(p) if (h := _match(n))), None)
        in_unit = p.get("role") == "leader" and p.get("manager_id") in unit_ids
        if hit or in_unit:
            p = dict(p)
            p["_hit"] = hit
            p["_key"] = f"{p['role']}:{p['id']}"
            cand[p["id"]] = p
    focus = [pid for pid, p in cand.items() if p["_hit"] in ("elnora", "xasan", "malikov?")]
    rep["focus_ids"] = focus

    unit_names = {m["id"]: m["name"] for m in _q(db, "SELECT id, name FROM managers", problems=P)}
    cells = _q(db, "SELECT id, verifix_code, sap_code, wc_group, manager_id, leader_id, owner_id, owner_meta, "
                   "vfx_division_id, in_load, one_process, archived_at FROM cells ORDER BY verifix_code", problems=P)
    cell_code = {c["id"]: c["verifix_code"] for c in cells}

    rep["profiles"] = []
    for pid, p in cand.items():
        key = p["_key"]
        info = {"id": pid, "match": p["_hit"], "role": p["role"], "name": p["name"],
                "names": {k: p.get(k) for k in ("name_uz_cyrl", "name_ru", "name_en", "name_aliases")},
                "unit": f"{p.get('manager_id')} «{unit_names.get(p.get('manager_id'))}»",
                "factory": p.get("factory_id"), "leader_kind": p.get("leader_kind"),
                "leader_kind_meta": p.get("leader_kind_meta"), "checklist_shift": p.get("checklist_shift"),
                "vfx_employee_id": p.get("vfx_employee_id"), "vfx_meta": p.get("vfx_meta"),
                "owes_from": p.get("owes_from"), "created_at": _iso(p.get("created_at"))}
        info["cells_now"] = [f"{c['verifix_code']}{('·' + c['wc_group']) if c.get('wc_group') else ''} "
                             f"({'leader' if c['leader_id'] == pid else ''}{'+' if c['leader_id'] == pid and c['owner_id'] == pid else ''}"
                             f"{'owner' if c['owner_id'] == pid else ''}, unit {c['manager_id']}"
                             f"{', ARCHIVED' if c['archived_at'] else ''})"
                             for c in cells if pid in (c["leader_id"], c["owner_id"])]
        if pid not in focus:
            rep["profiles"].append(info)
            continue

        holders = _q(db, "SELECT r.id, r.telegram_id, r.role, r.role_id, r.full_name, r.profile_key, r.status, "
                         "r.created_at, r.approved_at, u.full_name AS account, u.tg_name, u.username, u.language, "
                         "u.last_seen, u.dm_failed_at, u.active_role_ref FROM telegram_user_roles r "
                         "LEFT JOIN telegram_users u ON u.telegram_id = r.telegram_id "
                         "WHERE r.profile_key = :k OR (r.role = :role AND r.role_id = :id) ORDER BY r.id",
                     {"k": key, "role": p["role"], "id": pid}, P)
        for h in holders:
            h["other_roles"] = [f"{o['role']}:{o['role_id']}·{o['status']}·{o['profile_key']}"
                                for o in _q(db, "SELECT role, role_id, status, profile_key FROM telegram_user_roles "
                                                "WHERE telegram_id = :t AND id <> :i", {"t": h["telegram_id"], "i": h["id"]}, P)]
            for k in ("created_at", "approved_at", "last_seen", "dm_failed_at"):
                h[k] = _iso(h.get(k))
        info["holders"] = holders
        info["web_login"] = _q(db, "SELECT username, enabled, token_version, last_login_at, password_set_at, created_at "
                                   "FROM web_credentials WHERE profile_key = :k", {"k": key}, P)
        info["photo"] = _q(db, "SELECT mime, length(data) AS bytes, updated_at FROM profile_photos WHERE profile_key = :k",
                           {"k": key}, P)
        info["hand_ties"] = _q(db, "SELECT kind, vfx_id, how, by_name, created_at FROM verifix_ties WHERE our_id = :id "
                                   "AND kind <> 'unit'", {"id": pid}, P)

        fp = {}
        for table, col, kind in FOOTPRINT:
            v = pid if kind == "id" else key
            r = _q(db, f"SELECT count(*) AS n FROM {table} WHERE {col} = :v", {"v": v}, P)
            if r and r[0]["n"]:
                fp[f"{table}.{col}"] = r[0]["n"]
        info["footprint"] = fp

        days = _q(db, "SELECT id, date, cell_id, manager_id, closed_at, completion, finished_at, reopened "
                      "FROM leader_task_days WHERE leader_id = :id ORDER BY date, cell_id", {"id": pid}, P)
        info["days"] = [{"id": d["id"], "date": d["date"], "cell": cell_code.get(d["cell_id"]) if d["cell_id"] else None,
                         "unit": d["manager_id"], "closed": _iso(d["closed_at"]),
                         "completion": float(d["completion"]) if d["completion"] is not None else None,
                         "reopened": d.get("reopened")} for d in days]
        by_month = Counter((d["date"] or "")[:7] for d in days)
        info["days_by_month"] = dict(sorted(by_month.items()))
        info["days_open"] = [d["date"] for d in days if d["closed_at"] is None]
        info["day_units"] = dict(Counter(d["manager_id"] for d in days))
        info["day_runs"] = _runs([date.fromisoformat(d["date"]) for d in days if d.get("date")])

        info["entries"] = _q(db, "SELECT count(*) AS n, min(d.date) AS first, max(d.date) AS last FROM leader_task_entries e "
                                 "JOIN leader_task_days d ON d.id = e.day_id WHERE d.leader_id = :id", {"id": pid}, P)
        info["auto_checks"] = _q(db, "SELECT task_id, outcome, code, count(*) AS n FROM leader_auto_checks "
                                     "WHERE leader_id = :id GROUP BY 1,2,3 ORDER BY 1,2,3", {"id": pid}, P)
        info["ai_reviews"] = _q(db, "SELECT status, resolution, count(*) AS n, min(date) AS first, max(date) AS last "
                                    "FROM leader_ai_reviews WHERE leader_id = :id GROUP BY 1,2 ORDER BY 1,2", {"id": pid}, P)
        info["day_reports"] = _q(db, "SELECT count(*) AS n, min(date) AS first, max(date) AS last, sum(sends) AS sends, "
                                     "array_agg(DISTINCT leader_name) AS names FROM leader_day_reports WHERE leader_id = :id", {"id": pid}, P)
        info["disputes"] = _q(db, "SELECT id, status, ref, date, task_id, leader_name, requested_by_profile, requested_by_name, requested_at "
                                  "FROM leader_ai_disputes WHERE leader_id = :id ORDER BY id", {"id": pid}, P)
        info["late_proofs"] = _q(db, "SELECT id, status, day_id, date, task_id, leader_name, created_at FROM leader_late_proofs "
                                     "WHERE leader_id = :id ORDER BY id", {"id": pid}, P)
        info["overrides"] = _q(db, "SELECT o.uid, o.task_id, o.date, o.done, o.set_by, o.leader FROM leader_task_overrides o "
                                   "WHERE o.uid IN (SELECT 'bot-' || id FROM leader_task_days WHERE leader_id = :id) "
                                   "ORDER BY o.date", {"id": pid}, P)
        info["concerns"] = _q(db, "SELECT CASE WHEN worker_name IS NULL THEN 'leader' ELSE 'worker' END AS filed_by, "
                                  "level, status, count(*) AS n, min(entry_date) AS first, max(entry_date) AS last "
                                  "FROM leader_concerns WHERE leader_profile_id = :id GROUP BY 1,2,3 ORDER BY 1,2,3",
                              {"id": pid}, P)
        info["concerns_owned"] = _q(db, "SELECT level, status, count(*) AS n FROM leader_concerns "
                                        "WHERE owner_profile_id = :id GROUP BY 1,2", {"id": pid}, P)
        info["tasks"] = _q(db, "SELECT assignee_kind, status, count(*) AS n, min(due_date) AS first, max(due_date) AS last "
                               "FROM leader_tasks WHERE leader_profile_id = :id GROUP BY 1,2", {"id": pid}, P)
        info["settings"] = _q(db, "SELECT task_id, enabled, min_media, weight, win_from, win_to, deadline, "
                                  "(criteria IS NOT NULL) AS has_criteria, (description IS NOT NULL) AS has_desc "
                                  "FROM leader_task_leader_settings WHERE leader_id = :id ORDER BY task_id", {"id": pid}, P)
        info["cutoffs"] = _q(db, "SELECT leader_key, from_date, leader_name, manager_id, reason, set_by, set_at FROM leader_cutoffs "
                                 "WHERE leader_profile_id = :id", {"id": pid}, P)
        info["exclusions"] = _q(db, "SELECT date, cell_id, reason, set_by FROM leader_day_exclusions "
                                    "WHERE leader_profile_id = :id ORDER BY date", {"id": pid}, P)
        info["day_sources"] = _q(db, "SELECT date, source, set_by FROM leader_day_sources WHERE leader_profile_id = :id "
                                     "ORDER BY date", {"id": pid}, P)
        info["unit_moves"] = _q(db, "SELECT from_unit, to_unit, effective_from, src, cells, restamped, by, created_at "
                                    "FROM leader_unit_moves WHERE leader_id = :id ORDER BY id", {"id": pid}, P)
        info["links"] = [{"cell": cell_code.get(e["cell_id"]), "field": e["field"], "value": e["value"], "prev": e["prev"],
                          "from": _iso(e["effective_from"]), "applied": _iso(e["applied_at"]), "src": e["src"],
                          "by": e["by_name"], "made": _iso(e["created_at"])}
                         for e in _q(db, "SELECT * FROM cell_link_events WHERE field IN ('leader_id','owner_id') "
                                         "AND (value = :id OR prev = :id) ORDER BY effective_at, id", {"id": pid}, P)]
        info["activity"] = _q(db, "SELECT count(DISTINCT day) AS days, min(day) AS first, max(day) AS last "
                                  "FROM user_activity WHERE profile_key = :k", {"k": key}, P)
        info["log"] = [{"at": _iso(r["created_at"]), "action": r["action"], "outcome": r["outcome"], "source": r["source"],
                        "actor": r["actor_name"], "target": r["target_name"], "unit": r["unit_name"], "day": r["day"],
                        "details": r["details"], "changes": r["changes"]}
                       for r in _q(db, "SELECT * FROM action_logs WHERE (target_kind IN ('profile','leader') AND target_id = :sid) "
                                       "OR target_id = :key ORDER BY created_at DESC LIMIT 60",
                                   {"sid": str(pid), "key": key}, P)]
        rep["profiles"].append(info)

    # D. dates two focus profiles both hold (the unique key is leader, date, cell)
    owners_by_day: dict = defaultdict(set)
    for info in rep["profiles"]:
        for d in info.get("days", []):
            owners_by_day[(d["date"], d["cell"])].add(info["id"])
    rep["shared_days"] = sorted(f"{k[0]} {k[1] or '—'}: {sorted(v)}" for k, v in owners_by_day.items() if len(v) > 1)
    by_date: dict = defaultdict(set)
    for info in rep["profiles"]:
        for d in info.get("days", []):
            by_date[d["date"]].add(info["id"])
    rep["shared_dates_any_cell"] = sorted(f"{k}: {sorted(v)}" for k, v in by_date.items() if len(v) > 1)

    # E. the units' cells and their link history
    unit_cells = [c for c in cells if c["manager_id"] in unit_ids
                  or c["leader_id"] in focus or c["owner_id"] in focus]
    pname = {p["id"]: p["name"] for p in profs}
    rep["cells"] = [{"code": c["verifix_code"], "group": c["wc_group"], "sap": c["sap_code"], "unit": c["manager_id"],
                     "leader": f"{c['leader_id']} {pname.get(c['leader_id'], '')}".strip(),
                     "owner": f"{c['owner_id']} {pname.get(c['owner_id'], '')}".strip(),
                     "owner_meta": c["owner_meta"], "in_load": c["in_load"], "one_process": c.get("one_process"),
                     "archived": _iso(c["archived_at"])} for c in unit_cells]
    ids = [c["id"] for c in unit_cells]
    rep["cell_links"] = [{"cell": cell_code.get(e["cell_id"]), "field": e["field"],
                          "value": f"{e['value']} {pname.get(e['value'], unit_names.get(e['value'], '')) if e['field'] != 'manager_id' else unit_names.get(e['value'], '')}",
                          "prev": e["prev"], "from": _iso(e["effective_from"]), "applied": _iso(e["applied_at"]),
                          "src": e["src"], "by": e["by_name"], "made": _iso(e["created_at"])}
                         for e in (_q(db, "SELECT * FROM cell_link_events WHERE cell_id = ANY(:ids) ORDER BY cell_id, effective_at, id",
                                      {"ids": ids}, P) if ids else [])]

    # F. Verifix: the stored org, the turnover directory, the leavers
    vfx_ids = {cand[pid].get("vfx_employee_id") for pid in focus if cand[pid].get("vfx_employee_id")}
    unit_codes = {c["verifix_code"] for c in unit_cells}
    try:
        from app.services import verifix_org
        org, org_at = verifix_org.stored(db)
        rep["org_read"] = _iso(org_at)
        if org:
            divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
            cn = verifix_org.cell_nodes(divs, emps, jobs)
            rows = verifix_org.people(divs, emps, jobs, cn)
            hits = []
            for r in rows:
                h = _match(r["name"])
                cell_raw = str(r.get("cell_raw") or "")
                if (r["id"] in vfx_ids or h == "xasan" or (h == "elnora" and (cell_raw in unit_codes or str(r.get("cell") or "") in unit_codes))
                        or (h == "malikov?" and cell_raw in unit_codes)):
                    hits.append({k: r.get(k) for k in ("id", "name", "status", "job", "unit_name", "cell_raw",
                                                       "where", "hired", "dismissed")} | {"match": h})
            rep["vfx_people"] = hits
            leaders_here = [{k: r.get(k) for k in ("id", "name", "status", "job", "cell_raw", "hired")}
                            for r in rows if str(r.get("cell_raw") or "") in unit_codes
                            and verifix_org.is_leader_job(r.get("job") or "")]
            rep["vfx_leader_jobs_in_cells"] = leaders_here
            vfx_ids |= {h["id"] for h in hits}
        else:
            P.append("no stored Verifix org read")
    except Exception as exc:  # noqa: BLE001
        P.append(f"Verifix org: {type(exc).__name__}: {str(exc)[:150]}")

    tp = _q(db, "SELECT employee_id, staff_id, name, status, hired, dismissed, unit_name, code, job FROM turnover_people", problems=P)
    rep["turnover_people"] = [r for r in tp if r["employee_id"] in vfx_ids
                              or _match(r["name"]) == "xasan"
                              or (_match(r["name"]) in ("elnora", "malikov?") and (r.get("code") or "") in unit_codes)]
    tl = _q(db, "SELECT employee_id, name, hired, dismissed, unit_name, code, reason FROM turnover_leavers", problems=P)
    rep["turnover_leavers"] = [r for r in tl if r["employee_id"] in vfx_ids or _match(r["name"]) == "xasan"]

    # G. attendance — the closed-day copy — per month for both names
    names = _q(db, "SELECT DISTINCT worker_name FROM attendance WHERE date >= :d", {"d": ATT_FROM}, P)
    hit_names = [n["worker_name"] for n in names if n["worker_name"] and _match(n["worker_name"])]
    att = {}
    for nm in hit_names:
        rows = _q(db, "SELECT date, manager_id, verifix_code, clock_in_out, hours_worked, job_title "
                      "FROM attendance WHERE worker_name = :n AND date >= :d AND split_of IS NULL ORDER BY date",
                  {"n": nm, "d": ATT_FROM}, P)
        if not any(r["manager_id"] in unit_ids or (r.get("verifix_code") or "") in unit_codes for r in rows) \
                and _match(nm) != "xasan":
            continue
        came = [r["date"] for r in rows if (r["hours_worked"] or 0) > 0]
        months = defaultdict(lambda: [0, 0])
        for r in rows:
            m = str(r["date"])[:7]
            months[m][0] += 1
            if (r["hours_worked"] or 0) > 0:
                months[m][1] += 1
        gaps = []
        cs = sorted(set(came))
        for a, b in zip(cs, cs[1:]):
            if (b - a).days > 4:
                gaps.append(f"{a}→{b} ({(b - a).days - 1} days)")
        att[nm] = {"rows": len(rows), "first": str(rows[0]["date"]) if rows else None,
                   "last": str(rows[-1]["date"]) if rows else None,
                   "months (rows, came)": {k: v for k, v in sorted(months.items())},
                   "gaps_over_4_days_between_came": gaps,
                   "units": dict(Counter(r["manager_id"] for r in rows)),
                   "cells": dict(Counter(r["verifix_code"] for r in rows)),
                   "jobs": dict(Counter(r["job_title"] for r in rows)),
                   "marks_when_not_came": dict(Counter((r["clock_in_out"] or "")[:6] for r in rows
                                                       if not (r["hours_worked"] or 0) > 0))}
    rep["attendance"] = att

    # H. the Google-Form layer under their names
    sheet = _q(db, "SELECT DISTINCT leader, supervisor FROM leader_checklists", problems=P)
    sh = {}
    for r in sheet:
        if _match(r["leader"] or ""):
            rows = _q(db, "SELECT substr(date,1,7) AS m, count(*) AS n FROM leader_checklists WHERE leader = :l "
                          "AND supervisor = :s GROUP BY 1 ORDER BY 1", {"l": r["leader"], "s": r["supervisor"]}, P)
            sh[f"{r['leader']} · {r['supervisor']}"] = {x["m"]: x["n"] for x in rows}
    rep["sheet_rows"] = sh

    # I. open Verifix sync items naming them
    words = [str(pid) for pid in focus] + [cand[pid]["name"] for pid in focus] + list(vfx_ids)
    items = _q(db, "SELECT id, kind, key, payload, first_seen, last_seen FROM verifix_sync_items WHERE status = 'open'",
               problems=P)
    rep["sync_items"] = [{"id": i["id"], "kind": i["kind"], "key": i["key"], "payload": i["payload"],
                          "first": _iso(i["first_seen"])}
                         for i in items if any(w and w in _j(i["payload"]) + i["key"] for w in words if len(str(w)) > 3)
                         or any(f'"{pid}"' in _j(i["payload"]) or f": {pid}," in _j(i["payload"]) for pid in focus)]
    rep["sync_mode"] = (_q(db, "SELECT value FROM app_settings WHERE key = 'verifix_sync_mode'", problems=P) or [{}])[0].get("value")
    return rep


# ── text ──────────────────────────────────────────────────────────────────────

def text(rep: dict) -> str:
    L: list[str] = []
    L.append(f"LEADER MERGE — ELNORA × XASAN MALIKOV · STATE REPORT · {rep['at']}")
    L.append(f"Verifix sync mode: {rep.get('sync_mode')} · org read {rep.get('org_read')}")
    L.append(f"units: {_j(rep['units'])}")
    L.append(f"focus profile ids: {rep['focus_ids']}")
    L.append("")
    for p in rep["profiles"]:
        star = "★" if p["id"] in rep["focus_ids"] else " "
        L.append(f"{star}=== PROFILE #{p['id']} «{p['name']}» · {p['role']} · match {p['match']} · unit {p['unit']} ===")
        L.append(f"  created {p['created_at']} · owes_from {p['owes_from']} · kind {p['leader_kind']} "
                 f"· checklist_shift {_j(p['checklist_shift'])} · factory {p['factory']}")
        L.append(f"  vfx {p['vfx_employee_id']} · vfx_meta {_j(p['vfx_meta'])} · kind_meta {_j(p['leader_kind_meta'])}")
        L.append(f"  names {_j(p['names'])}")
        L.append(f"  cells now: {', '.join(p['cells_now']) or '—'}")
        if p["id"] not in rep["focus_ids"]:
            L.append("")
            continue
        L.append(f"  holders ({len(p['holders'])}):")
        for h in p["holders"]:
            L.append(f"    · row {h['id']} tid {h['telegram_id']} {h['role']}:{h['role_id']} {h['status']} key {h['profile_key']} "
                     f"«{h['full_name']}» · account «{h['account']}» (tg «{h['tg_name']}», @{h['username']}, {h['language']}) "
                     f"· approved {h['approved_at']} · last_seen {h['last_seen']} · dm_failed {h['dm_failed_at']} "
                     f"· active_ref {h['active_role_ref']} · other roles: {', '.join(h['other_roles']) or '—'}")
        L.append(f"  web login {_j(p['web_login'])} · photo {_j(p['photo'])} · hand ties {_j(p['hand_ties'])}")
        L.append(f"  FOOTPRINT: {_j(p['footprint'])}")
        L.append(f"  days by month {_j(p['days_by_month'])} · units {_j(p['day_units'])} · open {_j(p['days_open'])}")
        L.append(f"  day runs: {', '.join(p['day_runs'])}")
        L.append(f"  entries {_j(p['entries'])}")
        L.append(f"  auto checks {_j(p['auto_checks'])}")
        L.append(f"  ai reviews {_j(p['ai_reviews'])}")
        L.append(f"  day reports {_j(p['day_reports'])}")
        L.append(f"  disputes {_j(p['disputes'])}")
        L.append(f"  late proofs {_j(p['late_proofs'])}")
        L.append(f"  overrides {_j(p['overrides'])}")
        L.append(f"  concerns (as leader) {_j(p['concerns'])}")
        L.append(f"  concerns (as owner) {_j(p['concerns_owned'])}")
        L.append(f"  tasks {_j(p['tasks'])}")
        L.append(f"  per-leader settings {_j(p['settings'])}")
        L.append(f"  cutoffs {_j(p['cutoffs'])}")
        L.append(f"  exclusions {_j(p['exclusions'])}")
        L.append(f"  day sources {_j(p['day_sources'])}")
        L.append(f"  unit moves {_j(p['unit_moves'])}")
        L.append(f"  activity {_j(p['activity'])}")
        L.append("  cell links naming it:")
        for e in p["links"]:
            L.append(f"    · {_j(e)}")
        L.append("  days (id · date · cell · unit · closed · completion):")
        for d in p["days"]:
            L.append(f"    {d['id']} · {d['date']} · {d['cell'] or '—'} · u{d['unit']} · {d['closed'] or 'OPEN'} · "
                     f"{d['completion']}" + (f" · reopened {_j(d['reopened'])}" if d.get("reopened") else ""))
        L.append("  action register about it (newest first):")
        for r in p["log"]:
            L.append(f"    · {_j(r)}")
        L.append("")
    L.append("=== SAME DATE + CELL HELD BY TWO PROFILES ===")
    L += [f"  {s}" for s in rep["shared_days"]] or ["  none"]
    L.append("=== SAME DATE (any cell) ===")
    L += [f"  {s}" for s in rep["shared_dates_any_cell"]] or ["  none"]
    L.append("")
    L.append("=== CELLS (the units' + any the focus profiles touch) ===")
    for c in rep["cells"]:
        L.append(f"  · {_j(c)}")
    L.append("=== CELL LINK HISTORY ===")
    for e in rep["cell_links"]:
        L.append(f"  · {_j(e)}")
    L.append("")
    L.append("=== VERIFIX (stored org) ===")
    for r in rep.get("vfx_people", []):
        L.append(f"  · {_j(r)}")
    L.append("  leader-job people in these cells:")
    for r in rep.get("vfx_leader_jobs_in_cells", []):
        L.append(f"    · {_j(r)}")
    L.append("=== TURNOVER DIRECTORY ===")
    for r in rep["turnover_people"]:
        L.append(f"  · {_j(r)}")
    L.append("=== TURNOVER LEAVERS ===")
    for r in rep["turnover_leavers"]:
        L.append(f"  · {_j(r)}")
    L.append("")
    L.append("=== ATTENDANCE (closed-day copy, from %s) ===" % ATT_FROM)
    for nm, a in rep["attendance"].items():
        L.append(f"  --- {nm} ---")
        for k, v in a.items():
            L.append(f"    {k}: {_j(v)}")
    L.append("=== GOOGLE-FORM ROWS (leader · supervisor → month: rows) ===")
    for k, v in rep["sheet_rows"].items():
        L.append(f"  · {k}: {_j(v)}")
    L.append("=== OPEN VERIFIX SYNC ITEMS NAMING THEM ===")
    for i in rep["sync_items"]:
        L.append(f"  · {_j(i)}")
    if not rep["sync_items"]:
        L.append("  none")
    if rep["problems"]:
        L.append("")
        L.append("PROBLEMS: " + " | ".join(rep["problems"]))
    return "\n".join(L)


# ── send ──────────────────────────────────────────────────────────────────────

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
    """The whole report as a .txt document, plus its head in chunks so it can
    be read on the phone. Returns the messages sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    body = text(rep)
    db.rollback()
    print("[startup] leader merge report:\n" + body[:20000])
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": "Elnora × Xasan Malikov — production's record before the merge. "
                      "Forward this file to the Claude session planning the merge."},
          files={"document": (f"leader-merge-elnora-xasan-{stamp}.txt", body.encode("utf-8"), "text/plain")})
    head = body if len(body) < 12000 else body[:12000] + "\n… (the whole report is in the file above)"
    chunks, cur = [], ""
    for line in head.split("\n"):
        while len(line) > 3900:
            chunks.append(cur) if cur else None
            cur = ""
            chunks.append(line[:3900])
            line = line[3900:]
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    if cur:
        chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks) + 1
