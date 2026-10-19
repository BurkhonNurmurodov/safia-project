"""Documents «Yordamchi» builds — ANY kind, from one block model (2026-10-19).

The operator: «the AI assistant should be able to create any kind of
documents when it's asked even when we don't have a template for it». Until
then it could hand over an Excel workbook (``assistant_files.make_xlsx``) or
a file an export endpoint already produced, and it refused the «Samaradorlik»
table because the browser computes it and nothing exports it.

Now the model composes a document as BLOCKS — heading, paragraph, bullets,
numbered, table, facts, quote, page_break — and names a format; this module
lays them out. One model, eight outputs, one look:

* **docx** (python-docx) — a report somebody edits further.
* **pdf** (fpdf2, a Unicode TTF off the server — the camera stamp's font
  resolver) — a report somebody prints or forwards as it is.
* **pptx** (python-pptx) — every level-1 heading opens a slide; a long table
  continues onto the next with «(davomi)».
* **xlsx** — every table its own sheet (``make_xlsx``), the text on a first
  sheet; **csv** — the tables, comma-separated, UTF-8 with a BOM so Excel
  opens Cyrillic right.
* **md**, **txt**, **html** — the same blocks as text a chat, a wiki or a
  browser takes.

The look is the platform's: the title, a muted line under it (period · scope
· the day), headings in ink, a table whose header row is brand gold with
white text, zebra rows, numbers right-aligned, and a quiet footer naming
Safia IMS and the day. Nothing decorative. A table's rows may come as a
``rows_ref`` — a `compute` result or an API answer kept for the run — so a
figure never passes through the model's hands on its way into the file.
"""
from __future__ import annotations

import csv
import html
import io
import json
import logging
import math
import re
from datetime import datetime
from functools import lru_cache
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

FORMATS: dict[str, tuple[str, str]] = {        # format → (extension, mime)
    "docx": ("docx", DOCX),
    "pdf": ("pdf", "application/pdf"),
    "pptx": ("pptx", PPTX),
    "xlsx": ("xlsx", XLSX),
    "csv": ("csv", "text/csv"),
    "md": ("md", "text/markdown"),
    "txt": ("txt", "text/plain"),
    "html": ("html", "text/html"),
}
_ALIASES = {"word": "docx", "doc": "docx", "excel": "xlsx", "powerpoint": "pptx",
            "ppt": "pptx", "markdown": "md", "text": "txt", "htm": "html"}

BRAND = "C8973F"
INK = "0F1117"
MUTED = "6B7280"
ZEBRA = "F6F4EF"
RULE = "DDDAD2"
QUOTE_BG = "FAF3E5"

MAX_BLOCKS = 400
MAX_ROWS = 20_000
MAX_COLS = 80
MAX_ITEMS = 500
MAX_TEXT = 20_000

BLOCK_TYPES = ("heading", "paragraph", "bullets", "numbered", "table", "facts", "quote",
               "page_break")


class DocError(Exception):
    """A document that cannot be built, in words the model can act on."""


# ── the block model ──────────────────────────────────────────────────────────

def norm_format(fmt: Any) -> str:
    f = str(fmt or "").strip().lower().lstrip(".")
    f = _ALIASES.get(f, f)
    if f not in FORMATS:
        raise DocError(f"unknown format «{fmt}» — one of: {', '.join(FORMATS)}")
    return f


def _text(v: Any, cap: int = MAX_TEXT) -> str:
    if v is None:
        return ""
    s = v if isinstance(v, str) else str(v)
    return s.strip()[:cap]


def _rows_from_ref(obj: Any, columns: list[str]) -> tuple[list[str], list[list]]:
    """A kept ref as a table: a list of lists, a list of dicts (the columns
    are the keys, or the ones asked for), or a {columns, rows} result."""
    if isinstance(obj, dict):
        if isinstance(obj.get("rows"), list):
            cols = [str(c) for c in (obj.get("columns") or columns or [])]
            inner = obj["rows"]
            if inner and isinstance(inner[0], dict):
                cols = cols or [str(k) for k in inner[0].keys()]
                return cols, [[r.get(c) for c in cols] for r in inner if isinstance(r, dict)]
            return cols, [list(r) if isinstance(r, (list, tuple)) else [r] for r in inner]
        lists = [v for v in obj.values() if isinstance(v, list)]
        if len(lists) == 1:
            return _rows_from_ref(lists[0], columns)
        raise DocError("the ref is an object with no single list in it — compute the table "
                       "first and set result = {\"columns\": [...], \"rows\": [[...]]}")
    if isinstance(obj, list):
        if not obj:
            return columns, []
        if isinstance(obj[0], dict):
            cols = columns or [str(k) for k in obj[0].keys()]
            return cols, [[r.get(c) for c in cols] for r in obj if isinstance(r, dict)]
        return columns, [list(r) if isinstance(r, (list, tuple)) else [r] for r in obj]
    raise DocError("the ref is not a table (not a list) — compute one first")


