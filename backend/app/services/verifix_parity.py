"""Verifix against the uploaded Excel — the parity check (admin «Verifix» card).

The daily «Davomat» Excel can only be dropped for the API (memory:
verifix-api-integration, decision 7) once the API says what the file said, day
by day: who came, in which cell, at what clock, for how many hours. This reads
both for a few past days and counts where they agree. It writes nothing,
anywhere, except its own result.

**The two sides, exactly.**

* The FILE — ``attendance_batch_rows``, the export as uploaded, which nothing
  downstream rewrites (exchanges move ``attendance``, never the batch). A row
  an admin edited or added by hand is a person's correction, not the file, so
  it is skipped and counted.
* The API — ``core/timesheet$export`` for the same dates. A row is placed in a
  cell by its employee's CURRENT org unit («отдел», ``employee$list``): the
  report prints only the division, which carries no cell code (first run,
  2026-10-01 — 0 of 2,942 rows by division, 1,606 by org unit). Current, so a
  worker moved since that day lands in today's cell; the name match does not
  care, the per-cell table shows it as a difference.

**People are matched by NAME** — the file carries no employee id. The folded
full name first, then surname + first name (one side may carry the
patronymic), and only when exactly one person answers: two namesakes are
counted as ambiguous, never guessed between.

**«Отработано» is found, not assumed.** The report gives minutes (or seconds —
the docs say seconds, their own example is minutes) per TIME KIND, and the file
gives one number. Every subset of the kinds that occur is scored against the
file's hours over the people both sides say came, in both units, and the best
is reported with its runners-up. That answer is what the live feed will sum.

Counts and cell codes only: no person's name leaves this module, and the
result is stored like the connection test's.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AttendanceBatch, AttendanceBatchRow, Cell
from app.services import verifix
from app.services.name_map import _name_tokens

log = logging.getLogger(__name__)

K_LAST_PARITY = "verifix_last_parity"

MAX_DAYS = 7
# The file prints hours to two decimals; a sum in minutes lands within a
# hundredth of it when the formula is right.
EXACT_H = 0.011
CLOSE_H = 0.1
# The kinds searched — the most frequent ones; 2^8 subsets.
SEARCH_KINDS = 8
# The search scores this many worker-days; the winner is then scored on all.
SEARCH_SAMPLE = 4000
TOP_CELLS = 25
ALTERNATIVES = 3

_CLOCK_RE = re.compile(r"(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})")
_API_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})(?::\d{2})?\s*$")


def _keys(name: str) -> tuple[str, str]:
    """(full folded name, surname + first name)."""
    toks = _name_tokens(name or "")
    if not toks:
        raw = re.sub(r"\s+", " ", (name or "").strip().upper())
        return raw, raw
    return " ".join(toks), " ".join(toks[:2])


def _hhmm(h: str, m: str) -> str:
    return f"{int(h):02d}:{m}"


def _file_clock(raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    m = _CLOCK_RE.search(raw or "")
    if not m:
        return None, None
    return _hhmm(m.group(1), m.group(2)), _hhmm(m.group(3), m.group(4))


def _api_clock(raw: Any) -> Optional[str]:
    m = _API_TIME_RE.search(str(raw or "").strip())
    return _hhmm(m.group(1), m.group(2)) if m else None


def _api_date(raw: Any) -> Optional[date]:
    try:
        return datetime.strptime(str(raw or "").strip()[:10], "%d.%m.%Y").date()
    except ValueError:
        return None


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def default_range(today: Optional[date] = None) -> tuple[date, date]:
    """Three days ending the day before yesterday: yesterday's shift-2 file
    usually lands only in the afternoon, so its batch is still incomplete."""
    today = today or datetime.now(verifix.TZ).date()
    return today - timedelta(days=4), today - timedelta(days=2)


def last_parity(db: Session) -> Optional[dict]:
    raw = verifix._get(db, K_LAST_PARITY)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


# ── the two sides ─────────────────────────────────────────────────────────────

def _file_side(db: Session, d0: date, d1: date) -> tuple[dict, dict]:
    """date → file records, and date → how many rows were skipped as edited."""
    batches = {b.id: b.date for b in db.query(AttendanceBatch.id, AttendanceBatch.date)
               .filter(AttendanceBatch.date >= d0, AttendanceBatch.date <= d1).all()}
    out: dict[date, list[dict]] = defaultdict(list)
    skipped: Counter[date] = Counter()
    if not batches:
        return out, skipped
    q = (db.query(AttendanceBatchRow.batch_id, AttendanceBatchRow.worker_name,
                  AttendanceBatchRow.verifix_code, AttendanceBatchRow.hours_worked,
                  AttendanceBatchRow.clock_in_out, AttendanceBatchRow.edited,
                  AttendanceBatchRow.manual)
         .filter(AttendanceBatchRow.batch_id.in_(list(batches))))
    for bid, name, code, hours, clock, edited, manual in q:
        day = batches[bid]
        if edited or manual:
            skipped[day] += 1
            continue
        if not (name or "").strip():
            continue
        full, two = _keys(name)
        h = float(hours) if hours is not None else 0.0
        cin, cout = _file_clock(clock)
        out[day].append({
            "full": full, "two": two,
            "cell": verifix._code_key(code) if code else None,
            "came": h > 0, "hours": h, "in": cin, "out": cout,
        })
    return out, skipped


def _api_side(cl, deadline: float, d0: date, d1: date,
              division_codes: dict, emp_unit: dict) -> tuple[dict, bool]:
    """date → API records over the window. Returns (records, partial)."""
    out: dict[date, list[dict]] = defaultdict(list)
    body = {"period_begin_date": verifix._dmy(d0), "period_end_date": verifix._dmy(d1),
            "division_ids": [], "employee_ids": []}
    partial = False
    try:
        for page in verifix.each_page(cl, "core/timesheet$export", body,
                                      limit=verifix.LIMIT_TIMESHEET, deadline=deadline):
            for r in page:
                full, two = _keys(r.get("employee_name") or "")
                eid = str(r.get("employee_id") or "")
                cell = division_codes.get(emp_unit.get(eid, ""))
                for d in r.get("days") or []:
                    day = _api_date(d.get("date"))
                    if day is None or not (d0 <= day <= d1):
                        continue
                    facts: dict[str, float] = {}
                    for f in d.get("facts") or []:
                        k = str(f.get("time_kind_id") or "")
                        v = _num(f.get("fact_value"))
                        if k and v:
                            facts[k] = facts.get(k, 0.0) + v
                    out[day].append({
                        "full": full, "two": two, "cell": cell,
                        "came": bool(d.get("input_time")),
                        "in": _api_clock(d.get("input_time")),
                        "out": _api_clock(d.get("output_time")),
                        "facts": facts,
                    })
    except verifix.VerifixError as exc:
        if exc.code != "slow" or not out:
            raise
        partial = True
    return out, partial


# ── matching one day ──────────────────────────────────────────────────────────

def _compare_day(file_recs: list[dict], api_recs: list[dict], ours: set) -> tuple[dict, list]:
    """Counts for one date, and the (file hours, API facts) pairs of the people
    both sides say came — the hours search's input."""
    by_full: dict[str, list[int]] = defaultdict(list)
    by_two: dict[str, list[int]] = defaultdict(list)
    for i, a in enumerate(api_recs):
        by_full[a["full"]].append(i)
        by_two[a["two"]].append(i)

    file_cells = {f["cell"] for f in file_recs if f["cell"]}
    s = Counter()
    s["file_rows"] = len(file_recs)
    s["file_came"] = sum(f["came"] for f in file_recs)
    s["file_cells"] = len({f["cell"] for f in file_recs if f["cell"] and f["came"]})
    placed = [a for a in api_recs if a["cell"] in ours]
    s["api_rows"] = len(placed)
    s["api_came"] = sum(a["came"] for a in placed)
    # People the API places in a cell the file has no row for at all — a file
    # not uploaded, not a person missing.
    s["api_came_other_cells"] = sum(a["came"] for a in placed if a["cell"] not in file_cells)

    taken: set[int] = set()
    pairs: list[tuple[float, dict]] = []
    for f in file_recs:
        cands = by_full.get(f["full"]) or []
        if len(cands) != 1:
            alt = by_two.get(f["two"]) or []
            cands = alt if not cands or len(alt) == 1 else cands
        if len(cands) > 1 or (len(cands) == 1 and cands[0] in taken):
            s["ambiguous"] += 1
            continue
        if not cands:
            s["only_file"] += 1
            s["only_file_came"] += f["came"]
            continue
        i = cands[0]
        taken.add(i)
        a = api_recs[i]
        s["matched"] += 1
        s["same_cell"] += (a["cell"] is not None and a["cell"] == f["cell"])
        if f["came"] and a["came"]:
            s["came_both"] += 1
            if f["in"] and a["in"]:
                s["clock_n"] += 1
                s["clock_in_same"] += f["in"] == a["in"]
                s["clock_out_same"] += (f["out"] is not None and f["out"] == a["out"])
                s["clock_same"] += f["in"] == a["in"] and f["out"] == a["out"]
            if f["hours"] > 0:
                pairs.append((f["hours"], a["facts"]))
        elif f["came"]:
            s["came_file_only"] += 1
        elif a["came"]:
            s["came_api_only"] += 1

    # In the API, in one of the cells the file covers, and named by nobody in
    # the file: a person the file does not have.
    for i, a in enumerate(api_recs):
        if i in taken or a["cell"] not in file_cells:
            continue
        s["only_api"] += 1
        s["only_api_came"] += a["came"]
    return dict(s), pairs


