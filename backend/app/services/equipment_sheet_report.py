"""One-shot: read the «Uskunalar ro'yxati SAFIA» Google Sheet with production's
own service account and DM it, raw, to the operator.

Why: the sheet was shared with the platform's service account (2026-11-17), and a
cloud/laptop session cannot use those credentials — only production holds them.
Its single reader is a person in Telegram, so every tab goes out as one
UNFORMATTED workbook (one sheet per tab, values as typed) with the tab names,
sizes and header rows in the caption. Nothing is stored.
"""
from __future__ import annotations

from io import BytesIO

import gspread
import requests
from google.oauth2.service_account import Credentials
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from sqlalchemy.orm import Session

from app.config import settings

SHEET_TITLE = "Uskunalar ro'yxati SAFIA"


def _open():
    # Opening by TITLE lists Drive, so this reads with the Drive scope (read-only).
    creds = Credentials.from_service_account_file(
        settings.google_credentials_file,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/drive.readonly"])
    gc = gspread.authorize(creds)
    try:
        return gc.open(SHEET_TITLE), []
    except gspread.SpreadsheetNotFound:
        return None, [f.get("name", "?") for f in gc.list_spreadsheet_files()]


def send(db: Session, chat_id: int, *_window) -> int:
    ss, visible = _open()
    if ss is None:
        raise RuntimeError(f"«{SHEET_TITLE}» not visible to the service account; "
                           f"it sees: {', '.join(visible[:20]) or 'nothing'}")
    wb = Workbook()
    wb.remove(wb.active)
    lines = [f"«{ss.title}» — {len(ss.worksheets())} tab(s)"]
    for ws in ss.worksheets():
        rows = ws.get_all_values()
        out = wb.create_sheet(title=(ws.title or "sheet")[:31])
        for r in rows:
            out.append([ILLEGAL_CHARACTERS_RE.sub("", c) for c in r])
        head = " | ".join(c for c in (rows[0] if rows else []) if c)[:300]
        lines.append(f"• {ws.title}: {len(rows)} rows × {ws.col_count} cols\n  {head}")
    buf = BytesIO()
    wb.save(buf)
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
        data={"chat_id": chat_id, "caption": "\n".join(lines)[:1000]},
        files={"document": ("uskunalar-royxati-safia.xlsx", buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet")},
        timeout=180)
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(j.get("description") or f"HTTP {r.status_code}")
    return 1
