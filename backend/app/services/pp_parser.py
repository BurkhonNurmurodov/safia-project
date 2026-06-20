"""
Parsers for the two SAP exports used by the production-planning feature.

  • «План … фаза»     (operations detail) — drives the dashboard numbers.
  • «План заголовок»  (order headers)     — reference, shown in the view switcher.

A single uploaded file may be one export, or the whole multi-sheet workbook
that contains both. ``read_workbook_slices`` reads the workbook once and returns
whichever of the two it can recognise, each as:
  - aggregates (faza only): {(sap, work_center): {plan_qty, actual_qty}} for the
    target date, used to fill pp_daily
  - a render-ready raw table: {columns: [...], rows: [[...], ...]} scoped to the
    brigadir (faza → own work centers + target date; zaga → catalog SKUs)

Column layout — фаза (header row 1, data from row 2):
    A SAP code · C operation · D work center · E text · F plan qty · H status
    J op-end date (date filter) · K confirmed output · M «План пост» (actual)
Column layout — заголовок (no header, data from row 2):
    A order · B SKU · D plant · E plan qty · F confirmed · J date · L name · M status
"""
from __future__ import annotations

import re
from datetime import date, datetime
from io import BytesIO

# фаза columns (1-based)
F_SAP, F_OP, F_WC, F_TEXT, F_PLAN, F_STATUS, F_DATE, F_CONF, F_POST = 1, 3, 4, 5, 6, 8, 10, 11, 13
FAZA_COLUMNS = ["САП код", "Опер.", "Команда", "Текст", "Кол-во (F)", "Статус", "Дата", "Подтв. (K)", "План пост (M)"]

# заголовок columns (1-based)
Z_ORDER, Z_SKU, Z_PLANT, Z_PLAN, Z_CONF, Z_DATE, Z_NAME, Z_STATUS = 1, 2, 4, 5, 6, 10, 12, 13
ZAGA_COLUMNS = ["Заказ", "SKU", "Завод", "План (E)", "Подтв. (F)", "Дата", "Наименование", "Статус"]

_SAP_RE = re.compile(r"^[A-Za-z]\d{5,}$")   # S00000101, F00002772
_WC_RE = re.compile(r"^[A-Za-z]\d{3,4}$")    # A1431, A2682
_WC4_RE = re.compile(r"^[A-Za-z]\d{4}$")     # work-center codes are letter+4 digits
                                             # (plant code W001 is 3 digits → excluded)


def _str(v) -> str:
    """A cell's string form, robust to SAP exports that store numbers as text."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _to_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                continue
    return None


def _num(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", ".").strip())
        except ValueError:
            return 0.0
    return 0.0


def _cell(v):
    """JSON-serialisable display value."""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return v


def _get(row, idx):
    return row[idx - 1] if len(row) >= idx else None


def _classify(ws, own_wcs: set[str]) -> str | None:
    """Return 'faza' | 'zaga' | None for a worksheet.

    Content-based and type/position-independent: only «фаза» carries work-center
    codes (the brigadir's own codes, or any letter+4-digit code), so seeing one
    means фаза. A sheet with SAP codes but no work centers is заголовок. Scans a
    bounded window — both files populate their distinguishing column from row 1."""
    title = (ws.title or "").lower()
    if "фаза" in title:
        return "faza"
    if "заголов" in title:
        return "zaga"
    sap_seen = False
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i > 200:
            break
        for cell in row:
            s = _str(cell)
            if not s:
                continue
            if s in own_wcs or _WC4_RE.match(s):
                return "faza"
            if _SAP_RE.match(s):
                sap_seen = True
    return "zaga" if sap_seen else None


def _best_sheet(wb, kind: str):
    """For a forced file type, pick the sheet to read: a name match if any, else
    the first worksheet (single-purpose exports have just one)."""
    key = "фаза" if kind == "faza" else "заголов"
    for ws in wb.worksheets:
        if key in (ws.title or "").lower():
            return ws
    return wb.worksheets[0]


def _extract_faza(ws, target_date: date | None, own_wcs: set[str]) -> dict:
    agg: dict[tuple[str, str], dict] = {}
    raw: list[list] = []
    dates: set[date] = set()
    seen = 0
    for row in ws.iter_rows(values_only=True):
        sap = _get(row, F_SAP)
        if not isinstance(sap, str) or not _SAP_RE.match(sap.strip()):
            continue
        sap = sap.strip()
        wc = _get(row, F_WC)
        wc = wc.strip() if isinstance(wc, str) else (str(wc).strip() if wc is not None else "")
        d = _to_date(_get(row, F_DATE))
        if d is None:
            continue
        dates.add(d)
        seen += 1
        if target_date is not None and d != target_date:
            continue
        if own_wcs and wc not in own_wcs:
            continue
        plan = _num(_get(row, F_PLAN))
        post = _num(_get(row, F_POST))
        conf = _num(_get(row, F_CONF))
        actual = post if post else conf
        a = agg.setdefault((sap, wc), {"plan_qty": 0.0, "actual_qty": 0.0})
        a["plan_qty"] += plan
        a["actual_qty"] += actual
        raw.append([_cell(_get(row, c)) for c in (F_SAP, F_OP, F_WC, F_TEXT, F_PLAN, F_STATUS, F_DATE, F_CONF, F_POST)])
    return {"agg": agg, "columns": FAZA_COLUMNS, "rows": raw, "dates": sorted(dates), "seen": seen}


def _extract_zaga(ws, catalog_skus: set[str]) -> dict:
    raw: list[list] = []
    seen = 0
    for row in ws.iter_rows(values_only=True):
        sku = _get(row, Z_SKU)
        if not isinstance(sku, str) or not _SAP_RE.match(sku.strip()):
            continue
        seen += 1
        if catalog_skus and sku.strip() not in catalog_skus:
            continue
        raw.append([_cell(_get(row, c)) for c in (Z_ORDER, Z_SKU, Z_PLANT, Z_PLAN, Z_CONF, Z_DATE, Z_NAME, Z_STATUS)])
    return {"columns": ZAGA_COLUMNS, "rows": raw, "seen": seen}


def read_workbook_slices(content: bytes, target_date: date | None,
                         own_wcs: set[str], catalog_skus: set[str],
                         force_type: str | None = None) -> dict:
    """Read an uploaded workbook once; return recognised faza/zaga slices.

    force_type ('faza'|'zaga') skips auto-detection and reads the best sheet as
    that type — the escape hatch when an export's layout defeats the classifier."""
    import openpyxl  # lazy — heavy import

    wb = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    out: dict = {"faza": None, "zaga": None}
    try:
        if force_type == "faza":
            out["faza"] = _extract_faza(_best_sheet(wb, "faza"), target_date, own_wcs)
        elif force_type == "zaga":
            out["zaga"] = _extract_zaga(_best_sheet(wb, "zaga"), catalog_skus)
        else:
            for ws in wb.worksheets:
                kind = _classify(ws, own_wcs)
                if kind == "faza" and out["faza"] is None:
                    out["faza"] = _extract_faza(ws, target_date, own_wcs)
                elif kind == "zaga" and out["zaga"] is None:
                    out["zaga"] = _extract_zaga(ws, catalog_skus)
    finally:
        wb.close()
    return out