def normalise(raw: Any, resolve_ref: Optional[Callable[[str], tuple[bool, Any]]] = None) -> list[dict]:
    """The model's blocks (a JSON string or a list) checked and filled in:
    bad types named, tables resolved from their refs, caps applied."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else []
        except ValueError as exc:
            raise DocError(f"blocks_json is not valid JSON: {exc}") from exc
    if isinstance(raw, dict):
        raw = raw.get("blocks") if isinstance(raw.get("blocks"), list) else [raw]
    if not isinstance(raw, list):
        raise DocError("blocks_json must be a JSON array of blocks")
    if len(raw) > MAX_BLOCKS:
        raise DocError(f"too many blocks ({len(raw)}; at most {MAX_BLOCKS})")
    out: list[dict] = []
    for i, b in enumerate(raw, 1):
        if isinstance(b, str):
            b = {"type": "paragraph", "text": b}
        if not isinstance(b, dict):
            raise DocError(f"block #{i} is not an object")
        typ = str(b.get("type") or "paragraph").strip().lower()
        typ = {"h1": "heading", "h2": "heading", "h3": "heading", "text": "paragraph", "p": "paragraph",
               "list": "bullets", "ul": "bullets", "ol": "numbered", "steps": "numbered",
               "kv": "facts", "note": "quote", "callout": "quote", "break": "page_break",
               "pagebreak": "page_break"}.get(typ, typ)
        if typ not in BLOCK_TYPES:
            raise DocError(f"block #{i}: unknown type «{b.get('type')}» — one of: {', '.join(BLOCK_TYPES)}")
        if typ == "heading":
            lvl = b.get("level")
            if lvl is None and str(b.get("type", "")).lower() in ("h1", "h2", "h3"):
                lvl = int(str(b["type"])[1])
            try:
                lvl = int(lvl or 1)
            except (TypeError, ValueError):
                lvl = 1
            out.append({"type": "heading", "text": _text(b.get("text"), 300), "level": min(max(lvl, 1), 3)})
        elif typ in ("paragraph", "quote"):
            out.append({"type": typ, "text": _text(b.get("text"))})
        elif typ in ("bullets", "numbered"):
            items = b.get("items")
            if isinstance(items, str):
                items = [x for x in items.splitlines() if x.strip()]
            if not isinstance(items, list):
                raise DocError(f"block #{i} ({typ}): items must be a list of strings")
            out.append({"type": typ, "items": [_text(x, 2000) for x in items[:MAX_ITEMS]]})
        elif typ == "facts":
            items = b.get("items")
            if isinstance(items, dict):
                items = list(items.items())
            if not isinstance(items, list):
                raise DocError(f"block #{i} (facts): items must be a list of [label, value] pairs")
            pairs = []
            for it in items[:MAX_ITEMS]:
                if isinstance(it, dict):
                    pairs.append([_text(it.get("label") or it.get("name"), 200), _text(it.get("value"), 500)])
                elif isinstance(it, (list, tuple)) and len(it) >= 2:
                    pairs.append([_text(it[0], 200), _text(it[1], 500)])
                else:
                    raise DocError(f"block #{i} (facts): every item is a [label, value] pair")
            out.append({"type": "facts", "items": pairs})
        elif typ == "table":
            cols = [str(c) for c in (b.get("columns") or [])][:MAX_COLS]
            rows = b.get("rows")
            if isinstance(rows, str):
                try:
                    rows = json.loads(rows)
                except ValueError as exc:
                    raise DocError(f"block #{i} (table): rows is not valid JSON: {exc}") from exc
            ref = b.get("rows_ref")
            if ref:
                if resolve_ref is None:
                    raise DocError(f"block #{i} (table): rows_ref cannot be used here")
                found, obj = resolve_ref(str(ref))
                if not found:
                    raise DocError(f"block #{i} (table): ref «{ref}» is not available — "
                                   f"compute it again or fetch it again")
                cols, rows = _rows_from_ref(obj, cols)
            if rows is None:
                rows = []
            if not isinstance(rows, list):
                raise DocError(f"block #{i} (table): rows must be a list of rows")
            clean = []
            for r in rows[:MAX_ROWS]:
                if isinstance(r, dict):
                    r = [r.get(c) for c in cols] if cols else list(r.values())
                elif not isinstance(r, (list, tuple)):
                    r = [r]
                clean.append(list(r)[:MAX_COLS])
            if not cols and clean:
                cols = [f"{j + 1}" for j in range(max(len(r) for r in clean))]
            if not cols:
                raise DocError(f"block #{i} (table): no columns and no rows")
            width = len(cols)
            clean = [r + [None] * (width - len(r)) if len(r) < width else r[:width] for r in clean]
            out.append({"type": "table", "columns": cols, "rows": clean,
                        "caption": _text(b.get("caption"), 200),
                        "truncated": max(0, len(rows) - MAX_ROWS)})
        else:
            out.append({"type": "page_break"})
    if not out:
        raise DocError("the document has no content — give it at least one block")
    return out


# ── shared helpers ───────────────────────────────────────────────────────────

_NUM = re.compile(r"^[-+−]?\d[\d\s\u00a0]*([.,]\d+)?\s*%?$")
_BOLD = re.compile(r"\*\*(.+?)\*\*")


def fmt_cell(v: Any, *, machine: bool = False) -> str:
    """A cell as text. A float is rounded to two decimals; thousands get the
    platform's space; None reads «—». `machine` (CSV) keeps numbers raw."""
    if v is None:
        return "" if machine else "—"
    if isinstance(v, bool):
        return "true" if machine else ("✓" if v else "—")
    if isinstance(v, int):
        return str(v) if machine else _thousands(str(v))
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return "" if machine else "—"
        if machine:
            return repr(v) if v != int(v) else str(int(v))
        s = f"{v:.2f}".rstrip("0").rstrip(".")
        return _thousands(s)
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _thousands(s: str) -> str:
    sign = "-" if s.startswith("-") else ""
    s = s.lstrip("-")
    whole, _, frac = s.partition(".")
    if len(whole) >= 5:
        groups = []
        while whole:
            groups.insert(0, whole[-3:])
            whole = whole[:-3]
        whole = " ".join(groups)
    return sign + whole + ("." + frac if frac else "")


def is_num(s: str) -> bool:
    s = (s or "").strip()
    return bool(s) and s != "—" and bool(_NUM.match(s))


def numeric_columns(rows: list[list[str]], ncols: int) -> list[bool]:
    """A column is numeric when most of its filled cells are numbers."""
    out = []
    for j in range(ncols):
        vals = [r[j] for r in rows if j < len(r) and r[j] not in ("", "—")]
        out.append(bool(vals) and sum(1 for v in vals if is_num(v)) >= 0.6 * len(vals))
    return out


