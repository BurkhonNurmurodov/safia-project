#!/usr/bin/env python3
import os
import re
import warnings
import gspread
import pandas as pd
from google.oauth2.service_account import Credentials
from datetime import datetime

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

VERIFIX_DIR = "verifix"
SHEET_ID = "1-t-4Qr3AumgePNz5O3qyzge1TA5OxjDBhahvKh76rnI"
SOURCE_SHEET_ID = "1q-4PTcnGNNsGzXmXAIa5HE2Ze0f6hQ-7dKagvHSH2eI"
SHIFT_SHEET_ID = "1qCntFNUhy5GdSHhByK5gtVd9T8hqp6Dn4oPbrCujZQ8"
CREDENTIALS_FILE = "safia-project-bea00b0b2514.json"
LOG_FILE = "verifix_run.log"

# Output sheet names
SH_ATTENDANCE       = "Attendance"
SH_LABOR_HOURS      = "Total Labor Hours"
SH_WORKER_COUNT     = "Worker Count"
SH_EFFECTIVE_HOURS  = "Effective Labor Hours"
SH_PROD_PLAN        = "Production Plan"
SH_PROD_ACTUAL      = "Production Actual"
SH_HEADCOUNT        = "Official Headcount"
SH_DOWNTIME         = "Equipment Downtime"
SH_DOWNTIME_DETAIL  = "Downtime by Category"
SH_LOAD_ANALYSIS    = "Load Analysis"

# Old sheet names (pre-rename) — used for migration only
_OLD_NAMES = {
    "Summary":       SH_LABOR_HOURS,
    "People Count":  SH_WORKER_COUNT,
    "Actual Summary":SH_EFFECTIVE_HOURS,
    "plan":          SH_PROD_PLAN,
    "fakt":          SH_PROD_ACTUAL,
    "Одам сони":     SH_HEADCOUNT,
    "Shift report":  SH_DOWNTIME,
    "Final Result":  SH_LOAD_ANALYSIS,
}

# Equipment-stop column indices in the shift report (0-based), categories A–G only
SHIFT_CATEGORIES = [
    ("Cat A",  424), ("Cat B",  426), ("Cat C",  428),
    ("Cat D",  430), ("Cat D2", 432), ("Cat D3", 434),
    ("Cat E",  436), ("Cat F",  438), ("Cat G",  440),
]

# Verifix file columns (internal names used for DataFrame access — not the sheet headers)
_DF_COLS = ["fio", "dolzhnost", "grafik_raboty", "ish_vaqti", "otrabotano"]
ALLOWED_ROLES = {"Заготовитель продуктов и сырья", "Фасовщик"}

# Headers written to the Attendance sheet
ATTENDANCE_HEADERS = [
    "Manager ID", "Date",
    "Worker", "Job Title", "Schedule", "Clock In/Out",
    "Hours Worked", "Early Arrival (min)", "Effective Hours",
]


def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def to_minutes(time_str):
    try:
        h, m = time_str.strip().replace("-", ":").split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def calc_early_arrival(schedule, clock_in_out):
    """Return minutes the worker arrived before their scheduled start time."""
    try:
        scheduled_start = schedule.split("до")[0].strip()
        actual_start    = clock_in_out.split("-")[0].strip()
        sched  = to_minutes(scheduled_start)
        actual = to_minutes(actual_start)
        if sched is None or actual is None:
            return 0
        return max(0, sched - actual)
    except Exception:
        return 0


def parse_filename(filename):
    match = re.match(r"^(\d+)_(.+)\.xlsx$", filename)
    if match:
        return int(match.group(1)), match.group(2)
    return None, None


