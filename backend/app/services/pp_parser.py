"""
Parser for the SAP "План ... фаза" (operations detail) export.

Column layout (1-based), header in row 1, data from row 2:
    A  SAP code            (САП код)
    D  work center / Ресурс
    F  planned op quantity (Количество операции)   → ПЛАН
    H  system status       (ДЕБЛ / ОТКР / ЧПДТ)
    J  operation end date  (used as the date filter)
    K  confirmed output    (ПодтвВыходПрод)
    M  План пост           (confirmed posted qty)  → ФАКТ

We aggregate, per (sap_code, work_center) and filtered to a target date in
col J, the equivalent of the dashboard SUMIFS:
    plan_qty   = Σ col F
    actual_qty = Σ col M     (falls back to col K when M is empty)

The header row is skipped structurally: only rows whose col A matches a SAP
code pattern are processed, so a missing/extra header never shifts indices.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from io import BytesIO

# A=1 D=4 F=6 H=8 J=10 K=11 M=13
COL_SAP, COL_WC, COL_PLAN, COL_STATUS, COL_DATE, COL_CONF, COL_POST = 1, 4, 6, 8, 10, 11, 13

_SAP_RE = re.compile(r"^[A-Za-z]\d{3,}$")


def _to_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        s = v.strip()
        for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(s, fmt).date()
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


def _pick_phase_sheet(wb):
    """Prefer a sheet whose name mentions 'фаза'; else the active/first sheet."""
    for ws in wb.worksheets:
        if "фаза" in (ws.title or "").lower():
            return ws
    return wb.active or wb.worksheets[0]


def parse_phase_file(content: bytes) -> dict:
    """
    Returns:
        {
          "by_date": { date: { (sap_code, work_center): {plan_qty, actual_qty} } },
          "dates":   [sorted dates present],
          "rows":    total data rows seen,
        }
    The caller picks the target date and the (sap, wc) keys it cares about.
    """
    import openpyxl  # lazy — heavy import

    wb = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    ws = _pick_phase_sheet(wb)

    by_date: dict[date, dict] = {}
    seen = 0
    for row in ws.iter_rows(values_only=True):
        if not row or len(row) < COL_POST:
            continue
        sap = row[COL_SAP - 1]
        if not isinstance(sap, str) or not _SAP_RE.match(sap.strip()):
            continue  # header / blank / junk row
        sap = sap.strip()
        wc = row[COL_WC - 1]
        wc = wc.strip() if isinstance(wc, str) else (str(wc).strip() if wc is not None else "")
        d = _to_date(row[COL_DATE - 1])
        if d is None:
            continue
        seen += 1

        plan = _num(row[COL_PLAN - 1])
        post = _num(row[COL_POST - 1])
        conf = _num(row[COL_CONF - 1])
        actual = post if post else conf

        bucket = by_date.setdefault(d, {})
        key = (sap, wc)
        agg = bucket.setdefault(key, {"plan_qty": 0.0, "actual_qty": 0.0})
        agg["plan_qty"] += plan
        agg["actual_qty"] += actual

    wb.close()
    return {
        "by_date": by_date,
        "dates": sorted(by_date.keys()),
        "rows": seen,
    }
