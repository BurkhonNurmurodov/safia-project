from datetime import datetime, timedelta
from typing import NamedTuple, Optional
import re
import gspread
from google.oauth2.service_account import Credentials
from app.config import settings

_gc: Optional[gspread.Client] = None

# Shift-report («Смена отчёт») waiting-time categories, in the fixed order the
# Ojidaniya page paints them in.
#
# The form stores every category as a PAIR of adjacent columns — «Ячейка
# тўхтаганда» (the wait stopped the cell) and «Ячейка тўхтамаганда» (it did
# not). Both halves are read and kept strictly separate: the first feeds the
# Ojidaniya «To'xtaganda» tab and the загрузка KPIs, the second feeds the
# «To'xtamaganda» tab. Confirmed intentional 2026-07-22 — never merge them.
#
# Cat H is the sheet's «Категория H (Тозалаш)» — cleaning. Cat I is «Категория
# I» (Oldingi smena ishi tugashini kutish — waiting for the previous shift to
# finish). Cat I briefly shipped as "Cat D4" on 2026-07-24; renamed to the
# sheet's own letter 2026-07-25 (user asked for «Category I» by name).
#
# Cat H has no «тўхтамаганда» half: its second column is «Нечта одам
# тозалади?», a people-count rather than minutes, so it must never be summed
# into the not-stopped series. That falls out of matching on the header — the
# column simply carries neither marker — instead of being special-cased.
SHIFT_CATEGORY_ORDER = [
    "Cat A", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
    "Cat E", "Cat F", "Cat G", "Cat H", "Cat I",
]

# Columns are resolved from the HEADER, never from fixed offsets. The sheet
# swapped on 2026-07-29 moved the whole category block from PI–QD (424–445) to
# E–Z (4–25): the per-cell «Ячейка NNNN ?(Плановый/Фактический/Переналадка)»
# questions that used to sit in front of it now sit behind it, and grew from
# 140 to 150 cells. Fixed offsets went on reading the middle of that block and
# would have imported a silent zero for every brigadir — the same failure mode
# _leader_layout was written to end.
_SHIFT_HDR_DATE = "дата"
_SHIFT_HDR_BRIGADIR = "бригадир фио"

# «Категория D2 (Ячейка тўхтаганда)(Складдан …)» → letter token "d2".
_SHIFT_CAT_RE = re.compile(r"^категория\s+([a-zа-яё0-9]+)\s*\(")

# Uzbek-Cyrillic letters that get typed inconsistently, folded onto their bare
# forms so «тўхтаганда» and «тухтаганда» hit the same marker.
_SHIFT_FOLD = str.maketrans({"ў": "у", "ғ": "г", "қ": "к", "ҳ": "х", "ё": "е", "ъ": "", "’": "'", "‘": "'"})

# Cyrillic letters that look identical to Latin ones. «Категория А» typed with a
# Cyrillic А must still key "Cat A", not a lookalike twin nothing else matches.
_CAT_LOOKALIKE = str.maketrans({"а": "a", "в": "b", "с": "c", "е": "e", "н": "h",
                                "к": "k", "м": "m", "о": "o", "р": "p", "т": "t",
                                "х": "x", "у": "y", "і": "i", "ј": "j"})

_MARK_NOT_STOPPED = ("тухтамаганда", "to'xtamaganda", "toxtamaganda")
_MARK_STOPPED = ("тухтаганда", "to'xtaganda", "toxtaganda")

# Categories shown ONLY on the Ojidaniya page (/api/downtime). They must never
# count against the загрузка KPIs — equip_downtime, after_idle/net util, the
# idle flag, the Daily idle donut — so build_metrics_list strips them from both
# the downtime total and the per-category breakdown (user directive 2026-07-25).
# "Cat D4" is the pre-rename key Cat I data was stored under by syncs taken on
# 2026-07-24/25; kept here so those rows stay excluded until the next
# wipe-and-reload shift-report sync retires the old key.
OJIDANIYA_ONLY_CATS = {"Cat H", "Cat I", "Cat D4"}


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


def _shift_norm(val) -> str:
    """Lowercase a header cell, collapse its whitespace and fold the Cyrillic
    letters the form spells inconsistently."""
    return re.sub(r"\s+", " ", str(val or "")).strip().lower().translate(_SHIFT_FOLD)


def _shift_num(raw: str) -> Optional[float]:
    """Parse a waiting-minutes cell. Returns None for anything non-numeric so
    the caller can skip it rather than fold a typo into the total as a zero."""
    s = raw.replace("\xa0", "").replace(" ", "").strip()
    if not s:
        return None
    if "," in s and "." not in s:
        s = s.replace(",", ".")   # comma decimal, should the sheet ever localise
    try:
        return float(s)
    except ValueError:
        return None


class ShiftLayout(NamedTuple):
    date: int
    brigadir: int
    stopped: dict          # "Cat A" → column index of «Ячейка тўхтаганда»
    not_stopped: dict      # "Cat A" → column index of «Ячейка тўхтамаганда»


