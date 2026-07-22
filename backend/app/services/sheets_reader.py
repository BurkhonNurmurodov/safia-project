from datetime import datetime, timedelta
from typing import NamedTuple, Optional
import re
import gspread
from google.oauth2.service_account import Credentials
from app.config import settings

_gc: Optional[gspread.Client] = None

# Shift-report waiting-time columns, 0-based (PI, PK, PM, PO, PQ, PS, PU, PW, PY).
#
# The form stores every category as a PAIR of adjacent columns — «Ячейка
# тўхтаганда» (the wait stopped the cell) and «Ячейка тўхтамаганда» (it did
# not). Ojidaniya deliberately counts ONLY the «тўхтаганда» half, which is why
# these step by 2 and each pair's second column is never read: the page measures
# waiting that actually halted the cell, not every wait the brigadir logged.
# Confirmed intentional 2026-07-22 — do NOT "fix" this by adding the odd indices.
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


def get_service_account_email() -> Optional[str]:
    """The service account address that must be granted access to every source
    sheet. Derived from the same credentials file used to authorize gspread, so
    it always matches the account actually doing the reading."""
    try:
        creds = Credentials.from_service_account_file(
            settings.google_credentials_file,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        email = getattr(creds, "service_account_email", None)
        if email:
            return email
    except Exception:
        pass
    # Fallback: read client_email straight from the JSON.
    try:
        import json
        with open(settings.google_credentials_file) as f:
            return json.load(f).get("client_email")
    except Exception:
        return None


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


def _leader_parse_dt(val) -> Optional[datetime]:
    """Parse the form's «Submission time» cell into a naive datetime. The export
    does not zero-pad the hour ("2026-04-08 7:22:58"), which %H accepts."""
    s = str(val).strip().replace("T", " ")
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    try:  # raw Google Sheets serial — the fraction carries the time of day
        n = float(s)
        if n > 30000:
            return datetime(1899, 12, 30) + timedelta(days=n)
    except ValueError:
        pass
    return None


_LEADER_DONE_TOKENS = {"ҳа", "ha", "yes", "true", "1", "да", "✓", "✔"}

# Header labels of the leaders form export, matched case-insensitively with
# whitespace collapsed (see _norm_hdr).
_HDR_SUBMISSION_ID = "submission id"
_HDR_SUBMITTED_AT = "submission time"
_HDR_DATE = "дата"
_HDR_SUPERVISOR = "бригадир фио"
_HDR_LEADER = "name"           # resolved leader — the branch columns merged by the form
_HDR_LEADER_BRANCH = "лидер фио"  # prefix: «Лидер ФИО (Арипова Манзура)», one per brigadir
_HDR_COMPLETION = "completion"

# A task block is three columns sharing one question number: «7) Қилинди ?»
# (done), «7) Расм ?» (photo), «7) Сабаб?» (failure reason).
_TASK_HDR_RE = re.compile(r"^\s*(\d+)\s*\)\s*(.+?)\s*\??\s*$")
_TASK_HDR_FIELDS = {"қилинди": "done", "расм": "photo", "сабаб": "reason"}


def _norm_hdr(val) -> str:
    return re.sub(r"\s+", " ", str(val or "")).strip().lower()


class LeaderLayout(NamedTuple):
    date: int
    supervisor: int
    completion: int
    leader: Optional[int]
    leader_branch: list[int]
    submission_id: Optional[int]
    submitted_at: Optional[int]
    tasks: list[dict]            # [{id, done, photo, reason}], in question order


def _leader_layout(header: list) -> LeaderLayout:
    """Locate every column by its HEADER rather than a fixed offset.

    The form grows: a 13th question was inserted ahead of «Completion», shifting
    it from BA to BD. Fixed offsets kept reading BA — an empty cell — and scored
    every submission 0%. Reading the header instead absorbs that, and a missing
    mandatory column now fails the sync loudly instead of importing zeros.
    """
    date = supervisor = completion = leader = sub_id = sub_at = None
    branch: list[int] = []
    task_cols: dict[int, dict] = {}

    for i, raw in enumerate(header):
        h = _norm_hdr(raw)
        if not h:
            continue
        if h == _HDR_DATE:
            date = i
        elif h == _HDR_SUPERVISOR:
            supervisor = i
        elif h == _HDR_COMPLETION:
            completion = i
        elif h == _HDR_LEADER:
            leader = i
        elif h.startswith(_HDR_LEADER_BRANCH):
            branch.append(i)
        elif h == _HDR_SUBMISSION_ID:
            sub_id = i
        elif h == _HDR_SUBMITTED_AT:
            sub_at = i
        else:
            m = _TASK_HDR_RE.match(h)
            field = _TASK_HDR_FIELDS.get(m.group(2)) if m else None
            if field:
                task_cols.setdefault(int(m.group(1)), {})[field] = i

    missing = [n for n, v in (("Дата", date), ("Бригадир ФИО", supervisor),
                              ("Completion", completion)) if v is None]
    if missing:
        raise ValueError("Leaders sheet: column(s) not found in the header: "
                         + ", ".join(missing))
    if not task_cols:
        raise ValueError("Leaders sheet: no «N) Қилинди?» task columns in the header")

    tasks = [{"id": n, **cols} for n, cols in sorted(task_cols.items())]
    return LeaderLayout(date, supervisor, completion, leader, branch,
                        sub_id, sub_at, tasks)


def read_leader_data(sheet_id: str, tab: str = "Data") -> list[dict]:
    """Read the leaders checklist sheet (columns resolved by _leader_layout).

    Returns one dict per submission row: {submission_id, submitted_at, date,
    supervisor, leader, completion, tasks:[{id, done, answered, photo, reason}]}.

    `answered` separates "the leader answered no" from "the question was not put
    to them": a question added to the form today is blank on every historical
    row, and counting those blanks as failures would sink the task's score.
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

    if not rows:
        return []
    lay = _leader_layout(rows[0])

    def cell(row, i):
        return str(row[i]).strip() if (i is not None and i < len(row)) else ""

    out: list[dict] = []
    for row in rows[1:]:
        date_str = _leader_parse_date(cell(row, lay.date))
        if not date_str:
            continue

        # The form resolves the per-brigadir branch answers into one «Name»
        # column; older exports only carry the branches.
        leader = cell(row, lay.leader)
        if not leader:
            leader = next((cell(row, c) for c in lay.leader_branch if cell(row, c)), "")

        tasks = []
        for t in lay.tasks:
            done_raw = cell(row, t.get("done"))
            tasks.append({
                "id": t["id"],
                "done": done_raw.lower() in _LEADER_DONE_TOKENS,
                "answered": bool(done_raw),
                "photo": cell(row, t.get("photo")),
                "reason": cell(row, t.get("reason")),
            })

        out.append({
            "submission_id": cell(row, lay.submission_id) or None,
            "submitted_at": _leader_parse_dt(cell(row, lay.submitted_at)),
            "date": date_str,
            "supervisor": cell(row, lay.supervisor) or "N/A",
            "leader": leader or "N/A",
            "completion": _leader_parse_pct(cell(row, lay.completion)),
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


# ─── Quality register («для свода» tab of the QA workbook) ────────────────────
#
# The register is a flat log: one row per non-conformance / complaint. Its
# labels are free-typed Russian, so every categorical column is mapped to a
# stable slug here — the frontend owns the four-language wording. An unmapped
# value is passed through verbatim (the UI transliterates it), so a new label
# in the sheet degrades gracefully instead of vanishing.

QUALITY_TAB = "для свода"
QUALITY_CODES_TAB = "код производ."

_Q_SOURCE = {
    "производство": "production",
    "гость": "guest",
    "магазин": "store",
}

_Q_TYPE = {
    "риск": "risk",
    "инородный предмет": "foreign",
    "хранение": "storage",
    "санпин": "sanitation",
    "техкарта": "recipe",
    "отзыв": "review",
    "маркировка": "labeling",
    "плесень": "mold",
    "спецзаказ": "special_order",
    "стандарт": "standard",
    "отравление": "poisoning",
    "фасовка": "packing",
    "повреждение": "damage",
    "документация": "documentation",
    "списание": "writeoff",
}

_Q_CATEGORY = {
    "волос": "hair",
    "полиэтилен": "polyethylene",
    "металл": "metal",
    "пластик": "plastic",
    "бумага": "paper",
    "органика": "organic",
    "грязь и мусор": "dirt",
    "дерево": "wood",
    "сырьё": "raw",
    "сырье": "raw",
    "насекомое": "insect",
    "стекло": "glass",
    "другое": "other",
}

# статус: "Да" = the corrective action was carried out, "Нет" = still open.
_Q_STATUS = {
    "да": "done",
    "нет": "open",
    "не требуется мера": "not_required",
    "повторяющееся несоответствие": "repeat",
    "% в ожидании оплаты, доставки и т.п.": "waiting",
}

# Placeholders the sheet writes when a column doesn't apply / no match was
# found by its lookup formulas. They carry no information — drop them.
_Q_BLANKS = {
    "", "-", "—", "нет данных", "не требуется", "не требуется мера",
    "ячейка не найдена", "лидер ячейки не найден", "группа не найдена",
    "не проиводство", "не производство", "#n/a", "#н/д", "nan",
}


def _q_clean(val) -> str:
    """Collapse whitespace; drop the sheet's 'not found' placeholders."""
    s = re.sub(r"\s+", " ", str(val or "")).strip()
    return "" if s.lower() in _Q_BLANKS else s


def _q_slug(val, table: dict) -> str:
    """Map a Russian label to its slug, or pass the cleaned label through."""
    s = re.sub(r"\s+", " ", str(val or "")).strip()
    if not s:
        return ""
    return table.get(s.lower(), s)


def _q_bool(val) -> Optional[bool]:
    s = re.sub(r"\s+", " ", str(val or "")).strip().lower()
    if s in ("да", "yes", "ha"):
        return True
    if s in ("нет", "no", "yo'q", "yoq"):
        return False
    return None


def _read_cell_names(sh) -> dict:
    """code → cell name, from the «код производ.» tab (cols: brigadir, code,
    cell name, verifix leader). Codes are keyed both raw and zero-stripped so
    '0111' in the register still finds '111' in the reference tab."""
    try:
        ws = sh.worksheet(QUALITY_CODES_TAB)
        rows = ws.get_all_values()[1:]
    except Exception:
        return {}

    out: dict[str, str] = {}
    for row in rows:
        if len(row) < 3:
            continue
        code = re.sub(r"\s+", "", str(row[1]))
        name = _q_clean(row[2])
        if not code or not name:
            continue
        for key in {code, code.lstrip("0"), code.upper()}:
            out.setdefault(key, name)
    return out


def read_quality_data(sheet_id: str) -> list[dict]:
    """Read the quality register. Row 0 is a column-number ruler, row 1 the
    header, so data starts at row 2. Columns are addressed positionally (the
    layout is fixed and several headers are near-duplicates)."""
    try:
        gc = get_client()
        sh = gc.open_by_key(sheet_id)
        try:
            ws = sh.worksheet(QUALITY_TAB)
        except Exception:
            ws = sh.get_worksheet(0)
        rows = ws.get_all_values()
        cell_names = _read_cell_names(sh)
    except Exception:
        _reset_client()
        raise

    (C_DATE, C_PLACE, C_SRC, C_PRODUCT, _C_PART, _C_UNIT, _C_QTY, C_TYPE, C_CAT,
     C_DESC, C_FAULT, C_CODE, C_BRIG, C_RET, C_COMMENT, C_ACTION, C_STATUS,
     _C_CELL, _C_BRIG2, C_REF, _C_WEEK, C_MGR) = range(22)

    def cell(row, i):
        return row[i] if i < len(row) else ""

    out: list[dict] = []
    for row in rows[2:]:
        date = _leader_parse_date(cell(row, C_DATE))
        if not date:
            continue  # blank spacer / totals row

        code = _q_clean(cell(row, C_CODE))
        code_key = re.sub(r"\s+", "", code)
        out.append({
            "date":        date,
            "source":      _q_slug(cell(row, C_SRC), _Q_SOURCE),
            "place":       _q_clean(cell(row, C_PLACE)),
            "product":     _q_clean(cell(row, C_PRODUCT)),
            "ctype":       _q_slug(cell(row, C_TYPE), _Q_TYPE),
            "category":    _q_slug(cell(row, C_CAT), _Q_CATEGORY),
            "description": _q_clean(cell(row, C_DESC)),
            "fault":       _q_bool(cell(row, C_FAULT)),
            "fault_code":  code,
            "cell_name":   cell_names.get(code_key) or cell_names.get(code_key.lstrip("0"), ""),
            "brigadir":    _q_clean(cell(row, C_BRIG)),
            "manager":     _q_clean(cell(row, C_MGR)),
            "returned":    _q_bool(cell(row, C_RET)),
            "status":      _q_slug(cell(row, C_STATUS), _Q_STATUS),
            "comment":     _q_clean(cell(row, C_COMMENT)),
            "action":      _q_clean(cell(row, C_ACTION)),
            "ref_no":      _q_clean(cell(row, C_REF)),
        })
    return out
