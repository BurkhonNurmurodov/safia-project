"""⚠ TEMPORARY (2026-10-17): what Verifix holds behind HR's «Соответствие
категории» KPI, printed into the deploy job's log — the one window onto
production a cloud session can read.

HR says a cell's category-compliance percentage comes from Verifix. The
platform has never read Verifix's ranks («разряд» / category): `verifix_org`
keeps an employee's job, division and org unit and nothing else. So this
prints what the API carries — the rank dictionary (`pro/rank$list`), the
positions (`pro/robot$list`: one per placement, with the job, the category
and the org unit — the first run, 2026-10-17, found 18,504 of them and the
Pro employee list closed to the API role), every employee of the Core list
with their job, status and position per cell, and the rank-change journal
(`pro/rank_change$list`) — so the KPI's definition can be worked out against
HR's July figures and then built like the other three KPI pages.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_category_compliance.py`. READ-ONLY: reads Verifix
with the stored credential, writes nothing, commits nothing. NO PERSON leaves
it: every employee / staff id is a pseudonym («E1», «S1» …) stable within one
run; names, PINFL, phones, birth dates, addresses, photos and every wage field
are dropped (`verifix_explore.scrub` plus a denylist of its own); every date is
printed as a month. Job titles, rank names, employment types and cell codes
are vocabulary and are printed. Lives under deploy/ so adding it restarts
nothing. Delete it with its workflow step.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.models import Cell  # noqa: E402
from app.services import verifix, verifix_org  # noqa: E402
from app.services import verifix_explore as vx  # noqa: E402
from app.services.verifix_live import _side_by_side  # noqa: E402
from app.version import APP_VERSION, current_commit  # noqa: E402

TZ = ZoneInfo("Asia/Tashkent")
BUDGET_S = 200.0
PRINT_MAX = {"emp": 9000, "rank_change": 40000, "robot": 20, "robot_rows": 12000}
DISMISSED_FROM = "2026-05"          # dismissed people kept, so July can be rebuilt

# Pseudonyms, one counter per id kind, stable within the run.
_pseud: dict[str, dict[str, str]] = defaultdict(dict)
ID_KINDS = {"employee_id": "E", "staff_id": "S", "person_id": "P", "user_id": "U",
            "employee": "E", "staff": "S"}
# `*_name` keys that are vocabulary, never a person.
VOCAB_NAMES = {
    "job_name", "rank_name", "fte_name", "division_name", "org_unit_name", "position_name",
    "schedule_name", "status_name", "employment_type_name", "robot_name", "employment_source_name",
    "legal_person_name", "location_name", "calendar_name", "labor_function_name", "job_group_name",
    "category_name", "grade_name", "level_name", "rank_group_name", "parent_name", "unit_name",
    "fixed_term_base_name", "contract_type_name", "reason_name", "base_name", "source_name",
}
DROP = ("npin", "pinfl", "passport", "phone", "mobile", "email", "birth", "address", "gender",
        "sex", "photo", "card", "account", "tin", "iapa", "nationality", "marital", "family",
        "citizen", "resident", "note", "comment", "login", "password", "telegram", "region",
        "district", "street", "fio", "surname", "patronym", "base")


def pseud(kind: str, v) -> str | None:
    s = str(v or "").strip()
    if not s:
        return None
    book = _pseud[kind]
    if s not in book:
        book[s] = f"{kind}{len(book) + 1}"
    return book[s]


def rec(_kind: str, **obj) -> None:
    print("CATREC " + _kind + " " + json.dumps(obj, default=str, sort_keys=True, ensure_ascii=False))


def month(v) -> str | None:
    s = str(v or "").strip()
    m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}"
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return None


def private_key(k: str, person: bool) -> bool:
    kl = str(k).lower()
    if kl in ID_KINDS:
        return False                      # pseudonymised instead
    if kl == "pin" or any(s in kl for s in DROP):
        return True
    if "name" in kl:
        if kl in VOCAB_NAMES:
            return False
        return person or kl != "name"     # a vocabulary list keeps its own `name`
    return False


def clean(row: dict, person: bool) -> dict:
    """Scalar fields only, private ones dropped, ids pseudonymised, dates as months."""
    out: dict = {}
    for k, v in vx.scrub(row).items():
        if isinstance(v, (dict, list)):
            continue
        kl = str(k).lower()
        if kl in ID_KINDS:
            out[k] = pseud(ID_KINDS[kl], v)
            continue
        if private_key(k, person):
            continue
        if "date" in kl or kl.endswith(("_at", "_on")):
            out[k] = month(v)
            continue
        out[k] = v
    return out


def _datey(k: str) -> bool:
    kl = str(k).lower()
    return "date" in kl or kl.endswith(("_at", "_on"))


def fields(rows: list) -> list[str]:
    return vx._fields([r for r in rows if isinstance(r, dict)])


def fieldstats(method: str, rows: list, person: bool) -> None:
    stats: dict[str, dict] = {}
    for r in rows[:600]:
        if not isinstance(r, dict):
            continue
        for k, v in r.items():
            st = stats.setdefault(k, {"t": Counter(), "vals": Counter(), "n": 0, "none": 0})
            st["n"] += 1
            st["t"][type(v).__name__] += 1
            if v in (None, ""):
                st["none"] += 1
            if isinstance(v, (dict, list)):
                continue
            sv = (month(v) or "?") if (_datey(k) and v not in (None, "")) else str(v)[:60]
            if len(st["vals"]) < 200 or sv in st["vals"]:
                st["vals"][sv] += 1
    for k, st in stats.items():
        out = {"method": method, "key": k, "n": st["n"], "blank": st["none"],
               "types": dict(st["t"]), "distinct": len(st["vals"])}
        kl = str(k).lower()
        if kl in ID_KINDS or private_key(k, person) or kl in vx._WAGE or kl.startswith(("passport_", "payroll_")):
            out["private"] = True
        elif len(st["vals"]) <= 40:
            out["values"] = st["vals"].most_common(40)
        rec("fieldstat", **out)


def flat(rows: list) -> list[dict]:
    """A journal as one row per line (the journal's scalars beside each line's)."""
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        kids = next((v for k, v in r.items() if isinstance(v, list) and v and isinstance(v[0], dict)), None)
        top = {k: v for k, v in r.items() if not isinstance(v, (list, dict))}
        if kids:
            for x in kids:
                out.append({**top, **{k: v for k, v in x.items() if not isinstance(v, (list, dict))}})
        else:
            out.append(top)
    return out


def _pages(cl, path: str, body: dict, limit, deadline: float):
    """`verifix.each_page` without its 60-page cap — the deadline is the bound."""
    cursor = None
    for _ in range(2000):
        if time.monotonic() > deadline:
            raise verifix.VerifixError("slow", "stopped at the time limit")
        data, nxt = verifix.call(cl, path, body, limit=limit, cursor=cursor)
        yield data
        if not nxt or nxt == cursor:
            return
        cursor = nxt
    raise verifix.VerifixError("slow", "stopped at the page limit")


def rows_of(cl, path: str, body: dict, limit, deadline: float) -> dict:
    """Every page of one method, with the failure it hit (if any) instead of raising."""
    out: dict = {"path": path, "rows": [], "pages": 0, "error": None, "partial": False}
    t0 = time.monotonic()
    try:
        for page in _pages(cl, path, body, limit, deadline):
            out["pages"] += 1
            out["rows"].extend(page or [])
    except verifix.VerifixError as exc:
        out["error"] = {"code": exc.code, "status": exc.status, "message": (exc.message or "")[:200]}
        out["partial"] = exc.code == "slow"
    except Exception as exc:  # noqa: BLE001 — one method's failure must not sink the rest
        out["error"] = {"code": "error", "message": f"{type(exc).__name__}: {exc}"[:200]}
    out["ms"] = int((time.monotonic() - t0) * 1000)
    return out


def code_of(node: dict | None) -> str | None:
    """A division's cell code: its `code`, else the four digits its NAME starts with."""
    if not node:
        return None
    raw = str(node.get("code") or "").strip()
    if raw:
        return verifix._code_key(raw)
    m = re.match(r"^\s*(\d{4})\b", str(node.get("name") or ""))
    return verifix._code_key(m.group(1)) if m else None


