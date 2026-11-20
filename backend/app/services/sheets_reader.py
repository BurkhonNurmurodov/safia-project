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
# The «Минут», «Одам сони» and «Смена отчёт» readers were deleted on 2026-11-17:
# their rows stay in production_data / headcount_data / downtime_data /
# cell_perenaladka as the frozen history (docs/zagruzka.md «The загрузка's
# Google Sheets are DISCONNECTED»). These constants outlive them.
#
# The form stores every category as a PAIR of adjacent columns — «Ячейка
# тўхтаганда» (the wait stopped the cell) and «Ячейка тўхтамаганда» (it did
# not). Both halves are read and kept strictly separate: the first feeds the
# Ojidaniya «To'xtaganda» tab and the загрузка KPIs, the second feeds the
# «To'xtamaganda» tab. Confirmed intentional 2026-07-22 — never merge them.
#
# Cat A2 is «Категория A2» (Xolodilnikdan GP mahsulot kutish — waiting for
# FINISHED goods from the cooler, where Cat A is the raw one), added
# 2026-09-03 by user directive and seated straight after Cat A.
#
# Cat H is the sheet's «Категория H (Тозалаш)» — cleaning. Cat I is «Категория
# I» (Oldingi smena ishi tugashini kutish — waiting for the previous shift to
# finish). Both are keyed by the sheet's own letter, as every category here is:
# a key that does not match its column is a key nobody can look up.
#
# Cat H has no «тўхтамаганда» half: its second column is «Нечта одам
# тозалади?», a people-count rather than minutes, so it must never be summed
# into the not-stopped series. That falls out of matching on the header — the
# column simply carries neither marker — instead of being special-cased.
SHIFT_CATEGORY_ORDER = [
    "Cat A", "Cat A2", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
    "Cat E", "Cat F", "Cat G", "Cat H", "Cat I",
]

# Categories shown ONLY on the Ojidaniya page (/api/downtime) and never counted
# against the загрузка KPIs — equip_downtime, after_idle/net util, the idle
# flag, the Daily idle donut: build_metrics_list strips them from both the
# downtime total and the per-category breakdown (user directive 2026-07-25).
#
# THIS SET IS THE ONE DEFINITION. Every KPI door reads it — build_metrics_list,
# /api/downtime's `kpi_only`, idle_source's pre-union drop, /zagruzka-cell — so
# a category enters or leaves the загрузка everywhere at once. Never re-spell
# the rule at a call site: two lists is how one page starts disagreeing with
# another about the same minutes.
#
# Cat I («Олдинги смена иши тугашини кутиш» — waiting for the previous shift to
# finish) LEFT this set on 2026-08-22 by user directive: that wait is time the
# shift stood still, so it belongs in the загрузка like every other stoppage.
#
# Cat H («Тозалаш» — cleaning) LEFT it on 2026-10-16 — the operator's directive,
# «count idle time Category H on workload also». It was the last member, so the
# set is EMPTY and every category counts; the set and every door reading it
# STAY, so a category can be taken back out with one line here and nowhere
# else. A Tozalash minute enters the загрузка the way every other figure already
# counts it (2026-09-29, `CLEANERS_CATS` below): at the crew its entry names —
# `idle_intervals.people_pieces` inside the fleet mean, `cell_share_minutes` on
# /zagruzka-cell — and at the whole cell where the entry carries no count, which
# is every entry filed before the count existed.
OJIDANIYA_ONLY_CATS: set[str] = set()

# Categories whose entry names HOW MANY PEOPLE it took — «Tozalovchilar»
# (2026-09-29, the operator's directive). Not everybody in a cell cleans: 2 of
# 10 cleaning for 20 minutes is 40 person-minutes, not the 200 a whole-cell
# reading bills. The entry must carry the count (`cell_ojidaniya_intervals.
# cleaners`, refused above the cell's people) and every figure counts only
# those people for the minutes Tozalash alone covers —
# `services/idle_intervals.people_pieces` is THE rule. It is the question the
# old shift sheet asked beside Cat H («Нечта одам тозалади?») and never read.
# ONE list, like the set above: the entry doors, the readers and /live all ask
# it, so a category starts carrying a count everywhere at once.
CLEANERS_CATS = {"Cat H"}


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