def load_excel(filepath):
    """Read one verifix file, filter by role, compute early arrival and effective hours."""
    try:
        df = pd.read_excel(filepath, header=None, skiprows=6, usecols=[1, 2, 3, 4, 6],
                           names=_DF_COLS, engine="calamine")
    except Exception:
        df = pd.read_excel(filepath, header=None, skiprows=6, usecols=[1, 2, 3, 4, 6],
                           names=_DF_COLS, engine="openpyxl")

    records = []
    for _, row in df.iterrows():
        worker      = str(row["fio"]).strip()          if pd.notna(row["fio"])          else ""
        job_title   = str(row["dolzhnost"]).strip()    if pd.notna(row["dolzhnost"])    else ""
        schedule    = str(row["grafik_raboty"]).strip()if pd.notna(row["grafik_raboty"])else ""
        clock_inout = str(row["ish_vaqti"]).strip()    if pd.notna(row["ish_vaqti"])    else ""
        hours_worked= str(row["otrabotano"]).strip()   if pd.notna(row["otrabotano"])   else ""

        if not hours_worked or hours_worked in ("nan", "NaN"):
            continue

        role_ok = (not job_title or job_title in ("nan", "NaN")
                   or job_title in ALLOWED_ROLES
                   or job_title.startswith("Кондитер"))
        if not role_ok:
            continue

        early_min = calc_early_arrival(schedule, clock_inout)
        try:
            effective_hours = round(float(hours_worked) - early_min / 60, 2)
        except (ValueError, TypeError):
            effective_hours = ""

        records.append([worker, job_title, schedule, clock_inout,
                        hours_worked, early_min, effective_hours])
    return records


def get_or_create(sh, title, rows=1000, cols=50):
    """Return existing worksheet by title, or create a new one."""
    titles = [s.title for s in sh.worksheets()]
    if title in titles:
        return sh.worksheet(title)
    return sh.add_worksheet(title=title, rows=rows, cols=cols)