def runs(text: str) -> list[tuple[str, bool]]:
    """«a **b** c» → [(a, False), (b, True), (c, False)]."""
    out, pos = [], 0
    for m in _BOLD.finditer(text or ""):
        if m.start() > pos:
            out.append((text[pos:m.start()], False))
        out.append((m.group(1), True))
        pos = m.end()
    if pos < len(text or ""):
        out.append((text[pos:], False))
    return out or [("", False)]


def plain(text: str) -> str:
    return _BOLD.sub(r"\1", text or "")


def stamp() -> str:
    return datetime.now(TZ).strftime("%d.%m.%Y")


def footer_text() -> str:
    return f"Safia IMS · {stamp()}"


def table_text(block: dict, *, machine: bool = False) -> list[list[str]]:
    return [[fmt_cell(v, machine=machine) for v in r] for r in block["rows"]]


def _table_width(weights: list[float], per_char: float, full: float) -> float:
    """What the table's columns need at this font — never more than the page,
    so a two-column table is not stretched across it."""
    return min(float(full), sum(weights) * per_char)


def _continued(name: str) -> str:
    base = name[: -len(" (davomi)")] if name.endswith(" (davomi)") else name
    return base + " (davomi)"


def _col_weights(cols: list[str], rows: list[list[str]], sample: int = 200) -> list[float]:
    """Relative column widths from what the cells hold (longest line, capped),
    so a code column stays narrow beside a note column."""
    w = []
    for j, c in enumerate(cols):
        longest = max([len(c)] + [len(r[j]) for r in rows[:sample] if j < len(r)])
        # +3 is the cell's own padding, so a 4-digit code never wraps to «000 / 1»
        w.append(float(min(max(longest, 5), 40) + 3))
    return w


# ── docx ─────────────────────────────────────────────────────────────────────

def build_docx(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor

    ink, muted, gold = RGBColor.from_string(INK), RGBColor.from_string(MUTED), RGBColor.from_string(BRAND)

    def shade(cell, fill: str) -> None:
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), fill)
        tcPr.append(shd)

    def no_borders(table) -> None:
        tblPr = table._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:val"), "nil")
            borders.append(el)
        tblPr.append(borders)

    def light_borders(table) -> None:
        tblPr = table._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:val"), "single")
            el.set(qn("w:sz"), "4")
            el.set(qn("w:color"), RULE)
            borders.append(el)
        tblPr.append(borders)

    def write_runs(par, text: str, size: Optional[float] = None, color=None, bold_all: bool = False) -> None:
        for s, bold in runs(text):
            r = par.add_run(s)
            r.bold = bold or bold_all
            if size:
                r.font.size = Pt(size)
            if color is not None:
                r.font.color.rgb = color

    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.0)
    sec.top_margin, sec.bottom_margin = Cm(1.8), Cm(1.8)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    normal.font.color.rgb = ink
    normal.paragraph_format.space_after = Pt(6)
    for name, size in (("Heading 1", 15), ("Heading 2", 12.5), ("Heading 3", 11.5)):
        st = doc.styles[name]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = ink
        st.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        st.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
        st.paragraph_format.space_after = Pt(4)
        st.paragraph_format.keep_with_next = True

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    write_runs(p, plain(title), size=22, color=ink, bold_all=True)
    if subtitle:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        write_runs(p, plain(subtitle), size=10, color=muted)
    # a thin gold rule under the title block
    rule = doc.add_paragraph()
    rule.paragraph_format.space_after = Pt(10)
    pPr = rule._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), BRAND)
    bdr.append(bottom)
    pPr.append(bdr)

    for b in blocks:
        t = b["type"]
        if t == "heading":
            doc.add_heading(plain(b["text"]), level=b["level"])
        elif t == "paragraph":
            write_runs(doc.add_paragraph(), b["text"])
        elif t in ("bullets", "numbered"):
            style = "List Bullet" if t == "bullets" else "List Number"
            for item in b["items"]:
                par = doc.add_paragraph(style=style)
                par.paragraph_format.space_after = Pt(2)
                write_runs(par, item)
        elif t == "quote":
            par = doc.add_paragraph()
            par.paragraph_format.left_indent = Cm(0.5)
            par.paragraph_format.space_before = Pt(4)
            par.paragraph_format.space_after = Pt(8)
            pPr = par._p.get_or_add_pPr()
            bdr = OxmlElement("w:pBdr")
            left = OxmlElement("w:left")
            left.set(qn("w:val"), "single")
            left.set(qn("w:sz"), "18")
            left.set(qn("w:space"), "8")
            left.set(qn("w:color"), BRAND)
            bdr.append(left)
            pPr.append(bdr)
            write_runs(par, b["text"], color=RGBColor.from_string("3F3F46"))
        elif t == "facts":
            tbl = doc.add_table(rows=0, cols=2)
            tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
            no_borders(tbl)
            for label, value in b["items"]:
                cells = tbl.add_row().cells
                cells[0].paragraphs[0].paragraph_format.space_after = Pt(2)
                cells[1].paragraphs[0].paragraph_format.space_after = Pt(2)
                write_runs(cells[0].paragraphs[0], plain(label), size=10, color=muted)
                write_runs(cells[1].paragraphs[0], value, size=11, bold_all=True)
                cells[0].width, cells[1].width = Cm(5.5), Cm(11.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
        elif t == "table":
            cols, rows = b["columns"], table_text(b)
            nums = numeric_columns(rows, len(cols))
            if b.get("caption"):
                cap = doc.add_paragraph()
                cap.paragraph_format.space_after = Pt(3)
                cap.paragraph_format.keep_with_next = True
                write_runs(cap, plain(b["caption"]), size=10, color=muted, bold_all=True)
            tbl = doc.add_table(rows=1, cols=len(cols))
            tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
            tbl.autofit = False
            light_borders(tbl)
            weights = _col_weights(cols, rows)
            tw = _table_width(weights, 0.2, 17.0)
            widths = [Cm(tw * w / sum(weights)) for w in weights]
            hdr = tbl.rows[0]
            trPr = hdr._tr.get_or_add_trPr()
            th = OxmlElement("w:tblHeader")
            th.set(qn("w:val"), "true")
            trPr.append(th)
            for j, c in enumerate(cols):
                cell = hdr.cells[j]
                shade(cell, BRAND)
                par = cell.paragraphs[0]
                par.paragraph_format.space_after = Pt(0)
                if nums[j]:
                    par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                r = par.add_run(c)
                r.bold = True
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                cell.width = widths[j]
            for j, wd in enumerate(widths):
                tbl.columns[j].width = wd
            for i, row in enumerate(rows):
                cells = tbl.add_row().cells
                for j, v in enumerate(row):
                    cells[j].width = widths[j]
                    par = cells[j].paragraphs[0]
                    par.paragraph_format.space_after = Pt(0)
                    if nums[j]:
                        par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    r = par.add_run(v)
                    r.font.size = Pt(9.5)
                    if v == "—":
                        r.font.color.rgb = muted
                    if i % 2 == 1:
                        shade(cells[j], ZEBRA)
            if b.get("truncated"):
                note = doc.add_paragraph()
                write_runs(note, f"… yana {b['truncated']} qator faylga sig'madi", size=9, color=muted)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
        elif t == "page_break":
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    foot = sec.footer.paragraphs[0]
    foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    write_runs(foot, footer_text(), size=8.5, color=muted)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── pdf ──────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=2)
