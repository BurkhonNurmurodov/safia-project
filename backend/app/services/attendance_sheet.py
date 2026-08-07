"""Parser for the single «Отчёт по посещениям сотрудников» workbook that feeds
attendance for the WHOLE factory in one file (admin «Davomat» tab).

This is the third reader of this export family and the only one that has to be
numerically identical to the per-supervisor verifix upload it replaces, so the
hours rule is spelled out here:

    Отработано  =  Вовремя  +  Вне графика  +  Сверхурочно        (verified
    exactly across every worked row of the reference export)

``verifix_parser`` (the per-supervisor path) stores «Отработано» as
``hours_worked``; ``cell_attendance_parser`` (the isolated per-cell table)
stores the number inside the day cell's parentheses, which is «Вовремя» — a
DIFFERENT, systematically smaller value (8.5 vs 8.4 on the reference row).
Reading the day cell here would silently shave ~0.5–3 % off every worker's
hours the moment the upload path switched, so this parser reproduces
«Отработано»:

  * single-day export (the only shape accepted) → take the «Отработано» total
    column verbatim → bit-identical to today's numbers;
  * fallback, when that column is blank but the day cell holds a clock string →
    day-cell hours + the minutes clocked outside the schedule window, which
    reconstructs «Вне графика» exactly (also verified against the reference).

The layout is found by HEADER TEXT, never by column offset: this workbook family
gets reshuffled by whoever exports it (see the shift-report sheet swap), and a
positional reader breaks silently when that happens.

openpyxl is used directly rather than pandas — importing pandas at module scope
spins up OpenBLAS in every Passenger worker and exhausts RLIMIT_NPROC.
"""

import re
import warnings
from io import BytesIO
from datetime import date, datetime, timedelta

# Russian short month names (matched on the first 3 lowercase letters).
_RU_MONTHS = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}

_DATE_RE = re.compile(r"(\d{1,2})\s+([А-Яа-яЁё]+)\.?\s+(\d{4})")
_EXPORT_RE = re.compile(r"(\d{2})_(\d{2})_(\d{4})\+(\d{2})_(\d{2})_(\d{2})")
# "07:55 - 17:02 (8.4)" → in, out, hours   (hyphen, en-dash or em-dash)
_CLOCK_RE = re.compile(r"(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*\(([\d.,]+)\)")
# One «Орг. единица» entry: "4311 Оф.Тортов.глаз"
_ORG_UNIT_RE = re.compile(r"^\s*(\d{2,10})\s+(.+?)\s*$")

# Identity columns, matched on the normalised header text.
_ID_HEADERS = {
    "№":                 "num",
    "фио":               "fio",
    "должность":         "job",
    "код подразделения": "code",
    "график работы":     "schedule",
}
# Period-total columns that follow the day block.
_TOTAL_HEADERS = {
    "по плану":     "plan",
    "отработано":   "worked",
    "вовремя":      "ontime",
    "сверхурочно":  "overtime",
    "вне графика":  "off_schedule",
    "итого":        "total",
}

_BLANK = ("", "nan", "NaN", "None")


class AttendanceSheetError(ValueError):
    """Raised with a user-facing message when the workbook can't be read."""


# ── small helpers ─────────────────────────────────────────────────────────────

def _norm(v) -> str:
    """Normalise a header cell for matching: lowercase, single-spaced, no dots."""
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip().lower().rstrip(".:")