# ── which kinds make «Отработано» ─────────────────────────────────────────────

def _search_hours(pairs: list[tuple[float, dict]], kind_names: dict) -> Optional[dict]:
    if not pairs:
        return None
    freq: Counter[str] = Counter()
    for _, facts in pairs:
        freq.update(k for k, v in facts.items() if v)
    kinds = [k for k, _ in freq.most_common(SEARCH_KINDS)]
    if not kinds:
        return None
    n = len(kinds)
    size = 1 << n
    sample = pairs[::max(1, -(-len(pairs) // SEARCH_SAMPLE))]

    # Per unit: exact / close counts and the summed error, indexed by subset.
    acc = {unit: ([0] * size, [0] * size, [0.0] * size) for unit in (60, 3600)}
    for hours, facts in sample:
        vals = [facts.get(k, 0.0) for k in kinds]
        sums = [0.0] * size
        for mask in range(1, size):
            low = mask & -mask
            sums[mask] = sums[mask ^ low] + vals[low.bit_length() - 1]
        for unit, (ex, cl, er) in acc.items():
            inv = 1.0 / unit
            for mask in range(1, size):
                d = abs(sums[mask] * inv - hours)
                if d <= CLOSE_H:
                    cl[mask] += 1
                    if d <= EXACT_H:
                        ex[mask] += 1
                er[mask] += d
    ranked = sorted(((mask, unit) for unit in acc for mask in range(1, size)),
                    key=lambda mu: (-acc[mu[1]][0][mu[0]], -acc[mu[1]][1][mu[0]],
                                    acc[mu[1]][2][mu[0]]))

    def describe(mask: int, unit: int, exact: int, close: int, err: float, total: int) -> dict:
        return {
            "unit": "min" if unit == 60 else "sec",
            "kinds": [{"id": kinds[b], "name": kind_names.get(kinds[b], "")}
                      for b in range(n) if mask >> b & 1],
            "exact": exact, "close": close, "n": total,
            "mae": round(err / total, 3) if total else None,
        }

    best_mask, best_unit = ranked[0]
    rule = (kinds, best_mask, best_unit)
    exact, close, err = _score(pairs, rule)
    best = describe(best_mask, best_unit, exact, close, err, len(pairs))
    best["alternatives"] = [
        describe(m, u, acc[u][0][m], acc[u][1][m], acc[u][2][m], len(sample))
        for m, u in ranked[1:1 + ALTERNATIVES]
    ]
    best["searched"] = [{"id": k, "name": kind_names.get(k, ""), "n": freq[k]} for k in kinds]
    best["_rule"] = rule
    return best


def _score(pairs: list[tuple[float, dict]], rule: tuple) -> tuple[int, int, float]:
    """(exact, close, summed error) of one kinds-subset over these pairs."""
    kinds, mask, unit = rule
    picked = [kinds[b] for b in range(len(kinds)) if mask >> b & 1]
    exact = close = 0
    err = 0.0
    for hours, facts in pairs:
        d = abs(sum(facts.get(k, 0.0) for k in picked) / unit - hours)
        exact += d <= EXACT_H
        close += d <= CLOSE_H
        err += d
    return exact, close, err


# ── the check ─────────────────────────────────────────────────────────────────

def run(db: Session, d0: date, d1: date, actor: str = "") -> dict:
    cfg = verifix.config(db, with_password=True)
    started = time.monotonic()
    result: dict[str, Any] = {
        "at": datetime.now(verifix.TZ).isoformat(timespec="seconds"),
        "by": actor, "host": cfg["host"],
        "from": d0.isoformat(), "to": d1.isoformat(),
    }
    if cfg["password_set"] and not cfg["password_readable"]:
        return _finish(db, result, started, "password_unreadable")
    if not (cfg["login"] and cfg.get("password") and cfg["filial_id"]):
        return _finish(db, result, started, "not_configured")

    files, skipped = _file_side(db, d0, d1)
    if not any(files.values()):
        return _finish(db, result, started, "no_files")

    ours = {verifix._code_key(c) for (c,) in db.query(Cell.verifix_code).all() if c}
    deadline = started + verifix.BUDGET_S
    division_codes: dict[str, str] = {}
    emp_unit: dict[str, str] = {}
    kind_names: dict[str, str] = {}
    try:
        with verifix.client(cfg) as cl:
            for page in verifix.each_page(cl, "core/division$list", {"division_ids": []},
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for d in page:
                    code = str(d.get("code") or "").strip()
                    if code:
                        division_codes[str(d.get("division_id") or "")] = verifix._code_key(code)
            for page in verifix.each_page(cl, "core/employee$list",
                                          {"employee_ids": [], "statuses": [], "npins": []},
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for e in page:
                    eid = str(e.get("employee_id") or "")
                    if eid:
                        emp_unit[eid] = str(e.get("org_unit_id") or "")
            for page in verifix.each_page(cl, "core/time_kind$list", {"time_kind_ids": []},
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for k in page:
                    kid = str(k.get("time_kind_id") or "")
                    if kid:
                        letter = k.get("letter_code") or ""
                        kind_names[kid] = (k.get("name") or "") + (f" ({letter})" if letter else "")
            api, partial = _api_side(cl, deadline, d0, d1, division_codes, emp_unit)
    except verifix.VerifixError as exc:
        result.update(code=exc.code, status=exc.status, message=exc.message)
        return _finish(db, result, started, exc.code)

    days, all_pairs, day_pairs = [], [], {}
    cell_file: Counter[str] = Counter()
    cell_api: Counter[str] = Counter()
    day = d0
    while day <= d1:
        f_recs, a_recs = files.get(day, []), api.get(day, [])
        row: dict[str, Any] = {"date": day.isoformat(), "file": bool(f_recs),
                               "skipped": skipped.get(day, 0)}
        if f_recs:
            stats, pairs = _compare_day(f_recs, a_recs, ours)
            row.update(stats)
            day_pairs[day] = pairs
            all_pairs.extend(pairs)
            covered = {f["cell"] for f in f_recs if f["cell"]}
            for f in f_recs:
                if f["came"] and f["cell"]:
                    cell_file[f["cell"]] += 1
            for a in a_recs:
                if a["came"] and a["cell"] in covered:
                    cell_api[a["cell"]] += 1
        days.append(row)
        day += timedelta(days=1)

    hours = _search_hours(all_pairs, kind_names)
    if hours:
        rule = hours.pop("_rule")
        for row in days:
            pairs = day_pairs.get(date.fromisoformat(row["date"]))
            if pairs:
                row["hours_n"] = len(pairs)
                row["hours_exact"], row["hours_close"], _ = _score(pairs, rule)
    result["hours"] = hours

    totals: Counter[str] = Counter()
    for row in days:
        for k, v in row.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                totals[k] += v
    result["days"] = days
    result["totals"] = dict(totals)

    cells = []
    for code in set(cell_file) | set(cell_api):
        fv, av = cell_file.get(code, 0), cell_api.get(code, 0)
        cells.append({"code": code.zfill(4) if code.isdigit() else code,
                      "file": fv, "api": av, "diff": av - fv})
    cells.sort(key=lambda c: (-abs(c["diff"]), c["code"]))
    result["cells"] = cells[:TOP_CELLS]
    result["cells_total"] = len(cells)
    result["cells_differ"] = sum(1 for c in cells if c["diff"])
    if partial:
        result["partial"] = True
    return _finish(db, result, started, "partial" if partial else "ok")


def _finish(db: Session, result: dict, started: float, verdict: str) -> dict:
    result["verdict"] = verdict
    result["ok"] = verdict == "ok"
    result["ms"] = int((time.monotonic() - started) * 1000)
    try:
        verifix._put(db, K_LAST_PARITY, json.dumps(result, ensure_ascii=False))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("verifix parity: could not store the result")
    log.info("verifix parity %s..%s: %s in %s ms", result.get("from"), result.get("to"),
             verdict, result["ms"])
    return result