def _shift_layout(header: list) -> ShiftLayout:
    """Locate every shift-report column by its HEADER rather than a fixed offset.

    The form is a moving target: the 2026-07-29 rebuild moved the category block
    from PI–QD to E–Z and grew the per-cell block behind it. Reading the header
    absorbs that, and a missing mandatory column now fails the sync loudly
    instead of importing zeros for everyone.
    """
    date = brigadir = None
    stopped: dict[str, int] = {}
    not_stopped: dict[str, int] = {}
    unknown: set[str] = set()

    for i, raw in enumerate(header):
        h = _shift_norm(raw)
        if not h:
            continue
        if h == _SHIFT_HDR_DATE:
            date = i
            continue
        if h == _SHIFT_HDR_BRIGADIR:
            brigadir = i
            continue
        m = _SHIFT_CAT_RE.match(h)
        if not m:
            continue
        if any(k in h for k in _MARK_NOT_STOPPED):
            target = not_stopped
        elif any(k in h for k in _MARK_STOPPED):
            target = stopped
        else:
            continue   # Cat H's «Нечта одам тозалади?» — a people count, not minutes
        cat = "Cat " + m.group(1).translate(_CAT_LOOKALIKE).upper()
        if cat not in SHIFT_CATEGORY_ORDER:
            unknown.add(cat)
            continue
        target.setdefault(cat, i)   # first column wins if the form duplicates one

    missing = [n for n, v in (("Дата", date), ("Бригадир ФИО", brigadir)) if v is None]
    if missing:
        raise ValueError("Shift report: column(s) not found in the header: "
                         + ", ".join(missing))
    if not stopped:
        raise ValueError("Shift report: no «Категория X (Ячейка тўхтаганда)» "
                         "columns in the header")

    if unknown:
        print(f"[sheets] shift report: ignoring unknown categor(ies) {sorted(unknown)} "
              f"— add them to SHIFT_CATEGORY_ORDER (plus labels and a colour) to import them")
    absent = [c for c in SHIFT_CATEGORY_ORDER if c not in stopped]
    if absent:
        print(f"[sheets] shift report: categor(ies) {absent} absent from the sheet — read as 0")

    return ShiftLayout(date, brigadir, stopped, not_stopped)


def read_downtime_data(sheet_id: str, manager_names: set[str], min_date: Optional[datetime] = None):
    """Read equipment downtime from shift report Sheet1.

    Returns both halves of every category pair: the «тўхтаганда» totals (the wait
    stopped the cell) and the «тўхтамаганда» ones (it did not), each keyed by
    brigadir → date. Same rows, same categories — only the source column differs.
    """
    rows = _fetch_sheet_rows(sheet_id, "Sheet1", unformatted=False)

    # cat_names stays the full canonical list in a FIXED order whatever the sheet
    # happens to carry: the Ojidaniya page indexes its palette and its category
    # filter by position, so a category the form drops has to read 0 rather than
    # shift every colour one slot to the left.
    cat_names = list(SHIFT_CATEGORY_ORDER)
    downtime_total: dict[str, dict[str, float]] = {}
    downtime_by_cat: dict[str, dict[str, dict[str, float]]] = {}
    downtime_total_ns: dict[str, dict[str, float]] = {}
    downtime_by_cat_ns: dict[str, dict[str, dict[str, float]]] = {}

    if not rows:
        return downtime_total, downtime_by_cat, downtime_total_ns, downtime_by_cat_ns, cat_names
    lay = _shift_layout(rows[0])

    def cell(row, i) -> str:
        return row[i].strip() if i < len(row) else ""

    # Rows whose «Бригадир ФИО» matches no known supervisor are skipped — but
    # silently dropping them is how a brigadir added to the form goes missing
    # from Ojidaniya for weeks, so count them and say so once at the end.
    unmatched: dict[str, int] = {}

    for row in rows[1:]:
        if not row:
            continue
        name = cell(row, lay.brigadir)
        if not name:
            continue
        if name not in manager_names:
            unmatched[name] = unmatched.get(name, 0) + 1
            continue
        # The date is read through the leaders parser: it accepts the sheet's
        # current yyyy-mm-dd alongside the other display formats and raw serials,
        # so a locale flip on the source can't silently drop every row.
        iso = _leader_parse_date(cell(row, lay.date))
        if not iso:
            continue
        d = datetime.strptime(iso, "%Y-%m-%d")
        if min_date and d < min_date:
            continue
        date_label = d.strftime("%d.%m.%Y")

        for cats, totals, by_cat in (
            (lay.stopped, downtime_total, downtime_by_cat),
            (lay.not_stopped, downtime_total_ns, downtime_by_cat_ns),
        ):
            totals.setdefault(name, {})
            totals[name].setdefault(date_label, 0.0)
            by_cat.setdefault(name, {})
            by_cat[name].setdefault(date_label, {c: 0.0 for c in cat_names})

            for cat_name, col_idx in cats.items():
                val = _shift_num(cell(row, col_idx))
                if val is None:
                    continue
                totals[name][date_label] += val
                by_cat[name][date_label][cat_name] += val

    if unmatched:
        worst = sorted(unmatched.items(), key=lambda kv: -kv[1])
        print("[sheets] shift report: no supervisor matches "
              + ", ".join(f"{n!r} ({c} rows)" for n, c in worst)
              + " — their waiting time is NOT imported; add the spelling to the "
                "supervisor's aliases or create the unit")

    return downtime_total, downtime_by_cat, downtime_total_ns, downtime_by_cat_ns, cat_names


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