def _text(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in _BLANK else s


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
    """The export timestamp embedded in the filename — audit only, never the date."""
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


def parse_org_units(text: str) -> dict:
    """From "Орг. единица: 4311 Оф.Тортов.глаз, 4312 Оф.Тортов.крем" →
    {"4311": "Оф.Тортов.глаз", …}. Used to name cells the registry doesn't
    know yet, so an auto-created cell arrives with a readable label."""
    if not text:
        return {}
    body = text.split(":", 1)[1] if ":" in text else text
    out = {}
    for chunk in body.split(","):
        m = _ORG_UNIT_RE.match(chunk)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def clean_code(v) -> str:
    """«Код подразделения» may arrive as 4311, 4311.0 or "4311"."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    s = str(v).strip()
    # "4311.0" from a float-typed column read as text
    if re.fullmatch(r"\d+\.0+", s):
        return s.split(".")[0]
    return s


def _to_minutes(token: str):
    """"08-00" / "08:00" → 480. None when unparseable."""
    try:
        h, m = token.strip().replace("-", ":").split(":")[:2]
        h, m = int(h), int(m)
    except (ValueError, TypeError, AttributeError):
        return None
    if not (0 <= h <= 47 and 0 <= m <= 59):
        return None
    return h * 60 + m


def schedule_bounds(schedule: str):
    """"08-00 до 17-00" → (480, 1020). Night shifts ("20-00 до 05-00") get the
    end pushed past midnight so the window stays a forward interval."""
    if not schedule:
        return None, None
    parts = re.split(r"\bдо\b|\bgacha\b|[-–—]{1}\s*(?=\d{1,2}[:-]\d{2}\s*$)", schedule, maxsplit=1)
    if len(parts) < 2:
        return None, None
    start = _to_minutes(parts[0])
    end = _to_minutes(parts[1])
    if start is None or end is None:
        return start, end
    if end <= start:
        end += 24 * 60
    return start, end


def _num(v):
    """Excel numeric cell → float, tolerating "8,5" and stray text."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".").replace("\xa0", "")
    if not s or s in _BLANK:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def clock_metrics(schedule: str, day_raw: str):
    """Per-day timing facts derived from the day cell + the schedule string.

    Returns (clock_in, clock_out, day_hours, early_min, off_schedule_min) with
    everything None/0 when the cell is a marker ("X", "О") rather than a clock
    string. ``off_schedule_min`` reconstructs «Вне графика» — minutes clocked
    before the shift starts plus minutes clocked after it ends.
    """
    m = _CLOCK_RE.search(day_raw or "")
    if not m:
        return None, None, None, 0.0, 0.0

    clock_in, clock_out = m.group(1), m.group(2)
    day_hours = _num(m.group(3))

    start, end = schedule_bounds(schedule)
    in_min = _to_minutes(clock_in)
    out_min = _to_minutes(clock_out)
    if in_min is None or out_min is None:
        return clock_in, clock_out, day_hours, 0.0, 0.0
    if out_min < in_min:          # crossed midnight
        out_min += 24 * 60

    if start is None or end is None:
        return clock_in, clock_out, day_hours, 0.0, 0.0

    early = max(0.0, float(start - in_min))
    late = max(0.0, float(out_min - end))
    return clock_in, clock_out, day_hours, early, round(early + late, 2)


# ── the workbook ──────────────────────────────────────────────────────────────

def _find_header_row(rows):
    """The header row is the one whose first cell is «№». Scanned over the top
    of the sheet so extra title/filter rows above it don't matter."""
    for i, r in enumerate(rows[:15]):
        if r and _norm(r[0]) == "№":
            return i
    return None


def _map_columns(header, subheader):
    """Header row → ({role: col}, [day columns], [(day col, day number)]).

    Identity and total columns are matched by TEXT; anything between them whose
    header is a bare 1..31 is a day column. Vertically merged headers put their
    value in the first row, so `header` alone is enough for both bands.
    """
    ids, totals, days = {}, {}, []
    for c, raw in enumerate(header):
        key = _norm(raw)
        if key in _ID_HEADERS:
            ids.setdefault(_ID_HEADERS[key], c)
            continue
        if key in _TOTAL_HEADERS:
            totals.setdefault(_TOTAL_HEADERS[key], c)
            continue
        # A day header is a plain day-of-month number.
        n = None
        if isinstance(raw, (int, float)) and float(raw).is_integer():
            n = int(raw)
        elif isinstance(raw, str) and raw.strip().isdigit():
            n = int(raw.strip())
        elif isinstance(raw, datetime):
            n = raw.day
        if n is not None and 1 <= n <= 31 and c > 0:
            days.append((c, n))
    return ids, totals, days


def parse_attendance_workbook(content: bytes, filename: str = ""):
    """Read one «Отчёт по посещениям сотрудников» export.

    Returns a dict:
        {period_from, period_to, export_ts, org_units, day_count,
         rows: [ {verifix_code, worker_name, job_title, schedule,
                  clock_in_out, hours_worked, early_arrival_min,
                  effective_hours, day_raw, status}, … ]}

    ``rows`` are already in the shape the ``attendance`` table stores, with
    ``hours_worked`` reproducing «Отработано» (see the module docstring).
    Raises AttendanceSheetError with a message meant for the admin's screen.
    """
    import openpyxl  # lazy — see module docstring

    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
    try:
        wb = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 — corrupt/foreign file
        raise AttendanceSheetError(f"Faylni ochib bo'lmadi: {exc}") from exc
    try:
        ws = wb.active
        if ws is None:
            raise AttendanceSheetError("Ish varag'i topilmadi")
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    finally:
        try:
            wb.close()
        except Exception:  # noqa: BLE001 — closing must never mask a parse error
            pass

    if not rows:
        raise AttendanceSheetError("Fayl bo'sh")

    # ── Period + org units (the preamble above the header) ──────────────────
    period_from = period_to = None
    org_units = {}
    for r in rows[:12]:
        joined = " ".join(str(c) for c in r if c is not None)
        if not joined:
            continue
        if period_from is None and ("Период" in joined or "Davr" in joined):
            period_from, period_to = parse_period(joined)
        if not org_units and ("Орг. единица" in joined or "Орг.единица" in joined):
            org_units = parse_org_units(joined)

    if period_from is None:
        raise AttendanceSheetError(
            "Sheetdan «Период» sanasini o'qib bo'lmadi — bu hisobot fayli emasga o'xshaydi"
        )

    # ── Header + column map ────────────────────────────────────────────────
    header_idx = _find_header_row(rows)
    if header_idx is None:
        raise AttendanceSheetError("Jadval sarlavhasi («№» ustuni) topilmadi")

    header = rows[header_idx]
    subheader = rows[header_idx + 1] if header_idx + 1 < len(rows) else []
    ids, totals, days = _map_columns(header, subheader)

    for need, label in (("fio", "ФИО"), ("code", "Код подразделения"), ("schedule", "График работы")):
        if need not in ids:
            raise AttendanceSheetError(f"«{label}» ustuni topilmadi")
    if not days:
        raise AttendanceSheetError("Kunlik ustunlar topilmadi")

    day_count = len(days)

    # ── Worker rows ────────────────────────────────────────────────────────
    # +2 skips the «По причине / Без причины» sub-header line.
    out = []
    seen_any = False
    for r in rows[header_idx + 2:]:
        if not r:
            continue

        def cell(role):
            c = ids.get(role)
            return r[c] if c is not None and c < len(r) else None

        worker = _text(cell("fio"))
        if not worker:
            continue
        # A footer/total line has a name-ish cell but no numbering.
        num_col = ids.get("num")
        if num_col is not None and num_col < len(r):
            if _num(r[num_col]) is None:
                continue

        seen_any = True
        job_title = _text(cell("job"))
        code = clean_code(cell("code"))
        schedule = _text(cell("schedule"))

        day_col = days[0][0]
        day_raw = _text(r[day_col]) if day_col < len(r) else ""

        clock_in, clock_out, day_hours, early_min, off_min = clock_metrics(schedule, day_raw)

        def total(role):
            c = totals.get(role)
            return _num(r[c]) if c is not None and c < len(r) else None

        if clock_in is None:
            # Marker day (X / О / blank) — no hours, exactly like the per-
            # supervisor parser, whose «Отработано» cell is empty for these.
            hours_worked = None
            status = day_raw or "—"
        else:
            worked = total("worked")
            if worked is not None:
                # Single-day export → the period total IS this day's «Отработано».
                hours_worked = worked
            else:
                # Reconstruct it: Вовремя + Вне графика (+ Сверхурочно).
                overtime = total("overtime") or 0.0
                hours_worked = round((day_hours or 0.0) + off_min / 60 + overtime, 4)
            status = "worked"

        effective = None
        if hours_worked is not None:
            effective = round(hours_worked - early_min / 60, 4)

        out.append({
            "verifix_code":      code or None,
            "worker_name":       worker,
            "job_title":         job_title,
            "schedule":          schedule,
            "clock_in_out":      day_raw,
            "hours_worked":      hours_worked,
            "early_arrival_min": early_min,
            "effective_hours":   effective,
            "day_raw":           day_raw,
            "clock_in":          clock_in,
            "clock_out":         clock_out,
            "status":            status,
        })

    if not seen_any:
        raise AttendanceSheetError("Faylda birorta xodim qatori topilmadi")

    return {
        "period_from": period_from,
        "period_to":   period_to or period_from,
        "export_ts":   parse_export_ts(filename),
        "org_units":   org_units,
        "day_count":   day_count,
        "day_dates":   [period_from + timedelta(days=i) for i in range(day_count)],
        "rows":        out,
    }
