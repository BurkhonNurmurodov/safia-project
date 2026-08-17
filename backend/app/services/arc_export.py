"""
Excel export of the /arc register.

A pure formatter: the router re-queries the rows through the same filters and
derived expressions the page uses and hands them here already serialised
(ISO timestamps, derived flags), together with the visible column keys in
on-screen order and (optionally) their headers in the viewer's language.
This module never re-derives a figure — it lays out what it is given.

Timestamps arrive as UTC ISO strings and are written as NAIVE Tashkent
datetimes with a number format, so Excel sorts and filters them as dates
instead of as text and the reader sees the plant's wall clock.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Callable, Optional

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

_TASHKENT = timezone(timedelta(hours=5))
DT_FMT = "DD.MM.YYYY HH:MM"


def _xl_text(v: Any) -> Any:
    """Third-party ticket text goes into a cell verbatim, so two guards: a
    control character makes openpyxl raise (the whole export 500s), and a
    leading = + - @ turns a description into a formula when the file opens.
    Prefixing an apostrophe is what Excel itself does when a user types one."""
    if v is None or not isinstance(v, str):
        return v
    v = ILLEGAL_CHARACTERS_RE.sub("", v)
    if v[:1] in ("=", "+", "-", "@"):
        v = "'" + v
    return v

# Fallback headers — the page normally sends translated ones in ``labels``.
_DEFAULT_LABELS = {
    "num": "№",
    "created": "Created",
    "branch": "Branch",
    "category": "Category",
    "urgent": "Urgent",
    "description": "Description",
    "master": "Master",
    "status": "Status",
    "due": "Due",
    "overdue": "Overdue",
    "closed": "Closed",
    "hours": "Hours to close",
    "sap": "SAP",
    "evidence": "Evidence",
    "client": "Client",
    "phone": "Phone",
    "cancelled": "Cancelled",
    "deny_reason": "Deny reason",
    "comment": "Report comment",
    "state": "State",
}

# The order used when the page sends no column list at all.
_DEFAULT_COLUMNS = ("num", "created", "branch", "category", "description",
                    "master", "status", "due", "closed", "hours", "sap",
                    "evidence", "client")


def _to_local(iso: Optional[str]) -> Optional[datetime]:
    """UTC ISO string → naive Tashkent datetime (what Excel wants)."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_TASHKENT).replace(tzinfo=None)


def _yn(v: Any) -> str:
    return "✓" if v else ""


def _state(r: dict) -> str:
    if r.get("is_cancelled"):
        return "cancelled"
    if r.get("is_open"):
        return "open"
    return "closed"


def _evidence(r: dict) -> str:
    parts = []
    if r.get("photo_report"):
        parts.append(str(r["photo_report"]))
    if r.get("document_url"):
        parts.append(str(r["document_url"]))
    return "\n".join(parts)


# key → (value getter, kind, width). kind ∈ {"text", "dt", "num", "int"} and
# picks the cell's number format / alignment.
_COLS: dict[str, tuple[Callable[[dict], Any], str, int]] = {
    "num":         (lambda r: r.get("request_num"), "int", 9),
    "created":     (lambda r: _to_local(r.get("created_at")), "dt", 17),
    "branch":      (lambda r: r.get("branch_name"), "text", 26),
    "category":    (lambda r: r.get("category_name"), "text", 24),
    "urgent":      (lambda r: _yn(r.get("category_is_urgent")), "text", 8),
    "description": (lambda r: r.get("description"), "text", 48),
    "master":      (lambda r: r.get("master_name"), "text", 22),
    "status":      (lambda r: r.get("normalized_status"), "text", 16),
    "due":         (lambda r: _to_local(r.get("due")), "dt", 17),
    "overdue":     (lambda r: _yn(r.get("overdue_now") or r.get("late")), "text", 9),
    "closed":      (lambda r: _to_local(r.get("closed_at")), "dt", 17),
    "hours":       (lambda r: r.get("hours_to_close"), "num", 10),
    "sap":         (lambda r: _yn(r.get("sended_to_sap")), "text", 7),
    "evidence":    (_evidence, "text", 40),
    "client":      (lambda r: r.get("client_name"), "text", 22),
    "phone":       (lambda r: r.get("extra_phone"), "text", 15),
    "cancelled":   (lambda r: _to_local(r.get("cancelled_at")), "dt", 17),
    "deny_reason": (lambda r: r.get("deny_reason"), "text", 32),
    "comment":     (lambda r: r.get("comment_report"), "text", 40),
    "state":       (_state, "text", 11),
}

_HEAD_FILL = PatternFill("solid", fgColor="F1F5F9")
_HEAD_FONT = Font(bold=True, size=10)
_BODY_FONT = Font(size=10)
_RIGHT = Alignment(horizontal="right", vertical="top")
_LEFT = Alignment(horizontal="left", vertical="top", wrap_text=True)
_CENTER = Alignment(horizontal="center", vertical="top")


def build_arc_workbook(rows: list[dict], columns: Optional[list[str]] = None,
                       labels: Optional[dict[str, str]] = None) -> BytesIO:
    """One sheet «ARC»: a bold header row, frozen at A2, one row per ticket
    in the page's column order. Unknown keys are skipped rather than failing
    the export — the page's catalog may grow ahead of this list."""
    keys = [k for k in (columns or _DEFAULT_COLUMNS) if k in _COLS]
    if not keys:
        keys = [k for k in _DEFAULT_COLUMNS if k in _COLS]
    labels = labels or {}

    wb = Workbook()
    ws = wb.active
    ws.title = "ARC"

    for i, key in enumerate(keys, 1):
        c = ws.cell(row=1, column=i, value=_xl_text(labels.get(key) or _DEFAULT_LABELS.get(key, key)))
        c.font = _HEAD_FONT
        c.fill = _HEAD_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = _COLS[key][2]
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

    for ri, r in enumerate(rows, 2):
        for ci, key in enumerate(keys, 1):
            getter, kind, _w = _COLS[key]
            v = getter(r)
            if kind == "text":
                v = _xl_text(v)
            c = ws.cell(row=ri, column=ci, value=v)
            c.font = _BODY_FONT
            if kind == "dt":
                c.number_format = DT_FMT
                c.alignment = _RIGHT
            elif kind == "num":
                c.number_format = "0.0"
                c.alignment = _RIGHT
            elif kind == "int":
                c.number_format = "0"
                c.alignment = _RIGHT
            elif key in ("urgent", "overdue", "sap"):
                c.alignment = _CENTER
            else:
                c.alignment = _LEFT

    if rows:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(keys))}{len(rows) + 1}"

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
