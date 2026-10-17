"""⚠ TEMPORARY (2026-10-17): what Verifix holds behind HR's «Соответствие
категории» KPI, printed into the deploy job's log — the one window onto
production a cloud session can read.

HR says a cell's category-compliance percentage comes from Verifix. The
platform has never read Verifix's categories («разряд» / «категория»):
`verifix_org` keeps an employee's job, division and org unit and nothing
else. So this prints what the API carries — the rank dictionary
(`pro/rank$list`), the positions (`pro/robot$list`: one per placement, with
the job, the category and the org unit; 18,504 on 2026-10-17), every employee
of the Core list (the Pro list is closed to the API role), and the three
journals that carry a person's category and cell through time — hirings
(`pro/hiring$list`, the category a person starts on), transfers
(`pro/transfer$list`, the cell they moved to) and rank changes
(`pro/rank_change$list`) — so the KPI's definition can be worked out against
HR's July figures and then built like the other three KPI pages.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_category_compliance.py`. READ-ONLY: reads Verifix
with the stored credential, writes nothing, commits nothing. NO PERSON leaves
it: every employee / staff / position id is a pseudonym («E1», «T1», «S1» …)
stable within one run (a position and the «page» a journal line names share
one book, so the link shows without an id); names, PINFL, phones, birth dates,
addresses, photos, free-text notes and reasons and every wage field are
dropped (`verifix_explore.scrub` plus a denylist of its own); every date is
printed as a month. Job titles, category names, employment types and cell
codes are vocabulary and are printed. Lives under deploy/ so adding it
restarts nothing. Delete it with its workflow step.
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
from app.services import verifix  # noqa: E402
from app.services import verifix_explore as vx  # noqa: E402
from app.services.verifix_live import _side_by_side  # noqa: E402
from app.version import APP_VERSION, current_commit  # noqa: E402

TZ = ZoneInfo("Asia/Tashkent")
BUDGET_S = 200.0
PRINT_MAX = {"emp": 9000, "rank_change": 40000, "robot": 20, "robot_rows": 12000,
             "hire": 20000, "transfer": 20000}
DISMISSED_FROM = "2026-05"          # dismissed people and closed positions kept from here, so July can be rebuilt
JOURNALS_FROM = "01.01.2024"

# Pseudonyms, one counter per id kind, stable within the run. A position id and
# the «page» id a journal line carries share the S book: if they are one id
# space, the pseudonyms coincide and the link is visible without the id.
_pseud: dict[str, dict[str, str]] = defaultdict(dict)
ID_KINDS = {"employee_id": "E", "staff_id": "T", "page_id": "S", "robot_id": "S",
            "person_id": "P", "user_id": "U"}
# `*_name` keys that are vocabulary, never a person.
VOCAB_NAMES = {
    "job_name", "rank_name", "fte_name", "division_name", "org_unit_name", "position_name",
    "schedule_name", "status_name", "employment_type_name", "robot_name", "employment_source_name",
    "legal_person_name", "location_name", "calendar_name", "labor_function_name", "job_group_name",
    "category_name", "grade_name", "level_name", "rank_group_name", "parent_name", "unit_name",
    "fixed_term_base_name", "contract_type_name", "reason_name", "base_name", "source_name",
    "dismissal_reason_name", "dismissal_source_name", "transfer_reason_name",
}
DROP = ("npin", "pinfl", "passport", "phone", "mobile", "email", "birth", "address", "gender",
        "sex", "photo", "card", "account", "tin", "iapa", "nationality", "marital", "family",
        "citizen", "resident", "note", "comment", "login", "password", "telegram", "region",
        "district", "street", "fio", "surname", "patronym", "base", "reason")


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


def _datey(k: str) -> bool:
    kl = str(k).lower()
    return "date" in kl or kl.endswith(("_at", "_on", "_begin", "_end"))


def private_key(k: str, person: bool) -> bool:
    kl = str(k).lower()
    if kl in ID_KINDS:
        return False                      # pseudonymised instead
    if kl == "pin" or any(s in kl for s in DROP):
        return kl not in VOCAB_NAMES
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
        if _datey(k):
            out[k] = month(v)
            continue
        out[k] = v
    return out


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


def first_open(cl, tries: list[tuple[str, dict]], limit, deadline: float) -> dict:
    """The first method of `tries` the role opens (the registers' Pro-then-Start rule)."""
    last = None
    for path, body in tries:
        got = rows_of(cl, path, body, limit, deadline)
        last = got
        if not (got["error"] and got["error"].get("code") in ("forbidden", "not_found", "http") and not got["rows"]):
            return got
    return last or {"path": "", "rows": [], "pages": 0, "error": None, "partial": False, "ms": 0}


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
        now = datetime.now(TZ)
        rec("meta", version=APP_VERSION, commit=(current_commit() or "")[:10],
            at=now.isoformat(timespec="seconds"), budget_s=BUDGET_S)
        cfg = verifix.config(db, with_password=True)
        if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
            rec("error", what="not_configured")
            return
        cells: dict[str, dict] = {}
        for c in db.query(Cell).all():
            if c.verifix_code:
                cells[verifix._code_key(c.verifix_code)] = {
                    "unit": c.manager_id, "archived": bool(c.archived_at),
                    "in_load": bool(getattr(c, "in_load", False)), "owner": bool(getattr(c, "owner_id", None)),
                    "leader": bool(getattr(c, "leader_id", None))}
        rec("cells", n=len(cells), active=sum(1 for v in cells.values() if not v["archived"]))
        today = now.strftime("%d.%m.%Y")

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

        def read_d(cl):
            return first_open(cl, [
                ("pro/hiring$list", {"journal_ids": [], "journal_begin_date": JOURNALS_FROM,
                                     "journal_end_date": today}),
                ("start/hiring$list", {"journal_ids": []}),
            ], verifix.LIMIT_LIST, deadline)

        def read_e(cl):
            return first_open(cl, [
                ("pro/transfer$list", {"journal_ids": []}),
                ("start/transfer$list", {"journal_ids": []}),
            ], verifix.LIMIT_LIST, deadline)

        a, b, c, d, e_ = _side_by_side(cfg, read_a, read_b, read_c, read_d, read_e)

        # ── what each method answered ──────────────────────────────────────────
        for m in [a["divs"], a["jobs"], a["fte"], a["ranks"], a["robots"], b, c, d, e_]:
            rec("method", path=m["path"], rows=len(m["rows"]), pages=m["pages"], ms=m.get("ms"),
                error=m["error"], partial=m["partial"], fields=fields(m["rows"]))

        # ── vocabulary: divisions → codes, jobs, employment types, categories ──
        divs: dict[str, dict] = {}
        for dv in a["divs"]["rows"]:
            did = str(dv.get("division_id") or "").strip()
            if did:
                divs[did] = dv
        dcode = {did: code_of(dv) for did, dv in divs.items()}
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

        def place(row: dict) -> dict:
            unit = str(row.get("org_unit_id") or "").strip()
            div = str(row.get("division_id") or "").strip()
            uc, dc = dcode.get(unit), dcode.get(div)
            return {"ucode": uc, "dcode": dc, "cell": uc if uc in cells else (dc if dc in cells else None)}

        # ── positions ─────────────────────────────────────────────────────────
        robots = a["robots"]["rows"]
        fieldstats("pro/robot$list", robots, person=False)
        by_pair: Counter = Counter()
        by_cell: Counter = Counter()
        printed_r = kept_r = 0
        for i, r in enumerate(robots):
            cr = clean(r, person=False)
            if i >= PRINT_MAX["robot"]:
                cr.pop("name", None)          # «<job>, <rank>/<org unit path>/(<id>)» — shown on the sample
            cr.update(place(r))
            by_pair[f"{cr.get('job_id')} | {cr.get('rank_id')}"] += 1
            if cr["cell"]:
                by_cell[cr["cell"]] += 1
            if not cr.get("closed_date") or (cr.get("closed_date") or "") >= DISMISSED_FROM:
                kept_r += 1
                if printed_r < PRINT_MAX["robot_rows"]:
                    rec("robot", **cr)
                    printed_r += 1
        rec("robot_summary", n=len(robots), kept=kept_r, printed=printed_r,
            by_job_rank=by_pair.most_common(120), by_cell=by_cell.most_common(220))

        # ── people (pseudonymised) ────────────────────────────────────────────
        emps = b["rows"]
        fieldstats("core/employee$list", emps, person=True)
        status_count: Counter = Counter()
        printed = 0
        cell_rows: dict[str, list[dict]] = defaultdict(list)
        for e in emps:
            cr = clean(e, person=True)
            cr.update(place(e))
            status = str(cr.get("status") or "")
            status_count[status] += 1
            dism = cr.get("dismissal_date")
            keep = status == "W" or (dism and dism >= DISMISSED_FROM) or status not in ("W", "D")
            if keep and printed < PRINT_MAX["emp"]:
                rec("emp", **cr)
                printed += 1
            if status == "W" and cr["cell"]:
                cell_rows[cr["cell"]].append(cr)
        rec("emp_summary", total=len(emps), printed=printed, status=dict(status_count),
            placed_working=sum(len(v) for v in cell_rows.values()))
        for code in sorted(cells):
            rows = cell_rows.get(code, [])
            jobs: Counter = Counter(str(r.get("job_id")) for r in rows)
            rec("cell", code=code, **cells[code], n_working=len(rows), jobs=jobs.most_common(12))

        # ── the journals: hirings, transfers, rank changes ────────────────────
        for kind, got, cap in (("hire", d, PRINT_MAX["hire"]), ("transfer", e_, PRINT_MAX["transfer"]),
                               ("rank_change", c, PRINT_MAX["rank_change"])):
            lines = flat(got["rows"])
            fieldstats(got["path"] or kind, got["rows"], person=True)
            fieldstats((got["path"] or kind) + ":lines", lines, person=True)
            by_month: Counter = Counter()
            n_print = 0
            for ln in lines:
                cr = clean(ln, person=True)
                cr.update(place(ln))
                m = next((v for k, v in cr.items() if _datey(k) and v and "journal" not in k.lower()
                          and not k.lower().endswith(("_on", "_at"))), None) or cr.get("journal_date")
                by_month[m or "?"] += 1
                if n_print < cap:
                    rec(kind, **cr)
                    n_print += 1
            rec(kind + "_summary", source=got["path"], journals=len(got["rows"]), lines=len(lines),
                printed=n_print, by_month=sorted(by_month.items()))
        rec("done", s=round(time.monotonic() - started, 1),
            pseudonyms={k: len(v) for k, v in _pseud.items()})
    except Exception:  # noqa: BLE001 — never fail the deploy
        rec("error", what="exception", trace=traceback.format_exc()[-1500:])
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
