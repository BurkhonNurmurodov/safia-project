from datetime import datetime, timedelta
from typing import Optional
import gspread
from google.oauth2.service_account import Credentials
from app.config import settings

_gc: Optional[gspread.Client] = None

SHIFT_CATEGORIES = [
    ("Cat A", 424), ("Cat B", 426), ("Cat C", 428),
    ("Cat D", 430), ("Cat D2", 432), ("Cat D3", 434),
    ("Cat E", 436), ("Cat F", 438), ("Cat G", 440),
]


def get_client() -> gspread.Client:
    global _gc
    if _gc is None:
        creds = Credentials.from_service_account_file(
            settings.google_credentials_file,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        _gc = gspread.authorize(creds)
    return _gc


def _reset_client():
    global _gc
    _gc = None


def serial_to_date(val) -> Optional[str]:
    try:
        n = int(float(val))
        d = datetime(1899, 12, 30) + timedelta(days=n)
        return d.strftime("%d.%m.%Y")
    except Exception:
        return None


def clean_num(val) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    v = str(val).replace("\xa0", "").replace(" ", "").strip()
    try:
        return float(v)
    except ValueError:
        return 0.0


def _fetch_sheet_rows(sheet_id: str, tab: str, unformatted: bool = False) -> list:
    try:
        gc = get_client()
        sh = gc.open_by_key(sheet_id)
        ws = sh.worksheet(tab)
        if unformatted:
            return ws.get_all_values(value_render_option="UNFORMATTED_VALUE")
        return ws.get_all_values()
    except Exception:
        _reset_client()
        raise


def read_production_data(sheet_id: str, min_date: Optional[datetime] = None):
    """Read plan and actual production minutes from the Минут sheet."""
    rows = _fetch_sheet_rows(sheet_id, "Минут", unformatted=True)

    date_row = rows[51]
    data_rows = rows[53:]

    date_cols = []
    for i, val in enumerate(date_row):
        if not str(val).strip():
            continue
        label = serial_to_date(val)
        if label is None:
            continue
        if min_date:
            try:
                if datetime.strptime(label, "%d.%m.%Y") < min_date:
                    continue
            except Exception:
                pass
        date_cols.append((label, i))

    plan_data: dict[str, dict[str, float]] = {}
    actual_data: dict[str, dict[str, float]] = {}

    started = False
    for row in data_rows:
        if not row or not str(row[0]).strip():
            if started:
                break
            continue
        started = True
        name = str(row[0]).strip()
        plan_data[name] = {}
        actual_data[name] = {}
        for date_label, col_idx in date_cols:
            plan_data[name][date_label] = clean_num(row[col_idx]) if col_idx < len(row) else 0.0
            actual_data[name][date_label] = clean_num(row[col_idx + 1]) if col_idx + 1 < len(row) else 0.0

    return plan_data, actual_data, [d for d, _ in date_cols]


def read_headcount_data(sheet_id: str, min_date: Optional[datetime] = None):
    """Read official headcount from Одам сони sheet."""
    rows = _fetch_sheet_rows(sheet_id, "Одам сони", unformatted=True)

    date_row = rows[51]
    data_rows = rows[52:]

    date_cols = []
    for i, val in enumerate(date_row):
        if not str(val).strip() or i < 3:
            continue
        label = serial_to_date(val)
        if label is None:
            continue
        if min_date:
            try:
                if datetime.strptime(label, "%d.%m.%Y") < min_date:
                    continue
            except Exception:
                pass
        date_cols.append((label, i))

    hc_data: dict[str, dict[str, float]] = {}
    started = False
    for row in data_rows:
        if not row or not str(row[0]).strip():
            if started:
                break
            continue
        started = True
        name = str(row[0]).strip()
        hc_data[name] = {}
        for date_label, col_idx in date_cols:
            hc_data[name][date_label] = clean_num(row[col_idx]) if col_idx < len(row) else 0.0

    return hc_data, [d for d, _ in date_cols]


def _leader_parse_date(val) -> Optional[str]:
    """Normalize a leaders-sheet date cell to ISO 'YYYY-MM-DD'. Handles the
    common display formats plus a raw serial-number fallback."""
    s = str(val).strip()
    if not s:
        return None
    # Already ISO-ish (Apps Script sliced the first 10 chars of an ISO string).
    head = s[:10]
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(head, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Raw Google Sheets serial number.
    try:
        n = float(s)
        if n > 30000:  # ~ year 1982+, i.e. a plausible date serial, not a count
            return (datetime(1899, 12, 30) + timedelta(days=int(n))).strftime("%Y-%m-%d")
    except ValueError:
        pass
    return None


def _leader_parse_pct(val) -> float:
    """Parse a completion cell to a 0–100 number. A 0–1 fraction is scaled ×100,
    matching getDashboardData() in apps-script/Code.gs."""
    s = str(val).replace("%", "").replace("\xa0", "").replace(" ", "").replace(",", ".").strip()
    try:
        v = float(s)
    except ValueError:
        return 0.0
    if 0 < v <= 1:
        v *= 100
    return round(v, 2)


_LEADER_DONE_TOKENS = {"ҳа", "ha", "yes", "true", "1", "да", "✓", "✔"}


def read_leader_data(sheet_id: str, tab: str = "Data") -> list[dict]:
    """Read the leaders checklist sheet using the fixed layout from
    apps-script/Code.gs (0-indexed, header row dropped):

        col 2  (C)      = date
        col 3  (D)      = brigadir / supervisor
        cols 4–15 (E–P) = leader name (first non-empty wins)
        cols 16–51      = 12 tasks × 3  (done, photo, reason)
        col 52 (BA)     = completion %

    Returns one dict per submission row: {date, supervisor, leader,
    completion, tasks:[{id, done, photo, reason}]}.
    """
    try:
        gc = get_client()
        sh = gc.open_by_key(sheet_id)
        try:
            ws = sh.worksheet(tab)
        except Exception:
            ws = sh.get_worksheet(0)  # fall back to the first sheet, like the script
        rows = ws.get_all_values()
    except Exception:
        _reset_client()
        raise

    if rows:
        rows = rows[1:]  # drop the header row

    DATE_COL, SUP_COL = 2, 3
    LEADER_COLS = range(4, 16)
    TASK_START, TASK_COUNT = 16, 12
    COMPLETION_COL = 52

    def cell(row, i):
        return str(row[i]).strip() if i < len(row) else ""

    out: list[dict] = []
    for row in rows:
        # Skip blank rows (Code.gs: skip when col 0 and date are both empty).
        if not (cell(row, 0) or cell(row, DATE_COL)):
            continue
        date_str = _leader_parse_date(cell(row, DATE_COL))
        if not date_str:
            continue

        supervisor = cell(row, SUP_COL) or "N/A"
        leader = "N/A"
        for c in LEADER_COLS:
            v = cell(row, c)
            if v:
                leader = v
                break

        completion = _leader_parse_pct(cell(row, COMPLETION_COL))

        tasks = []
        for i in range(TASK_COUNT):
            base = TASK_START + i * 3
            done_raw = cell(row, base)
            tasks.append({
                "id": i + 1,
                "done": done_raw.lower() in _LEADER_DONE_TOKENS,
                "photo": cell(row, base + 1),
                "reason": cell(row, base + 2),
            })

        out.append({
            "date": date_str,
            "supervisor": supervisor,
            "leader": leader,
            "completion": completion,
            "tasks": tasks,
        })

    return out


def read_downtime_data(sheet_id: str, manager_names: set[str], min_date: Optional[datetime] = None):
    """Read equipment downtime from shift report Sheet1."""
    rows = _fetch_sheet_rows(sheet_id, "Sheet1", unformatted=False)

    cat_names = [c for c, _ in SHIFT_CATEGORIES]
    downtime_total: dict[str, dict[str, float]] = {}
    downtime_by_cat: dict[str, dict[str, dict[str, float]]] = {}

    for row in rows[1:]:
        if not row or not row[3].strip():
            continue
        name = row[3].strip()
        if name not in manager_names:
            continue
        date_raw = row[2].strip()
        if not date_raw:
            continue
        try:
            d = datetime.strptime(date_raw, "%Y-%m-%d")
            if min_date and d < min_date:
                continue
            date_label = d.strftime("%d.%m.%Y")
        except Exception:
            continue

        downtime_total.setdefault(name, {})
        downtime_total[name].setdefault(date_label, 0.0)
        downtime_by_cat.setdefault(name, {})
        downtime_by_cat[name].setdefault(date_label, {c: 0.0 for c in cat_names})

        for cat_name, col_idx in SHIFT_CATEGORIES:
            if col_idx < len(row) and row[col_idx].strip():
                try:
                    val = float(row[col_idx])
                    downtime_total[name][date_label] += val
                    downtime_by_cat[name][date_label][cat_name] += val
                except ValueError:
                    pass

    return downtime_total, downtime_by_cat, cat_names