def _ttf(bold: bool) -> str:
    """A Unicode TTF on this server — the camera stamp's own resolver, so the
    two never disagree about which font the box has."""
    from app.services.downtime_card import _find_font
    return _find_font(bold)


def build_pdf(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    from fpdf import FPDF
    from fpdf.enums import TableBordersLayout, TableCellFillMode, XPos, YPos
    from fpdf.fonts import FontFace

    try:
        regular, bold = _ttf(False), _ttf(True)
    except Exception as exc:  # the stamp's CardError, or no fonts at all
        raise DocError("a PDF needs a Unicode font on the server and none was found — "
                       "make a Word (docx) file instead") from exc

    gold = (0xC8, 0x97, 0x3F)
    ink = (0x0F, 0x11, 0x17)
    mute = (0x6B, 0x72, 0x80)
    zebra = (0xF6, 0xF4, 0xEF)
    rule = (0xDD, 0xDA, 0xD2)

    class _PDF(FPDF):
        def footer(self):
            self.set_y(-14)
            self.set_font("Body", "", 8)
            self.set_text_color(*mute)
            self.cell(0, 6, f"{footer_text()}  ·  {self.page_no()}/{{nb}}", align="R")

    pdf = _PDF(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_font("Body", "", regular)
    pdf.add_font("Body", "B", bold)
    pdf.set_font("Body", "", 10.5)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    def para(text: str, size: float = 10.5, color=ink, h: float = 5.4, bold_all: bool = False,
             after: float = 2.5, indent: float = 0.0) -> None:
        pdf.set_font("Body", "B" if bold_all else "", size)
        pdf.set_text_color(*color)
        if indent:
            pdf.set_x(pdf.l_margin + indent)
        pdf.multi_cell(width - indent, h, text, markdown=not bold_all,
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(after)

    pdf.set_font("Body", "B", 20)
    pdf.set_text_color(*ink)
    pdf.multi_cell(width, 9, plain(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if subtitle:
        pdf.ln(0.5)
        pdf.set_font("Body", "", 9.5)
        pdf.set_text_color(*mute)
        pdf.multi_cell(width, 5, plain(subtitle), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    pdf.set_draw_color(*gold)
    pdf.set_line_width(0.6)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.l_margin + width, y)
    pdf.ln(6)

    for b in blocks:
        t = b["type"]
        if t == "heading":
            size = {1: 14, 2: 12, 3: 11}[b["level"]]
            if pdf.get_y() > pdf.h - 45:
                pdf.add_page()
            pdf.ln(2 if b["level"] == 1 else 1)
            para(plain(b["text"]), size=size, h=size * 0.5, bold_all=True, after=1.5)
        elif t == "paragraph":
            para(b["text"])
        elif t in ("bullets", "numbered"):
            for n, item in enumerate(b["items"], 1):
                mark = "•" if t == "bullets" else f"{n}."
                pdf.set_font("Body", "", 10.5)
                pdf.set_text_color(*ink)
                pdf.set_x(pdf.l_margin)
                pdf.cell(7, 5.4, mark)
                pdf.multi_cell(width - 7, 5.4, item, markdown=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                pdf.ln(0.8)
            pdf.ln(2)
        elif t == "quote":
            pdf.set_font("Body", "", 10)
            txt = plain(b["text"])
            h = pdf.multi_cell(width - 8, 5.2, txt, dry_run=True, output="HEIGHT")
            if pdf.get_y() + h + 6 > pdf.h - pdf.b_margin:
                pdf.add_page()
            y0 = pdf.get_y()
            pdf.set_fill_color(0xFA, 0xF3, 0xE5)
            pdf.rect(pdf.l_margin, y0, width, h + 5, style="F")
            pdf.set_fill_color(*gold)
            pdf.rect(pdf.l_margin, y0, 1.2, h + 5, style="F")
            pdf.set_xy(pdf.l_margin + 5, y0 + 2.5)
            pdf.set_text_color(0x3F, 0x3F, 0x46)
            pdf.multi_cell(width - 8, 5.2, txt, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_y(y0 + h + 5)
            pdf.set_fill_color(255, 255, 255)
            pdf.ln(4)
        elif t == "facts":
            pdf.set_draw_color(*rule)
            pdf.set_line_width(0.2)
            pdf.set_fill_color(255, 255, 255)   # the table's base style reads it
            with pdf.table(borders_layout=TableBordersLayout.NONE, first_row_as_headings=False,
                           col_widths=(32, 68), line_height=5.6, padding=(1.2, 1.5),
                           text_align=("LEFT", "LEFT"), width=width, align="LEFT",
                           markdown=True) as tbl:
                for label, value in b["items"]:
                    row = tbl.row()
                    row.cell(plain(label), style=FontFace(family="Body", size_pt=9.5, color=mute))
                    row.cell(value, style=FontFace(family="Body", emphasis="BOLD", size_pt=10.5, color=ink))
            pdf.ln(3)
        elif t == "table":
            cols, rows = b["columns"], table_text(b)
            nums = numeric_columns(rows, len(cols))
            if b.get("caption"):
                para(plain(b["caption"]), size=9.5, color=mute, h=5, bold_all=True, after=1)
            pdf.set_draw_color(*rule)
            pdf.set_line_width(0.2)
            pdf.set_font("Body", "", 9)
            pdf.set_text_color(*ink)
            pdf.set_fill_color(255, 255, 255)   # the table's base style reads it
            weights = _col_weights(cols, rows)
            aligns = tuple("RIGHT" if n else "LEFT" for n in nums)
            with pdf.table(borders_layout=TableBordersLayout.HORIZONTAL_LINES,
                           cell_fill_color=zebra, cell_fill_mode=TableCellFillMode.EVEN_ROWS,
                           col_widths=tuple(weights), line_height=5.2, padding=(1.4, 1.6),
                           text_align=aligns, width=_table_width(weights, 1.9, width),
                           align="LEFT", repeat_headings=1,
                           headings_style=FontFace(family="Body", emphasis="BOLD", size_pt=9,
                                                   color=(255, 255, 255), fill_color=gold)) as tbl:
                row = tbl.row()
                for c in cols:
                    row.cell(c)
                for r in rows:
                    row = tbl.row()
                    for v in r:
                        row.cell(v)
            if b.get("truncated"):
                para(f"… yana {b['truncated']} qator faylga sig'madi", size=8.5, color=mute, h=4.5)
            pdf.ln(3)
        elif t == "page_break":
            pdf.add_page()

    return bytes(pdf.output())


# ── pptx ─────────────────────────────────────────────────────────────────────

_SLIDE_LINES = 14          # body lines a content slide holds
_TABLE_ROWS = 11           # table rows a slide holds (plus the header)
_CHARS_PER_LINE = 92


def _lines(text: str, per: int = _CHARS_PER_LINE) -> int:
    return max(1, math.ceil(len(plain(text)) / per))


def _slides(title: str, subtitle: str, blocks: list[dict]) -> list[dict]:
    """Blocks packed onto slides by a line budget. A level-1 heading opens a
    slide and names it; a table too long for one slide continues onto the
    next with «(davomi)»; everything else flows."""
    slides: list[dict] = [{"kind": "title", "title": plain(title), "subtitle": plain(subtitle)}]
    cur: Optional[dict] = None
    used = 0

    def new(name: str) -> None:
        nonlocal cur, used
        cur = {"kind": "content", "title": name, "items": []}
        slides.append(cur)
        used = 0

    def ensure(name: str) -> None:
        if cur is None:
            new(name)

    for b in blocks:
        t = b["type"]
        if t == "heading" and b["level"] == 1:
            new(plain(b["text"]))
            continue
        if t == "page_break":
            if cur is not None and cur["items"]:
                new(_continued(cur["title"]))
            continue
        ensure(plain(title))
        if t == "heading":
            need = 1
        elif t in ("paragraph", "quote"):
            need = _lines(b["text"])
        elif t in ("bullets", "numbered"):
            need = sum(_lines(x, 88) for x in b["items"])
        elif t == "facts":
            need = len(b["items"])
        else:  # table
            need = min(len(b["rows"]), _TABLE_ROWS) + 2
        if t == "table":
            rows = b["rows"]
            start = 0
            first = True
            while True:
                if used + 3 > _SLIDE_LINES:
                    new(_continued(cur["title"]))
                room = max(1, min(_TABLE_ROWS, (_SLIDE_LINES - used - 2)))
                chunk = rows[start:start + room]
                cur["items"].append({**b, "rows": chunk, "caption": b["caption"] if first else ""})
                used += len(chunk) + 2
                start += len(chunk)
                first = False
                if start >= len(rows):
                    break
                new(_continued(cur["title"]))
            continue
        if used + need > _SLIDE_LINES and cur["items"]:
            new(_continued(cur["title"]))
        if t in ("bullets", "numbered") and need > _SLIDE_LINES:
            items = list(b["items"])
            while items:
                room, take = _SLIDE_LINES - used, []
                while items and (room - _lines(items[0], 88)) >= 0:
                    room -= _lines(items[0], 88)
                    take.append(items.pop(0))
                if not take:
                    take.append(items.pop(0))
                cur["items"].append({**b, "items": take})
                used = _SLIDE_LINES
                if items:
                    new(_continued(cur["title"]))
            continue
        cur["items"].append(b)
        used += need
    return slides


def build_pptx(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    gold, ink, mute = RGBColor.from_string(BRAND), RGBColor.from_string(INK), RGBColor.from_string(MUTED)
    white = RGBColor(0xFF, 0xFF, 0xFF)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    W, H = prs.slide_width, prs.slide_height
    margin = Inches(0.7)

    def textbox(slide, left, top, width, height):
        tb = slide.shapes.add_textbox(left, top, width, height)
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Emu(0)
        tf.margin_top = tf.margin_bottom = Emu(0)
        return tf

    def put_runs(par, text: str, size: float, color, bold_all: bool = False) -> None:
        for s, bold in runs(text):
            r = par.add_run()
            r.text = s
            r.font.size = Pt(size)
            r.font.bold = bold or bold_all
            r.font.color.rgb = color
            r.font.name = "Calibri"

    def footer(slide, n: int) -> None:
        tf = textbox(slide, margin, H - Inches(0.45), W - 2 * margin, Inches(0.3))
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.RIGHT
        put_runs(p, f"{footer_text()}  ·  {n}", 9, mute)

    def fill(shape, color) -> None:
        shape.fill.solid()
        shape.fill.fore_color.rgb = color
        shape.line.fill.background()

    plan = _slides(title, subtitle, blocks)
    for n, s in enumerate(plan, 1):
        slide = prs.slides.add_slide(blank)
        if s["kind"] == "title":
            bg = slide.background.fill
            bg.solid()
            bg.fore_color.rgb = ink
            bar = slide.shapes.add_shape(1, margin, Inches(2.9), Inches(0.09), Inches(1.5))
            fill(bar, gold)
            tf = textbox(slide, margin + Inches(0.3), Inches(2.75), W - 2 * margin - Inches(0.3), Inches(1.8))
            tf.vertical_anchor = MSO_ANCHOR.TOP
            put_runs(tf.paragraphs[0], s["title"], 36, white, bold_all=True)
            if s["subtitle"]:
                p = tf.add_paragraph()
                p.space_before = Pt(10)
                put_runs(p, s["subtitle"], 16, RGBColor(0xB4, 0xB8, 0xC2))
            tf2 = textbox(slide, margin, H - Inches(0.45), W - 2 * margin, Inches(0.3))
            tf2.paragraphs[0].alignment = PP_ALIGN.RIGHT
            put_runs(tf2.paragraphs[0], footer_text(), 9, RGBColor(0x8A, 0x8F, 0x98))
            continue
        bar = slide.shapes.add_shape(1, margin, Inches(0.55), Inches(0.07), Inches(0.55))
        fill(bar, gold)
        tf = textbox(slide, margin + Inches(0.25), Inches(0.5), W - 2 * margin - Inches(0.25), Inches(0.7))
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        put_runs(tf.paragraphs[0], s["title"], 26, ink, bold_all=True)
        y = Inches(1.45)
        for b in s["items"]:
            t = b["type"]
            if t == "table":
                cols, rows = b["columns"], table_text(b)
                nums = numeric_columns(rows, len(cols))
                if b.get("caption"):
                    cap = textbox(slide, margin, y, W - 2 * margin, Inches(0.3))
                    put_runs(cap.paragraphs[0], b["caption"], 12, mute, bold_all=True)
                    y += Inches(0.35)
                row_h = Inches(0.34)
                weights = _col_weights(cols, rows)
                total = sum(weights) or 1.0
                tw = Emu(int(_table_width(weights, Inches(0.095), W - 2 * margin)))
                shape = slide.shapes.add_table(len(rows) + 1, len(cols), margin, y,
                                               tw, row_h * (len(rows) + 1))
                tbl = shape.table
                tblPr = tbl._tbl.tblPr
                tblPr.set("bandRow", "0")
                tblPr.set("firstRow", "0")
                for j, wgt in enumerate(weights):
                    tbl.columns[j].width = Emu(int(tw * (wgt / total)))
                for i in range(len(rows) + 1):
                    tbl.rows[i].height = row_h
                    for j in range(len(cols)):
                        cell = tbl.cell(i, j)
                        cell.margin_left = cell.margin_right = Inches(0.08)
                        cell.margin_top = cell.margin_bottom = Inches(0.03)
                        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                        text = cols[j] if i == 0 else rows[i - 1][j]
                        tfc = cell.text_frame
                        tfc.word_wrap = True
                        p = tfc.paragraphs[0]
                        p.alignment = PP_ALIGN.RIGHT if nums[j] else PP_ALIGN.LEFT
                        r = p.add_run()
                        r.text = text
                        r.font.name = "Calibri"
                        r.font.size = Pt(12 if i == 0 else 11)
                        r.font.bold = i == 0
                        r.font.color.rgb = white if i == 0 else (mute if text == "—" else ink)
                        cell.fill.solid()
                        cell.fill.fore_color.rgb = gold if i == 0 else (
                            RGBColor.from_string(ZEBRA) if i % 2 == 0 else white)
                y += row_h * (len(rows) + 1) + Inches(0.25)
                continue
            if t == "facts":
                rows_f = b["items"]
                row_h = Inches(0.36)
                shape = slide.shapes.add_table(len(rows_f), 2, margin, y, W - 2 * margin, row_h * len(rows_f))
                tbl = shape.table
                tbl._tbl.tblPr.set("bandRow", "0")
                tbl._tbl.tblPr.set("firstRow", "0")
                tbl.columns[0].width = Emu(int((W - 2 * margin) * 0.32))
                tbl.columns[1].width = Emu(int((W - 2 * margin) * 0.68))
                for i, (label, value) in enumerate(rows_f):
                    tbl.rows[i].height = row_h
                    for j, text in enumerate((plain(label), value)):
                        cell = tbl.cell(i, j)
                        cell.margin_left = Inches(0.05)
                        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                        cell.fill.background()
                        p = cell.text_frame.paragraphs[0]
                        put_runs(p, text, 12 if j == 0 else 14, mute if j == 0 else ink, bold_all=(j == 1))
                y += row_h * len(rows_f) + Inches(0.25)
                continue
            est = Inches(0.32) * (
                1 if t == "heading" else
                _lines(b["text"]) if t in ("paragraph", "quote") else
                sum(_lines(x, 88) for x in b["items"]))
            if t == "quote":
                bar = slide.shapes.add_shape(1, margin, y, Inches(0.05), est + Inches(0.1))
                fill(bar, gold)
                tfb = textbox(slide, margin + Inches(0.22), y, W - 2 * margin - Inches(0.22), est + Inches(0.1))
            else:
                tfb = textbox(slide, margin, y, W - 2 * margin, est + Inches(0.1))
            first = True
            if t == "heading":
                put_runs(tfb.paragraphs[0], plain(b["text"]), 18 if b["level"] == 2 else 15, ink, bold_all=True)
            elif t == "paragraph":
                put_runs(tfb.paragraphs[0], b["text"], 15, ink)
            elif t == "quote":
                put_runs(tfb.paragraphs[0], plain(b["text"]), 15, RGBColor(0x3F, 0x3F, 0x46))
            else:
                for i, item in enumerate(b["items"], 1):
                    p = tfb.paragraphs[0] if first else tfb.add_paragraph()
                    first = False
                    p.space_after = Pt(4)
                    mark = "•  " if t == "bullets" else f"{i}.  "
                    put_runs(p, mark + item, 15, ink)
            y += est + Inches(0.18)
        footer(slide, n)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ── xlsx / csv ───────────────────────────────────────────────────────────────

def _sheet_name(block: dict, last_heading: str, i: int) -> str:
    return plain(block.get("caption") or last_heading or f"Jadval {i}")


def build_xlsx(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    from app.services.assistant_files import make_xlsx

    sheets: list[dict] = []
    notes: list[list] = []
    last_heading = ""
    n = 0
    for b in blocks:
        t = b["type"]
        if t == "table":
            n += 1
            sheets.append({"name": _sheet_name(b, last_heading, n), "columns": b["columns"],
                           "rows": b["rows"]})
        elif t == "heading":
            last_heading = plain(b["text"])
            notes.append([])
            notes.append([last_heading])
        elif t in ("paragraph", "quote"):
            notes.append([plain(b["text"])])
        elif t in ("bullets", "numbered"):
            for i, item in enumerate(b["items"], 1):
                notes.append([("• " if t == "bullets" else f"{i}. ") + plain(item)])
        elif t == "facts":
            for label, value in b["items"]:
                notes.append([plain(label), plain(value)])
    if notes:
        head = [[plain(title)]] + ([[plain(subtitle)]] if subtitle else []) + [[]]
        sheets.insert(0, {"name": plain(title)[:31] or "Hisobot", "columns": [],
                          "rows": head + notes})
    if not sheets:
        raise DocError("an Excel file needs a table or some text")
    return make_xlsx(plain(title), sheets)


def build_csv(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    tables = [b for b in blocks if b["type"] == "table"]
    if not tables:
        raise DocError("a CSV needs at least one table block — for text choose docx, pdf, md or txt")
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    for i, b in enumerate(tables):
        if i:
            w.writerow([])
        if len(tables) > 1:
            w.writerow([plain(b.get("caption") or f"{plain(title)} — {i + 1}")])
        w.writerow(b["columns"])
        for r in table_text(b, machine=True):
            w.writerow(r)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


# ── md / txt / html ──────────────────────────────────────────────────────────

def _md_cell(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def build_md(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    out = [f"# {title}".rstrip()]
    if subtitle:
        out.append(f"_{plain(subtitle)}_")
    out.append("")
    for b in blocks:
        t = b["type"]
        if t == "heading":
            out += ["#" * (b["level"] + 1) + " " + plain(b["text"]), ""]
        elif t == "paragraph":
            out += [b["text"], ""]
        elif t == "quote":
            out += ["> " + b["text"].replace("\n", "\n> "), ""]
        elif t == "bullets":
            out += ["- " + x for x in b["items"]] + [""]
        elif t == "numbered":
            out += [f"{i}. {x}" for i, x in enumerate(b["items"], 1)] + [""]
        elif t == "facts":
            out += ["| | |", "|---|---|"] + [f"| {_md_cell(plain(k))} | **{_md_cell(plain(v))}** |" for k, v in b["items"]] + [""]
        elif t == "table":
            cols, rows = b["columns"], table_text(b)
            nums = numeric_columns(rows, len(cols))
            if b.get("caption"):
                out.append(f"**{plain(b['caption'])}**")
                out.append("")
            out.append("| " + " | ".join(_md_cell(c) for c in cols) + " |")
            out.append("|" + "|".join("---:" if n else "---" for n in nums) + "|")
            out += ["| " + " | ".join(_md_cell(v) for v in r) + " |" for r in rows]
            if b.get("truncated"):
                out.append(f"\n_… yana {b['truncated']} qator_")
            out.append("")
        elif t == "page_break":
            out += ["---", ""]
    out.append(f"_{footer_text()}_")
    return "\n".join(out).encode("utf-8")


def _txt_table(cols: list[str], rows: list[list[str]]) -> list[str]:
    nums = numeric_columns(rows, len(cols))
    widths = [max([len(c)] + [len(r[j]) for r in rows]) for j, c in enumerate(cols)]
    widths = [min(w, 40) for w in widths]

    def line(cells: list[str]) -> str:
        parts = []
        for j, v in enumerate(cells):
            v = v if len(v) <= widths[j] else v[:widths[j] - 1] + "…"
            parts.append(v.rjust(widths[j]) if nums[j] else v.ljust(widths[j]))
        return "  ".join(parts).rstrip()
    return [line(cols), "  ".join("─" * w for w in widths)] + [line(r) for r in rows]


def build_txt(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    out = [plain(title), "═" * min(len(plain(title)), 72)]
    if subtitle:
        out.append(plain(subtitle))
    out.append("")
    for b in blocks:
        t = b["type"]
        if t == "heading":
            text = plain(b["text"])
            out += ["", text.upper() if b["level"] == 1 else text, "─" * min(len(text), 72), ""]
        elif t == "paragraph":
            out += [plain(b["text"]), ""]
        elif t == "quote":
            out += ["│ " + plain(b["text"]).replace("\n", "\n│ "), ""]
        elif t == "bullets":
            out += ["• " + plain(x) for x in b["items"]] + [""]
        elif t == "numbered":
            out += [f"{i}. {plain(x)}" for i, x in enumerate(b["items"], 1)] + [""]
        elif t == "facts":
            wl = max((len(plain(k)) for k, _ in b["items"]), default=0)
            out += [f"{plain(k).ljust(wl)}  {plain(v)}" for k, v in b["items"]] + [""]
        elif t == "table":
            if b.get("caption"):
                out.append(plain(b["caption"]))
            out += _txt_table(b["columns"], table_text(b))
            if b.get("truncated"):
                out.append(f"… yana {b['truncated']} qator")
            out.append("")
        elif t == "page_break":
            out += ["", "·" * 24, ""]
    out += ["", footer_text()]
    return "\n".join(out).encode("utf-8")


_HTML_CSS = f"""
:root{{--ink:#{INK};--muted:#{MUTED};--gold:#{BRAND};--zebra:#{ZEBRA};--rule:#{RULE}}}
*{{box-sizing:border-box}}
body{{margin:0;padding:40px 24px;font:15px/1.55 -apple-system,"Segoe UI",Inter,Roboto,Arial,sans-serif;color:var(--ink);background:#fff}}
main{{max-width:860px;margin:0 auto}}
h1{{font-size:28px;line-height:1.2;margin:0 0 4px;font-weight:700;letter-spacing:-.01em}}
.sub{{color:var(--muted);font-size:13px;margin:0 0 14px}}
hr.rule{{border:0;border-top:2px solid var(--gold);margin:0 0 28px}}
h2{{font-size:20px;margin:30px 0 8px}}h3{{font-size:16px;margin:22px 0 6px}}h4{{font-size:14.5px;margin:18px 0 4px}}
p{{margin:0 0 12px}}ul,ol{{margin:0 0 14px;padding-left:22px}}li{{margin:3px 0}}
table{{border-collapse:collapse;width:100%;margin:6px 0 22px;font-size:13.5px}}
caption{{text-align:left;color:var(--muted);font-weight:600;font-size:13px;padding:0 0 6px}}
th{{background:var(--gold);color:#fff;text-align:left;font-weight:600;padding:8px 10px;white-space:nowrap}}
td{{padding:7px 10px;border-bottom:1px solid var(--rule);vertical-align:top}}
tr:nth-child(even) td{{background:var(--zebra)}}
td.n,th.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}
td.dash{{color:var(--muted)}}
table.facts td{{border:0;padding:5px 10px 5px 0;background:none}}
table.facts td:first-child{{color:var(--muted);width:32%}}table.facts td:last-child{{font-weight:600}}
blockquote{{margin:12px 0 18px;padding:10px 14px;border-left:4px solid var(--gold);background:#FAF3E5;color:#3F3F46}}
.note{{color:var(--muted);font-size:12.5px}}
footer{{margin-top:48px;color:var(--muted);font-size:12px;text-align:right}}
.pb{{page-break-after:always;break-after:page;height:0;margin:0}}
@media print{{body{{padding:0}}}}
"""


def _html_inline(text: str) -> str:
    return "".join(f"<strong>{html.escape(s)}</strong>" if b else html.escape(s) for s, b in runs(text))


def build_html(title: str, subtitle: str, blocks: list[dict]) -> bytes:
    out = ["<!doctype html>", '<html lang="uz"><head><meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           f"<title>{html.escape(plain(title))}</title>", f"<style>{_HTML_CSS}</style></head><body><main>",
           f"<h1>{_html_inline(title)}</h1>"]
    if subtitle:
        out.append(f'<p class="sub">{html.escape(plain(subtitle))}</p>')
    out.append('<hr class="rule">')
    for b in blocks:
        t = b["type"]
        if t == "heading":
            out.append(f"<h{b['level'] + 1}>{_html_inline(b['text'])}</h{b['level'] + 1}>")
        elif t == "paragraph":
            out.append(f"<p>{_html_inline(b['text'])}</p>")
        elif t == "quote":
            out.append(f"<blockquote>{_html_inline(b['text'])}</blockquote>")
        elif t in ("bullets", "numbered"):
            tag = "ul" if t == "bullets" else "ol"
            out.append(f"<{tag}>" + "".join(f"<li>{_html_inline(x)}</li>" for x in b["items"]) + f"</{tag}>")
        elif t == "facts":
            out.append('<table class="facts">' + "".join(
                f"<tr><td>{html.escape(plain(k))}</td><td>{_html_inline(v)}</td></tr>" for k, v in b["items"]) + "</table>")
        elif t == "table":
            cols, rows = b["columns"], table_text(b)
            nums = numeric_columns(rows, len(cols))
            cap = f"<caption>{html.escape(plain(b['caption']))}</caption>" if b.get("caption") else ""
            head = "".join(f'<th{" class=n" if nums[j] else ""}>{html.escape(c)}</th>' for j, c in enumerate(cols))
            body = "".join("<tr>" + "".join(
                f'<td class="{"n " if nums[j] else ""}{"dash" if v == "—" else ""}">{html.escape(v)}</td>'
                for j, v in enumerate(r)) + "</tr>" for r in rows)
            out.append(f"<table>{cap}<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
            if b.get("truncated"):
                out.append(f'<p class="note">… yana {b["truncated"]} qator</p>')
        elif t == "page_break":
            out.append('<hr class="pb">')
    out.append(f"<footer>{html.escape(footer_text())}</footer></main></body></html>")
    return "\n".join(out).encode("utf-8")


# ── the one door ─────────────────────────────────────────────────────────────

_BUILDERS = {"docx": build_docx, "pdf": build_pdf, "pptx": build_pptx, "xlsx": build_xlsx,
             "csv": build_csv, "md": build_md, "txt": build_txt, "html": build_html}


def build(fmt: str, title: str, subtitle: str, blocks: list[dict]) -> tuple[str, str, bytes]:
    """→ (extension, mime, bytes). Blocking (python-docx, fpdf2 and python-pptx
    are CPU work) — call it from a worker thread."""
    fmt = norm_format(fmt)
    ext, mime = FORMATS[fmt]
    title = _text(title, 300) or "Hujjat"
    subtitle = _text(subtitle, 400)
    try:
        data = _BUILDERS[fmt](title, subtitle, blocks)
    except DocError:
        raise
    except Exception as exc:
        log.exception("assistant document (%s) failed", fmt)
        raise DocError(f"the {fmt} file could not be built: {exc}") from exc
    return ext, mime, data


def safe_filename(name: Any, fallback: str = "Hujjat") -> str:
    s = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", " ", str(name or "")).strip().strip(".")
    s = re.sub(r"\.(docx|pdf|pptx|xlsx|csv|md|txt|html?)$", "", s, flags=re.I).strip()
    return (s or fallback)[:80]
