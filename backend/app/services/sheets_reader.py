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