def main():
    open(LOG_FILE, "w").close()

    # ── Step 1: Read all verifix Excel files ──────────────────────────────────
    log("Step 1: Reading verifix attendance files...")
    files = sorted(f for f in os.listdir(VERIFIX_DIR) if f.endswith(".xlsx"))

    all_records = []
    for i, filename in enumerate(files, 1):
        mgr_id, file_date = parse_filename(filename)
        if mgr_id is None:
            continue
        rows = load_excel(os.path.join(VERIFIX_DIR, filename))
        all_records.extend([[mgr_id, file_date] + row for row in rows])
        log(f"  [{i}/{len(files)}] {filename} — {len(rows)} rows")
    log(f"  Total: {len(all_records)} rows collected.")

    parsed_dates = []
    for row in all_records:
        try:
            parsed_dates.append(datetime.strptime(row[1], "%d.%m.%Y"))
        except Exception:
            pass
    min_verifix_date = min(parsed_dates) if parsed_dates else None
    if min_verifix_date:
        log(f"  Earliest date in verifix files: {min_verifix_date.strftime('%d.%m.%Y')}")

    # ── Step 2: Connect to Google Sheets ─────────────────────────────────────
    log("Step 2: Connecting to Google Sheets...")
    creds = Credentials.from_service_account_file(
        CREDENTIALS_FILE,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)

    # Migrate any old sheet names to new ones
    existing_titles = [s.title for s in sh.worksheets()]
    for old, new in _OLD_NAMES.items():
        if old in existing_titles and new not in existing_titles:
            sh.worksheet(old).update_title(new)
            log(f"  Renamed sheet '{old}' → '{new}'")

    # Rename Sheet1 → Attendance if needed
    ws_attendance = sh.sheet1
    if ws_attendance.title != SH_ATTENDANCE:
        ws_attendance.update_title(SH_ATTENDANCE)
        log(f"  Renamed sheet '{ws_attendance.title}' → '{SH_ATTENDANCE}'")
    log("  Connected.")

    # ── Step 3: Upload raw attendance to Attendance sheet ────────────────────
    log(f"Step 3: Uploading attendance data...")
    all_data = [ATTENDANCE_HEADERS] + all_records
    ws_attendance.clear()
    ws_attendance.update(all_data, value_input_option="RAW")
    log(f"  Done — {len(all_records)} rows written to '{SH_ATTENDANCE}'.")

    # ── Step 4: Total Labor Hours (sum of hours worked per manager per date) ─
    log(f"Step 4: Building '{SH_LABOR_HOURS}' sheet...")
    ws_managers = sh.worksheet("Managers")
    manager_map = {row[0]: row[1] for row in ws_managers.get_all_values()[1:] if len(row) >= 2}

    labor_hours = {}   # {manager_id: {date: total_hours}}
    for row in all_records:
        mgr_id, date = row[0], row[1]
        try:
            hrs = float(row[6])   # Hours Worked column
        except (ValueError, TypeError):
            hrs = 0
        labor_hours.setdefault(mgr_id, {})
        labor_hours[mgr_id][date] = labor_hours[mgr_id].get(date, 0) + hrs

    all_dates    = sorted({d for dates in labor_hours.values() for d in dates})
    all_managers = sorted(m for m in labor_hours.keys() if str(m) in manager_map)

    labor_rows = [["Manager"] + all_dates]
    for mgr_id in all_managers:
        name = manager_map.get(str(mgr_id), str(mgr_id))
        labor_rows.append([name] + [round(labor_hours[mgr_id].get(d, 0), 2) for d in all_dates])

    ws_labor = get_or_create(sh, SH_LABOR_HOURS, rows=1000, cols=len(all_dates) + 2)
    ws_labor.clear()
    ws_labor.update(labor_rows, value_input_option="RAW")
    log(f"  Done — {len(labor_rows) - 1} managers written to '{SH_LABOR_HOURS}'.")

    # ── Step 4b: Worker Count (non-empty worker rows per manager per date) ───
    log(f"Step 4b: Building '{SH_WORKER_COUNT}' sheet...")
    worker_count = {}  # {manager_id: {date: count}}
    for row in all_records:
        mgr_id, date = row[0], row[1]
        worker = row[2]
        if str(mgr_id) not in manager_map:
            continue
        if not worker or worker in ("nan", "NaN"):
            continue   # skip totals-only rows with no named worker
        worker_count.setdefault(mgr_id, {})
        worker_count[mgr_id][date] = worker_count[mgr_id].get(date, 0) + 1

    count_rows = [["Manager"] + all_dates]
    for mgr_id in all_managers:
        name = manager_map.get(str(mgr_id), str(mgr_id))
        count_rows.append([name] + [worker_count.get(mgr_id, {}).get(d, 0) for d in all_dates])

    ws_count = get_or_create(sh, SH_WORKER_COUNT, rows=1000, cols=len(all_dates) + 2)
    ws_count.clear()
    ws_count.update(count_rows, value_input_option="RAW")
    log(f"  Done — {len(count_rows) - 1} managers written to '{SH_WORKER_COUNT}'.")

    # ── Step 5: Effective Labor Hours (hours worked minus early arrival) ──────
    log(f"Step 5: Building '{SH_EFFECTIVE_HOURS}' sheet...")
    eff_hours = {}   # {manager_id: {date: total_effective_hours}}
    for row in all_records:
        mgr_id, date = row[0], row[1]
        try:
            eh = float(row[8])   # Effective Hours column
        except (ValueError, TypeError):
            eh = 0
        eff_hours.setdefault(mgr_id, {})
        eff_hours[mgr_id][date] = eff_hours[mgr_id].get(date, 0) + eh

    eff_rows = [["Manager"] + all_dates]
    for mgr_id in all_managers:
        name = manager_map.get(str(mgr_id), str(mgr_id))
        eff_rows.append([name] + [round(eff_hours[mgr_id].get(d, 0), 2) for d in all_dates])

    ws_eff = get_or_create(sh, SH_EFFECTIVE_HOURS, rows=1000, cols=len(all_dates) + 2)
    ws_eff.clear()
    ws_eff.update(eff_rows, value_input_option="RAW")
    log(f"  Done — {len(eff_rows) - 1} managers written to '{SH_EFFECTIVE_HOURS}'.")

    # ── Step 6: Production Plan & Production Actual (from Минут source sheet) ─
    log("Step 6: Reading production plan/actual from source sheet (Минут)...")
    src_sh    = gc.open_by_key(SOURCE_SHEET_ID)
    ws_minut  = src_sh.worksheet("Минут")
    minut_rows= ws_minut.get_all_values(value_render_option='UNFORMATTED_VALUE')

    date_row  = minut_rows[51]   # row 52 — dates as serial numbers
    data_rows = minut_rows[53:]  # row 54 onwards — manager rows

    def serial_to_date(val):
        try:
            n = int(float(val))
            from datetime import timedelta
            d = datetime(1899, 12, 30) + timedelta(days=n)
            return d.strftime("%d.%m.%Y")
        except Exception:
            return str(val).strip()

    def clean_num(val):
        if isinstance(val, (int, float)):
            return float(val)
        v = str(val).replace('\xa0', '').replace(' ', '').strip()
        try:
            return float(v)
        except ValueError:
            return 0

    # Parse date columns, skip dates before our verifix data starts
    prod_date_cols = []
    for i, val in enumerate(date_row):
        if not str(val).strip():
            continue
        label = serial_to_date(val)
        if min_verifix_date:
            try:
                if datetime.strptime(label, "%d.%m.%Y") < min_verifix_date:
                    continue
            except Exception:
                pass
        prod_date_cols.append((label, i))

    plan_data = {}   # {manager_name: {date: minutes}}
    actual_data = {}

    started = False
    for row in data_rows:
        if not row or not row[0].strip():
            if started:
                break   # stop at first blank row — avoids second section of the sheet
            continue
        started = True
        name = row[0].strip()
        plan_data[name]   = {}
        actual_data[name] = {}
        for date_label, col_idx in prod_date_cols:
            plan_data[name][date_label]   = clean_num(row[col_idx])     if col_idx     < len(row) else 0
            actual_data[name][date_label] = clean_num(row[col_idx + 1]) if col_idx + 1 < len(row) else 0

    prod_dates       = [d for d, _ in prod_date_cols]
    manager_names    = set(manager_map.values())
    all_prod_managers= [m for m in plan_data if m in manager_names]

    existing_sheets = [s.title for s in sh.worksheets()]
    for sheet_title, data in [(SH_PROD_PLAN, plan_data), (SH_PROD_ACTUAL, actual_data)]:
        pivot_rows = [["Manager"] + prod_dates]
        for name in all_prod_managers:
            pivot_rows.append([name] + [data[name].get(d, 0) for d in prod_dates])
        log(f"  {sheet_title}: first manager first value = "
            f"{pivot_rows[1][1] if len(pivot_rows) > 1 else 'N/A'}")
        ws_out = get_or_create(sh, sheet_title, rows=len(pivot_rows) + 5, cols=len(prod_dates) + 2)
        ws_out.clear()
        ws_out.update(pivot_rows, value_input_option="RAW")
        log(f"  Done — {len(pivot_rows) - 1} managers written to '{sheet_title}'.")

    # ── Step 7: Official Headcount (from Одам сони source sheet) ─────────────
    log(f"Step 7: Reading official headcount from source sheet (Одам сони)...")
    ws_src_headcount = src_sh.worksheet("Одам сони")
    hc_rows = ws_src_headcount.get_all_values(value_render_option='UNFORMATTED_VALUE')

    hc_date_row  = hc_rows[51]   # row 52 — dates
    hc_data_rows = hc_rows[52:]  # row 53 onwards

    hc_date_cols = []
    for i, val in enumerate(hc_date_row):
        if not str(val).strip() or i < 3:
            continue
        label = serial_to_date(val)
        if min_verifix_date:
            try:
                if datetime.strptime(label, "%d.%m.%Y") < min_verifix_date:
                    continue
            except Exception:
                pass
        hc_date_cols.append((label, i))

    headcount_data = {}   # {manager_name: {date: count}}
    started = False
    for row in hc_data_rows:
        if not row or not str(row[0]).strip():
            if started:
                break
            continue
        started = True
        name = str(row[0]).strip()
        headcount_data[name] = {}
        for date_label, col_idx in hc_date_cols:
            headcount_data[name][date_label] = clean_num(row[col_idx]) if col_idx < len(row) else 0

    hc_dates       = [d for d, _ in hc_date_cols]
    all_hc_managers= [m for m in headcount_data if m in all_prod_managers]

    hc_out_rows = [["Manager"] + hc_dates]
    for name in all_hc_managers:
        hc_out_rows.append([name] + [headcount_data[name].get(d, 0) for d in hc_dates])

    ws_hc = get_or_create(sh, SH_HEADCOUNT, rows=len(hc_out_rows) + 5, cols=len(hc_dates) + 2)
    ws_hc.clear()
    ws_hc.update(hc_out_rows, value_input_option="RAW")
    log(f"  Done — {len(hc_out_rows) - 1} managers, {len(hc_dates)} dates written to '{SH_HEADCOUNT}'.")

    # ── Step 8: Equipment Downtime (from shift report — Cat A–G stopped time) ─
    log(f"Step 8: Reading equipment downtime from shift report...")
    sh3      = gc.open_by_key(SHIFT_SHEET_ID)
    ws_shift = sh3.worksheet("Sheet1")
    shift_rows = ws_shift.get_all_values()

    cat_names = [cat for cat, _ in SHIFT_CATEGORIES]

    downtime_data     = {}   # {manager_name: {date: total}}
    downtime_by_cat   = {}   # {manager_name: {date: {cat_name: value}}}

    for row in shift_rows[1:]:
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
            if min_verifix_date and d < min_verifix_date:
                continue
            date_label = d.strftime("%d.%m.%Y")
        except Exception:
            continue

        downtime_data.setdefault(name, {})
        downtime_data[name].setdefault(date_label, 0)
        downtime_by_cat.setdefault(name, {})
        downtime_by_cat[name].setdefault(date_label, {cat: 0 for cat in cat_names})

        for cat_name, col_idx in SHIFT_CATEGORIES:
            if col_idx < len(row) and row[col_idx].strip():
                try:
                    val = float(row[col_idx])
                    downtime_data[name][date_label] += val
                    downtime_by_cat[name][date_label][cat_name] += val
                except ValueError:
                    pass

    all_downtime_dates = sorted({d for m in downtime_data.values() for d in m},
                                 key=lambda s: datetime.strptime(s, "%d.%m.%Y"))
    downtime_managers  = [m for m in all_prod_managers if m in downtime_data]

    # Equipment Downtime — pivot: manager × date, values = total stopped minutes
    dt_out_rows = [["Manager"] + all_downtime_dates]
    for name in downtime_managers:
        dt_out_rows.append([name] + [round(downtime_data[name].get(d, 0), 2)
                                     for d in all_downtime_dates])

    ws_dt = get_or_create(sh, SH_DOWNTIME, rows=len(dt_out_rows) + 5,
                          cols=len(all_downtime_dates) + 2)
    ws_dt.clear()
    ws_dt.update(dt_out_rows, value_input_option="RAW")
    log(f"  Done — {len(dt_out_rows) - 1} managers written to '{SH_DOWNTIME}'.")

    # Downtime by Category — long format: Date | Manager | Category | Value
    detail_headers = ["Date", "Manager", "Category", "Downtime (min)"]
    detail_rows    = [detail_headers]
    for date in all_downtime_dates:
        for name in downtime_managers:
            cats = downtime_by_cat.get(name, {}).get(date, {})
            for cat in cat_names:
                detail_rows.append(
                    [date, name, cat, round(cats.get(cat, 0), 2)]
                )

    ws_detail = get_or_create(sh, SH_DOWNTIME_DETAIL,
                              rows=len(detail_rows) + 5, cols=len(detail_headers) + 1)
    ws_detail.clear()
    ws_detail.update(detail_rows, value_input_option="RAW")
    log(f"  Done — {len(detail_rows) - 1} rows written to '{SH_DOWNTIME_DETAIL}'.")

    # ── Step 9: Load Analysis — one row per manager per date ─────────────────
    log(f"Step 9: Building '{SH_LOAD_ANALYSIS}' sheet (all dates)...")
    # Use every date present in our verifix files, sorted chronologically
    all_analysis_dates = sorted(all_dates, key=lambda s: datetime.strptime(s, "%d.%m.%Y"))
    name_to_id  = {v: k for k, v in manager_map.items()}

    # Shift number per manager (hardcoded from Brigadir data)
    SHIFT_MAP = {
        "Арипова Манзура": 1,      "Артикова Масуда": 1,    "Абдукаримов Санжар": 1,
        "Хакимов Руслан": 1,       "Абдугамитов Мухаммад": 1, "Сувонов Элшод": 1,
        "Султонова Умида": 1,      "Максумов Санжар": 1,    "Мирмахмудова Мунира": 1,
        "Рахимова Камола": 1,      "Талипова Мамура": 1,
        "Эргашев Мухриддин": 2,   "Олишев Ислом": 2,       "Файзуллаева Малика": 2,
        "Ёгмиров Феруз": 2,        "Ибрагимова Сайёра": 2,  "Камолова Наргиза": 2,
        "Акбаров Турсунали": 2,   "Уразов Аскар": 2,
    }

    # Pre-compute total early-arrival minutes per (manager_id, date)
    early_arrival_sum = {}
    for row in all_records:
        mgr_id, date = row[0], row[1]
        if str(mgr_id) not in manager_map:
            continue
        try:
            em = float(row[7])   # Early Arrival (min) column
        except (ValueError, TypeError):
            em = 0
        early_arrival_sum.setdefault(mgr_id, {})
        early_arrival_sum[mgr_id][date] = early_arrival_sum[mgr_id].get(date, 0) + em

    load_data = []
    for date in all_analysis_dates:
        for name in all_prod_managers:
            prod_plan   = plan_data.get(name, {}).get(date, 0)
            prod_actual = actual_data.get(name, {}).get(date, 0)
            shift       = SHIFT_MAP.get(name, "")

            mgr_id_str = name_to_id.get(name)
            mgr_id_int = int(mgr_id_str) if mgr_id_str else None

            # Verifix Labor = sum(hours worked) × 60 × 0.85  [minutes]
            verifix_labor = round(
                labor_hours.get(mgr_id_int, {}).get(date, 0) * 60 * 0.85, 2
            ) if mgr_id_int else 0

            # Labor Surplus = (verifix_labor − prod_actual) / 60 / (8 × prod_actual/prod_plan)
            # Tells us how many extra/fewer person-days verifix implies vs production actual
            try:
                labor_surplus = round(
                    (verifix_labor - prod_actual) / 60 / (8 * (prod_actual / prod_plan)), 4)
            except (ZeroDivisionError, TypeError):
                labor_surplus = ""
            surplus_val = labor_surplus if isinstance(labor_surplus, (int, float)) else 0

            # Official Headcount — from the source headcount sheet
            official_hc = headcount_data.get(name, {}).get(date, 0)

            # Verifix Headcount — non-empty named worker rows in verifix files
            verifix_hc = worker_count.get(mgr_id_int, {}).get(date, 0) if mgr_id_int else 0

            # Effective headcount = official headcount + verifix labor surplus
            eff_hc = surplus_val + official_hc

            # Baseline Utilization = prod_actual / (480 × official_hc × prod_actual/prod_plan)
            try:
                baseline_util = round(
                    prod_actual / (480 * official_hc * (prod_actual / prod_plan)), 4)
            except (ZeroDivisionError, TypeError):
                baseline_util = ""

            # Adjusted Utilization = prod_actual / (480 × eff_hc × prod_actual/prod_plan)
            try:
                adjusted_util = round(
                    prod_actual / (480 * eff_hc * (prod_actual / prod_plan)), 4)
            except (ZeroDivisionError, TypeError):
                adjusted_util = ""

            # Equipment Downtime (min)
            equip_downtime = downtime_data.get(name, {}).get(date, 0)

            # Utilization excl. Downtime
            try:
                util_excl_downtime = round(
                    prod_actual / (eff_hc * (480 * (prod_actual / prod_plan) - equip_downtime)), 4)
            except (ZeroDivisionError, TypeError):
                util_excl_downtime = ""

            # Avg Early Arrival [min/person]
            ea_total = early_arrival_sum.get(mgr_id_int, {}).get(date, 0) if mgr_id_int else 0
            try:
                avg_early_arrival = round(ea_total / official_hc, 2) if official_hc else 0
            except (ZeroDivisionError, TypeError):
                avg_early_arrival = 0

            # Utilization excl. Downtime & Early
            try:
                util_excl_dt_early = round(
                    prod_actual / (eff_hc * (480 * (prod_actual / prod_plan)
                                             - equip_downtime - avg_early_arrival)), 4)
            except (ZeroDivisionError, TypeError):
                util_excl_dt_early = ""

            kaizen_buffer = 10

            # Net Utilization (all loss sources removed)
            try:
                net_util = round(
                    prod_actual / (eff_hc * (480 * (prod_actual / prod_plan)
                                              - equip_downtime - avg_early_arrival - 10)), 4)
            except (ZeroDivisionError, TypeError):
                net_util = ""

            try:
                gap_baseline_vs_adjusted = round(baseline_util - adjusted_util, 4)
            except TypeError:
                gap_baseline_vs_adjusted = ""

            try:
                gap_baseline_vs_excl_dt = round(baseline_util - util_excl_downtime, 4)
            except TypeError:
                gap_baseline_vs_excl_dt = ""

            try:
                gap_baseline_vs_net = round(baseline_util - net_util, 4)
            except TypeError:
                gap_baseline_vs_net = ""

            try:
                final_net_util = round(baseline_util - gap_baseline_vs_net, 4)
            except TypeError:
                final_net_util = ""

            load_data.append([
                date, name, shift, prod_plan, prod_actual, verifix_labor,   # A B C D E F
                labor_surplus, official_hc, verifix_hc,                     # G H I
                baseline_util, adjusted_util,                                # J K  (%)
                util_excl_downtime,                                          # L    (%)
                avg_early_arrival,                                           # M
                util_excl_dt_early,                                          # N    (%)
                kaizen_buffer,                                               # O
                net_util,                                                    # P    (%)
                gap_baseline_vs_adjusted,                                    # Q    (%)
                equip_downtime,                                              # R
                gap_baseline_vs_excl_dt,                                     # S    (%)
                gap_baseline_vs_net,                                         # T    (%)
                final_net_util,                                              # U    (%)
            ])

    load_headers = [
        "Date",                                    # A
        "Manager",                                 # B
        "Shift",                                   # C
        "Production Plan (min)",                   # D
        "Production Actual (min)",                 # E
        "Verifix Labor (min)",                     # F
        "Labor Surplus (persons)",                 # G
        "Official Headcount",                      # H
        "Verifix Headcount",                       # I
        "Baseline Utilization %",                  # J (%)
        "Adjusted Utilization %",                  # K (%)
        "Utilization excl. Downtime %",            # L (%)
        "Avg Early Arrival (min/person)",           # M
        "Utilization excl. Downtime & Early %",    # N (%)
        "Kaizen Buffer (min)",                     # O
        "Net Utilization %",                       # P (%)
        "Gap: Baseline vs Adjusted %",             # Q (%)
        "Equipment Downtime (min)",                # R
        "Gap: Baseline vs excl. Downtime %",       # S (%)
        "Gap: Baseline vs Net %",                  # T (%)
        "Final Net Utilization %",                 # U (%)
    ]
    load_rows = [load_headers] + load_data

    # Delete and recreate to ensure no stale formatting
    existing_sheets = [s.title for s in sh.worksheets()]
    if SH_LOAD_ANALYSIS in existing_sheets:
        sh.del_worksheet(sh.worksheet(SH_LOAD_ANALYSIS))
        log(f"  Deleted old '{SH_LOAD_ANALYSIS}' sheet.")
    ws_load = sh.add_worksheet(title=SH_LOAD_ANALYSIS, rows=len(load_rows) + 5, cols=25)
    log(f"  Created fresh '{SH_LOAD_ANALYSIS}' sheet.")
    ws_load.update(load_rows, value_input_option="RAW")

    n = len(load_rows)
    pct_fmt   = {"numberFormat": {"type": "PERCENT", "pattern": "0.00%"}}
    plain_fmt = {"numberFormat": {"type": "NUMBER",  "pattern": "0"}}
    for col in ["J", "K", "L", "N", "P", "Q", "S", "T", "U"]:
        ws_load.format(f"{col}2:{col}{n}", pct_fmt)
    ws_load.format(f"H2:I{n}", plain_fmt)   # headcount columns — plain integers

    log(f"  Done — {len(load_data)} rows written to '{SH_LOAD_ANALYSIS}' "
        f"({len(all_analysis_dates)} dates × {len(all_prod_managers)} managers).")
    log("All done.")


if __name__ == "__main__":
    main()