def main() -> None:
    started = time.monotonic()
    deadline = started + BUDGET_S
    db = SessionLocal()
    try:
        rec("meta", version=APP_VERSION, commit=(current_commit() or "")[:10],
            at=datetime.now(TZ).isoformat(timespec="seconds"), budget_s=BUDGET_S)
        cfg = verifix.config(db, with_password=True)
        if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
            rec("error", what="not_configured")
            return
        cells: dict[str, dict] = {}
        for c in db.query(Cell).all():
            if c.verifix_code:
                cells[verifix._code_key(c.verifix_code)] = {
                    "code": c.verifix_code, "unit": c.manager_id, "archived": bool(c.archived_at),
                    "in_load": bool(getattr(c, "in_load", False)), "owner": bool(getattr(c, "owner_id", None)),
                    "leader": bool(getattr(c, "leader_id", None))}
        org, org_at = verifix_org.stored(db)
        rec("cells", n=len(cells), active=sum(1 for v in cells.values() if not v["archived"]),
            org_stored_at=str(org_at) if org_at else None,
            org_emps=len((org or {}).get("emps") or {}))

        def read_a(cl):
            o: dict = {}
            o["divs"] = rows_of(cl, "core/division$list", {"division_ids": []}, verifix.LIMIT_LIST, deadline)
            o["jobs"] = rows_of(cl, "core/job$list", {"job_ids": []}, verifix.LIMIT_LIST, deadline)
            o["fte"] = rows_of(cl, "core/fte$list", {"fte_ids": []}, verifix.LIMIT_LIST, deadline)
            o["ranks"] = rows_of(cl, "pro/rank$list", {"rank_ids": []}, None, deadline)
            o["robots"] = rows_of(cl, "pro/robot$list", {"robot_ids": []}, None, deadline)
            return o

        def read_b(cl):
            return rows_of(cl, "core/employee$list",
                           {"employee_ids": [], "statuses": [], "npins": []}, verifix.LIMIT_LIST, deadline)

        def read_c(cl):
            return rows_of(cl, "pro/rank_change$list", {"journal_ids": []}, verifix.LIMIT_LIST, deadline)

        a, b, c = _side_by_side(cfg, read_a, read_b, read_c)

        # ── what each method answered ──────────────────────────────────────────
        methods = [a["divs"], a["jobs"], a["fte"], a["ranks"], a["robots"], b, c]
        for m in methods:
            rec("method", path=m["path"], rows=len(m["rows"]), pages=m["pages"], ms=m.get("ms"),
                error=m["error"], partial=m["partial"], fields=fields(m["rows"]))

        # ── vocabulary: divisions → codes, jobs, employment types, ranks ──────
        divs: dict[str, dict] = {}
        for d in a["divs"]["rows"]:
            did = str(d.get("division_id") or "").strip()
            if did:
                divs[did] = d
        dcode = {did: code_of(d) for did, d in divs.items()}
        coded = {k: v for k, v in dcode.items() if v}
        rec("divisions", total=len(divs), coded=len(coded),
            ours_found=len(set(coded.values()) & set(cells)),
            ours_missing=sorted(set(cells) - set(coded.values()))[:40])
        for j in a["jobs"]["rows"]:
            rec("job", **clean(j, person=False))
        for f in a["fte"]["rows"]:
            rec("fte", **clean(f, person=False))
        for r in a["ranks"]["rows"]:
            rec("rank", **clean(r, person=False))
        fieldstats("pro/rank$list", a["ranks"]["rows"], person=False)

        # ── positions ─────────────────────────────────────────────────────────
        robots = a["robots"]["rows"]
        fieldstats("pro/robot$list", robots, person=False)
        robot_ids: set = set()
        by_pair: Counter = Counter()
        by_cell: Counter = Counter()
        printed_r = kept_r = 0
        for i, r in enumerate(robots):
            rid = str(r.get("robot_id") or "").strip()
            robot_ids.add(rid)
            cr = clean(r, person=False)
            if i >= PRINT_MAX["robot"]:
                cr.pop("name", None)          # «<job>, <rank>/<org unit path>/(<id>)» — shown on the sample
            cr["sid"] = pseud("S", rid)       # the same book a staff id uses: equal ids, equal pseudonyms
            cr.pop("robot_id", None)
            unit = str(r.get("org_unit_id") or "").strip()
            div = str(r.get("division_id") or "").strip()
            cr.update(ucode=dcode.get(unit), dcode=dcode.get(div),
                      cell=dcode.get(unit) if dcode.get(unit) in cells else None)
            job = cr.get("job_id")
            rank = cr.get("rank_id")
            by_pair[f"{job} | {rank}"] += 1
            if cr["cell"]:
                by_cell[cr["cell"]] += 1
            open_ = not cr.get("closed_date")
            if open_ or (cr.get("closed_date") or "") >= DISMISSED_FROM:
                kept_r += 1
                if printed_r < PRINT_MAX["robot_rows"]:
                    rec("robot", **cr)
                    printed_r += 1
        rec("robot_summary", n=len(robots), kept=kept_r, printed=printed_r,
            by_job_rank=by_pair.most_common(120), by_cell=by_cell.most_common(220))

        # ── people (pseudonymised) ────────────────────────────────────────────
        emps = b["rows"]
        fieldstats("core/employee$list", emps, person=True)
        robot_by_id = {str(r.get("robot_id") or "").strip(): r for r in robots}
        status_count: Counter = Counter()
        printed = staff_in_robots = working = 0
        cell_rows: dict[str, list[dict]] = defaultdict(list)
        for e in emps:
            cr = clean(e, person=True)
            unit = str(e.get("org_unit_id") or "").strip()
            div = str(e.get("division_id") or "").strip()
            ucode, vcode = dcode.get(unit), dcode.get(div)
            cell = ucode if ucode in cells else (vcode if vcode in cells else None)
            sid = str(e.get("staff_id") or "").strip()
            rb = robot_by_id.get(sid)
            cr.update(cell=cell, ucode=ucode, dcode=vcode,
                      # the position the staff id names, when it is one: its job, rank and org unit
                      r_job=(str(rb.get("job_id") or "") or None) if rb else None,
                      r_rank=(str(rb.get("rank_id") or "") or None) if rb else None,
                      r_ucode=dcode.get(str(rb.get("org_unit_id") or "")) if rb else None,
                      r_closed=month(rb.get("closed_date")) if rb else None)
            status = str(cr.get("status") or "")
            status_count[status] += 1
            if status == "W":
                working += 1
                staff_in_robots += bool(rb)
            dism = cr.get("dismissal_date")
            keep = status == "W" or (dism and dism >= DISMISSED_FROM) or status not in ("W", "D")
            if keep and printed < PRINT_MAX["emp"]:
                rec("emp", **cr)
                printed += 1
            if status == "W" and cell:
                cell_rows[cell].append(cr)
        rec("emp_summary", total=len(emps), printed=printed, status=dict(status_count),
            working=working, working_staff_in_robots=staff_in_robots,
            placed_working=sum(len(v) for v in cell_rows.values()))
        for code in sorted(cells):
            rows = cell_rows.get(code, [])
            ranks: Counter = Counter()
            jobs: Counter = Counter()
            pairs: Counter = Counter()
            n_rank = 0
            for r in rows:
                rank = r.get("r_rank")
                job = r.get("job_id")
                ranks[str(rank)] += 1
                jobs[str(job)] += 1
                pairs[f"{job} | {rank}"] += 1
                n_rank += bool(rank)
            info = {k: v for k, v in cells[code].items() if k != "code"}
            rec("cell", code=code, **info, n_working=len(rows), n_rank=n_rank,
                ranks=ranks.most_common(12), jobs=jobs.most_common(12), job_rank=pairs.most_common(20))

        # ── the rank-change journal ───────────────────────────────────────────
        lines = flat(c["rows"])
        fieldstats("pro/rank_change$list", c["rows"], person=True)
        fieldstats("pro/rank_change$list:lines", lines, person=True)
        by_month: Counter = Counter()
        for i, ln in enumerate(lines):
            cr = clean(ln, person=True)
            m = next((v for k, v in cr.items() if "date" in k.lower() and v), None)
            by_month[m or "?"] += 1
            if i < PRINT_MAX["rank_change"]:
                rec("rank_change", **cr)
        rec("rank_change_summary", journals=len(c["rows"]), lines=len(lines),
            by_month=sorted(by_month.items()))
        rec("done", s=round(time.monotonic() - started, 1),
            pseudonyms={k: len(v) for k, v in _pseud.items()})
    except Exception:  # noqa: BLE001 — never fail the deploy
        rec("error", what="exception", trace=traceback.format_exc()[-1500:])
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
