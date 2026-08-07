"""Parser for the «Отчёт по посещениям сотрудников» per-cell attendance export.

Structurally different from the per-manager verifix export (see verifix_parser):
  * No manager id in the filename — the filename only carries the export
    timestamp ("…27_07_2026+20_09_13.xlsx"). The authoritative attendance date
    comes from the in-sheet «Период» line (row 3).
  * Every worker row is tagged with «Код подразделения» = the cell's
    `verifix_code`, so the file covers many cells at once.
  * The report can span multiple days: the columns between «График работы» and
    «По плану» are one-per-day (header = day-of-month), each holding that day's
    clock string "07:55 - 17:02 (8.4)" or a status marker ("X", "О", …). The
    «По плану / Отработано / … / Итого» columns are PERIOD totals, not per-day,
    so we do not attribute them to a single day — we fan out the per-day cells to
    one row per (worker, cell, day) and parse hours straight from the day cell.

openpyxl is used directly (not pandas): the layout is positional with a variable
number of day columns, which is far cleaner to walk cell-by-cell, and it avoids
the OpenBLAS/pandas worker-startup issue noted in verifix_parser.
"""

import re
import warnings
from io import BytesIO
from datetime import date, datetime, timedelta

from app.services.verifix_parser import calc_early_arrival

# Russian short month names (matched on the first 3 lowercase letters).
_RU_MONTHS = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}

_DATE_RE = re.compile(r"(\d{1,2})\s+([А-Яа-яЁё]+)\.?\s+(\d{4})")
_EXPORT_RE = re.compile(r"(\d{2})_(\d{2})_(\d{4})\+(\d{2})_(\d{2})_(\d{2})")
# "07:55 - 17:02 (8.4)"  →  in, out, hours   (accept hyphen or en-dash)
_CLOCK_RE = re.compile(r"(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*\(([\d.]+)\)")


def _parse_ru_date(token_day: str, token_mon: str, token_year: str):
    mon = _RU_MONTHS.get(token_mon.strip().lower()[:3])
    if not mon:
        return None
    try:
        return date(int(token_year), mon, int(token_day))
    except (ValueError, TypeError):
        return None


def parse_period(text: str):
    """From "Период: 26 июл 2026 - 26 июл 2026" → (date_from, date_to)."""
    if not text:
        return None, None
    matches = _DATE_RE.findall(text)
    if not matches:
        return None, None
    first = _parse_ru_date(*matches[0])
    last = _parse_ru_date(*matches[-1])
    return first, (last or first)


def parse_export_ts(filename: str):
    """Extract the export timestamp embedded in the filename (audit only)."""
    if not filename:
        return None
    m = _EXPORT_RE.search(filename)
    if not m:
        return None
    d, mo, y, h, mi, s = (int(x) for x in m.groups())
    try:
        return datetime(y, mo, d, h, mi, s)
    except (ValueError, TypeError):
        return None


def _is_day_header(v) -> bool:
    """A day column's header (row 5) is a day-of-month number (1..31)."""
    if isinstance(v, (int, float)):
        n = int(v)
    elif isinstance(v, str) and v.strip().isdigit():
        n = int(v.strip())
    else:
        return False
    return 1 <= n <= 31


def _clean_code(v) -> str:
    """«Код подразделения» may arrive as 4311, 4311.0 or "4311"."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    return str(v).strip()


def parse_cell_attendance_file(content: bytes, filename: str):
    """Parse one per-cell attendance xlsx.

    Returns (period_from, period_to, export_ts, dates, records) where `dates` is
    the list of calendar days the file covers (one per day column) and `records`
    is a list of dicts, one per (worker, cell, day).
    """
    import openpyxl  # lazy — mirror verifix_parser's caution

    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
    wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()

    export_ts = parse_export_ts(filename)

    # ── Period (row index 2: "Период: …") ──────────────────────────────────
    period_from = period_to = None
    for i in range(min(6, len(rows))):
        joined = " ".join(str(c) for c in rows[i] if c is not None)
        if "Период" in joined or "Period" in joined:
            period_from, period_to = parse_period(joined)
            break
    if period_from is None:
        return None, None, export_ts, [], []

    # ── Locate header + day columns ─────────────────────────────────────────
    # The header row is the one whose col 0 is "№"; day columns are the numeric
    # headers that follow «График работы» (col 4), up to «По плану».
    header_idx = None
    for i in range(min(8, len(rows))):
        if rows[i] and str(rows[i][0]).strip() == "№":
            header_idx = i
            break
    if header_idx is None:
        return period_from, period_to, export_ts, [], []

    header = rows[header_idx]
    day_cols = []
    for c in range(5, len(header)):
        if _is_day_header(header[c]):
            day_cols.append(c)
        else:
            break  # first non-day header (e.g. «По плану») ends the day block
    if not day_cols:
        return period_from, period_to, export_ts, [], []

    # Each day column maps to a consecutive calendar day from the period start.
    dates = [period_from + timedelta(days=i) for i in range(len(day_cols))]

    # ── Worker rows ─────────────────────────────────────────────────────────
    records = []
    for r in rows[header_idx + 2:]:  # +2 skips the "По причине/Без причины" subhead
        if not r:
            continue
        num = r[0]
        if not isinstance(num, (int, float)):
            continue  # footer / blank
        worker = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ""
        if not worker or worker in ("nan", "NaN"):
            continue

        job_title = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""
        code = _clean_code(r[3]) if len(r) > 3 else ""
        schedule = str(r[4]).strip() if len(r) > 4 and r[4] is not None else ""

        for col, day in zip(day_cols, dates):
            raw = r[col] if col < len(r) else None
            if raw is None:
                continue
            day_raw = str(raw).strip()
            if not day_raw or day_raw in ("nan", "NaN"):
                continue

            m = _CLOCK_RE.search(day_raw)
            if m:
                clock_in, clock_out, hrs = m.group(1), m.group(2), m.group(3)
                try:
                    hours = float(hrs)
                except (ValueError, TypeError):
                    hours = None
                early = calc_early_arrival(schedule, day_raw)
                effective = round(hours - early / 60, 4) if hours is not None else None
                status = "worked"
            else:
                clock_in = clock_out = None
                hours = effective = None
                early = 0.0
                status = day_raw  # marker: X (day off), О (excused), …

            records.append({
                "date":              day,
                "verifix_code":      code or None,
                "worker_name":       worker,
                "job_title":         job_title if job_title not in ("nan", "NaN") else "",
                "schedule":          schedule if schedule not in ("nan", "NaN") else "",
                "day_raw":           day_raw,
                "clock_in":          clock_in,
                "clock_out":         clock_out,
                "hours_worked":      hours,
                "early_arrival_min": early,
                "effective_hours":   effective,
                "status":            status,
            })

    return period_from, period_to, export_ts, dates, records
