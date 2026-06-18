import re
import warnings
from io import BytesIO
from datetime import datetime

# pandas / numpy are NOT imported at module level — doing so triggers OpenBLAS
# thread-pool initialisation on every Passenger worker spawn, which exhausts
# the server's RLIMIT_NPROC and crashes the worker.  Import lazily inside the
# function that actually needs it.

ALLOWED_ROLES = {"Заготовитель продуктов и сырья", "Фасовщик"}
_DF_COLS = ["fio", "dolzhnost", "grafik_raboty", "ish_vaqti", "otrabotano"]


def parse_filename(filename: str):
    match = re.match(r"^(\d+)_(.+)\.xlsx$", filename)
    if match:
        return int(match.group(1)), match.group(2)
    return None, None


def to_minutes(time_str: str):
    try:
        h, m = time_str.strip().replace("-", ":").split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def calc_early_arrival(schedule: str, clock_in_out: str) -> float:
    try:
        scheduled_start = schedule.split("до")[0].strip()
        actual_start = clock_in_out.split("-")[0].strip()
        sched = to_minutes(scheduled_start)
        actual = to_minutes(actual_start)
        if sched is None or actual is None:
            return 0.0
        return max(0.0, float(sched - actual))
    except Exception:
        return 0.0


def parse_verifix_file(content: bytes, filename: str):
    """Parse one verifix xlsx file. Returns (manager_id, date_str, rows)."""
    import pandas as pd  # lazy import — avoids OpenBLAS crash at worker startup
    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

    manager_id, file_date = parse_filename(filename)
    if manager_id is None:
        return None, None, []

    df = pd.read_excel(BytesIO(content), header=None, skiprows=6,
                       usecols=[1, 2, 3, 4, 6], names=_DF_COLS, engine="openpyxl")

    records = []
    for _, row in df.iterrows():
        worker    = str(row["fio"]).strip()               if pd.notna(row["fio"])         else ""
        hours_raw = str(row["otrabotano"]).strip()        if pd.notna(row["otrabotano"])  else ""

        worker_empty = not worker or worker in ("nan", "NaN")
        hours_empty  = not hours_raw or hours_raw in ("nan", "NaN")

        # Skip only if BOTH worker name and hours_worked are empty
        if worker_empty and hours_empty:
            continue

        job_title    = str(row["dolzhnost"]).strip()    if pd.notna(row["dolzhnost"])    else ""
        schedule     = str(row["grafik_raboty"]).strip() if pd.notna(row["grafik_raboty"]) else ""
        clock_inout  = str(row["ish_vaqti"]).strip()    if pd.notna(row["ish_vaqti"])    else ""

        try:
            hours_worked = float(hours_raw) if hours_raw and hours_raw not in ("nan", "NaN") else None
        except (ValueError, TypeError):
            hours_worked = None

        early_min = calc_early_arrival(schedule, clock_inout)

        try:
            effective_hours = round(hours_worked - early_min / 60, 4) if hours_worked is not None else None
        except (TypeError, ValueError):
            effective_hours = None

        records.append({
            "worker_name":      worker,
            "job_title":        job_title if job_title not in ("nan", "NaN") else "",
            "schedule":         schedule  if schedule  not in ("nan", "NaN") else "",
            "clock_in_out":     clock_inout if clock_inout not in ("nan", "NaN") else "",
            "hours_worked":     hours_worked,
            "early_arrival_min": early_min,
            "effective_hours":  effective_hours,
        })

    # Parse date
    try:
        parsed_date = datetime.strptime(file_date, "%d.%m.%Y").date()
    except ValueError:
        parsed_date = None

    return manager_id, parsed_date, records
