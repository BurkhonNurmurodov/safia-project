"""«Yordamchi» — the AI assistant's engine (from 2026-10-05).

It answers anything about the platform and does the user's work, the way the
operator decided it, point by point:

* **The AI the «AI kalitlari» tab gives it** (feature «assistant»: Gemini or
  Claude, any key, any model — ``services/assistant_ai``); a run stays on the
  model it started on, and is flattened to text if the tab moves it.
* **As the user, never beyond them.** Every read and change goes through
  ``assistant_api.call`` — an ordinary request to an ordinary endpoint with the
  user's own session. An «open as» tab acts as that profile.
* **Reads run; changes wait.** A change is never made directly: the model must
  call ``propose_changes``, the run PAUSES with a plan card, and nothing happens
  until the user presses Confirm (unticked items are skipped). Then each change
  is made, its result recorded, and the model reports what happened.
* **Off-limits even with Confirm**: the danger zone, logins / keys / platform
  settings, mass messages, deleting records, people & access (assistant_api).
* **Knowledge**: the full rule book (assistant_docs) plus live data.
* **Saved chats** that only their author sees; files in and out; voice.

A run is an asyncio task on the server's own loop. Its whole state is in the
database at every pause (contents, plan), so a Confirm that lands on the other
blue-green copy resumes it there.

A run OUTLIVES the process it started in (2026-10-19). A deploy swaps the
worker, and uvicorn re-raises SIGTERM after its shutdown, which killed the old
process before a running answer could say anything — the chat then read
«thinking» until the six-minute heal. Now: the task beats every BEAT_S, also
while it waits on Gemini; at shutdown it hands the run OFF (`handoff`); and the
next read by the run's owner — the chat polls every second — picks it up again
on the new process (`revive`), from the last step saved. A run whose process
died without a word (a crash, a kill) is picked up the same way once its beat
is STALE_S old. Only a run past RESUME_WINDOW_S, or one resumed MAX_RESUMES
times already, is reported interrupted.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import text as _sql

from app.database import SessionLocal
from app.models import AssistantFile, AssistantMessage, AssistantRun, AssistantThread
from app.services import assistant_api as api
from app.services import assistant_calc as calc
from app.services import assistant_docs as docs
from app.services import assistant_documents as adoc
from app.services import assistant_files as files
from app.services import assistant_ai as ai

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
MAX_STEPS = 18
RUN_WALL_S = 420
# The task writes its heartbeat every BEAT_S, also while a Gemini call is
# open, so a beat older than STALE_S means the process driving it is gone.
BEAT_S = 15
STALE_S = 75
# A run whose process went away is picked up again by its owner's next read —
# within this long of its start, and at most MAX_RESUMES times.
RESUME_WINDOW_S = 30 * 60
MAX_RESUMES = 3
MAX_PLAN = 50
HISTORY_MESSAGES = 20
HISTORY_CHARS = 40_000
DEFAULT_MAX_CHARS = 30_000
MAX_FILE = 25 * 1024 * 1024

ACTIVE = ("running", "executing")
_TASKS: set[asyncio.Task] = set()
# The task driving each run in THIS process, so Stop can cut a Gemini call
# short instead of waiting minutes for it to come back.
_LIVE: dict[int, asyncio.Task] = {}
# Tasks making CONFIRMED changes: at shutdown they are let finish the change in
# hand (they stop before the next one) instead of being cut mid-write.
_EXEC: set[asyncio.Task] = set()
# The lease the current task drives its run with (see `_fence`).
_LEASE: ContextVar[Optional[str]] = ContextVar("assistant_lease", default=None)
# A plan item cut mid-change by a restart: it may or may not have applied.
RESTART_UNKNOWN = "restart_unknown"


class LeaseLost(Exception):
    """Another task took this run over (a deploy handed it to the new
    process, or it was ended for having no driver): stop, write nothing."""
# Set by handoff(): the process is shutting down, so a cancelled run is handed
# over to the next process instead of being reported interrupted.
_STOPPING = False
# What a handed-off run's heartbeat is set to: stale at once.
_HANDED_OFF = datetime(2000, 1, 1, tzinfo=timezone.utc)


# ── who is asking ────────────────────────────────────────────────────────────

class Ctx:
    """The user, as the assistant acts for them. Built from the request that
    started or resumed the run; never stored (it holds their live token)."""

    def __init__(self, payload: dict, headers: dict, owner_key: str,
                 opened_by: Optional[str]):
        self.payload = payload
        self.headers = headers
        self.owner_key = owner_key
        self.opened_by = opened_by
        self.web = bool(payload.get("web"))
        self.sub = payload.get("sub")

    def caller(self, run_id: int) -> api.Caller:
        return api.Caller(headers=self.headers, run_id=run_id, web=self.web)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(fn, *a, **kw):
    """Run ``fn(db, …)`` with a fresh session in a worker thread."""
    def work():
        db = SessionLocal()
        try:
            return fn(db, *a, **kw)
        finally:
            db.close()
    return asyncio.to_thread(work)


# ── the tools Gemini may call ────────────────────────────────────────────────

_PURPOSE = {"type": "string", "description": (
    "ONE short phrase in the user's language saying what you are doing, shown "
    "to them as a progress line — e.g. «Zagruzka jadvalini o'qiyapman (01–05.10)». "
    "Never a path, a code or an endpoint name.")}

TOOLS: list[dict] = [
    {"name": "search_docs",
     "description": "Search the platform's rule book (how every page, figure, "
                    "rule and decision works). Returns matching sections with snippets.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string", "description": "Key words; English or the plant's own words."},
         "purpose": _PURPOSE}, "required": ["query", "purpose"]}},
    {"name": "read_doc",
     "description": "Read one rule-book section by its § number or title. Long "
                    "sections come in parts.",
     "parameters": {"type": "object", "properties": {
         "section": {"type": "string", "description": "e.g. «§27» or a title"},
         "part": {"type": "integer", "description": "1 unless the section has more parts"},
         "purpose": _PURPOSE}, "required": ["section", "purpose"]}},
    {"name": "find_endpoints",
     "description": "Search the platform's API by words (page, figure, action). "
                    "Returns endpoints with their access class: read, export "
                    "(a file), write (needs propose_changes) or off-limits.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string"}, "purpose": _PURPOSE},
         "required": ["query", "purpose"]}},
    {"name": "describe_endpoint",
     "description": "Full description of one endpoint: what it does, its query "
                    "and path parameters, its JSON body schema and file fields.",
     "parameters": {"type": "object", "properties": {
         "method": {"type": "string"}, "path": {"type": "string"},
         "purpose": _PURPOSE}, "required": ["method", "path", "purpose"]}},
    {"name": "call_api",
     "description": "READ data as the user: any GET, or an export that returns "
                    "a file (it is handed to the user). Never a change — "
                    "changes go through propose_changes. The user's own "
                    "permissions apply: 403 means THEY may not.",
     "parameters": {"type": "object", "properties": {
         "method": {"type": "string", "description": "GET, or POST for an export"},
         "path": {"type": "string", "description": "Concrete path, e.g. /api/tasks/board"},
         "query_json": {"type": "string", "description": "Query parameters as a JSON object, or empty"},
         "body_json": {"type": "string", "description": "JSON body for an export POST, or empty"},
         "max_chars": {"type": "integer", "description": "Answer budget, default 30000, max 120000"},
         "purpose": _PURPOSE}, "required": ["method", "path", "purpose"]}},
    {"name": "propose_changes",
     "description": "Propose the change(s) the user asked for. Nothing is done "
                    "until the user presses Confirm on the plan card; you then "
                    "receive each action's result. One plan per request; list "
                    "EVERY change, each with a plain-language label naming the "
                    "real record (who, what, which day).",
     "parameters": {"type": "object", "properties": {
         "title": {"type": "string", "description": "What the plan does, in the user's language"},
         "actions": {"type": "array", "items": {"type": "object", "properties": {
             "label": {"type": "string", "description": "One line the user reads, e.g. «№1182 hujjatni tasdiqlash — Aripova M., 04.10»"},
             "method": {"type": "string", "description": "POST, PUT or PATCH"},
             "path": {"type": "string"},
             "query_json": {"type": "string", "description": "JSON object or empty"},
             "body_json": {"type": "string", "description": "JSON body or empty"},
             "attachment_id": {"type": "integer", "description": "A file the user attached, sent as the upload"},
             "file_field": {"type": "string", "description": "Form field of the upload (default «file»)"},
         }, "required": ["label", "method", "path"]}}},
         "required": ["title", "actions"]}},
    {"name": "open_page",
     "description": "Give the user a button that opens a platform page (with "
                    "its filters in the query). Set navigate=true ONLY when "
                    "the user asked you to open/show the page now.",
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string", "description": "An app route, e.g. /zagruzka or /tasks?open=12"},
         "label": {"type": "string", "description": "The page's name in the user's language"},
         "navigate": {"type": "boolean"}}, "required": ["path", "label"]}},
    {"name": "compute",
     "description": "Run a short Python script over data you fetched — exact "
                    "arithmetic, totals, percentages, grouping, a formula from the "
                    "rule book over every row — instead of calculating in your head. "
                    "Every call_api JSON answer is kept WHOLE for this reply under the "
                    "name its response gave (`ref`: r1, r2 …), even where you were shown "
                    "only its head; earlier compute results are c1, c2 …. Use those "
                    "names as variables. Put the answer in a variable named `result`: "
                    "a number, a string, a list, a dict — or {\"columns\": [...], "
                    "\"rows\": [[...], ...]} for a table, which make_document and "
                    "make_excel then take by its ref (rows_ref) so you never retype a "
                    "figure. Available by name: math, statistics, re, json, itertools, "
                    "reduce, date, datetime, timedelta, Counter, defaultdict, Decimal, "
                    "print (shown back to you). Not available: imports, files, network, "
                    "double underscores; 10 s of CPU.",
     "parameters": {"type": "object", "properties": {
         "code": {"type": "string", "description": "Plain Python 3; ends by assigning `result`"},
         "purpose": _PURPOSE}, "required": ["code", "purpose"]}},
    {"name": "make_document",
     "description": "Build a document of ANY kind from content you composed and data "
                    "you gathered, and hand it to the user (a download in a browser, a "
                    "Telegram DM in Telegram): format docx (Word), pdf, pptx "
                    "(PowerPoint), xlsx, csv, md, txt or html. Use it whenever the user "
                    "wants a file — a report, a memo, a letter, a list to send, a "
                    "presentation, a table — also when no page exports it. "
                    "blocks_json is a JSON array of blocks, in reading order: "
                    "{type: heading, text, level 1-3} · {type: paragraph, text} · "
                    "{type: bullets, items: [..]} · {type: numbered, items: [..]} · "
                    "{type: table, columns: [..], rows: [[..]] OR rows_ref: \"c1\", "
                    "caption} · {type: facts, items: [[label, value], ..]} (a few key "
                    "figures) · {type: quote, text} (a note or a formula) · "
                    "{type: page_break}. A table's rows_ref names a compute result or "
                    "a call_api answer (r2), so figures go into the file untouched. "
                    "**bold** is allowed in any text. In pptx every level-1 heading "
                    "opens a slide; a long table continues on the next slides. The "
                    "look (fonts, colours, a footer naming the platform and the day) "
                    "is the platform's — compose the CONTENT, not the styling.",
     "parameters": {"type": "object", "properties": {
         "format": {"type": "string", "enum": ["docx", "pdf", "pptx", "xlsx", "csv", "md", "txt", "html"]},
         "filename": {"type": "string", "description": "Without extension, in the user's language"},
         "title": {"type": "string", "description": "The document's title — its subject"},
         "subtitle": {"type": "string", "description": "ONE muted line under the title: period · scope · the day it was made"},
         "blocks_json": {"type": "string", "description": "The blocks, as a JSON array"},
         "purpose": _PURPOSE}, "required": ["format", "filename", "title", "blocks_json", "purpose"]}},
    {"name": "make_excel",
     "description": "Build an Excel workbook from data you gathered and hand it "
                    "to the user (a download in a browser, a Telegram DM in "
                    "Telegram). Prefer the page's own export when one fits exactly. "
                    "A sheet's rows come as rows_json, or as rows_ref — a compute "
                    "result or a call_api answer kept for this reply (c1, r2).",
     "parameters": {"type": "object", "properties": {
         "filename": {"type": "string", "description": "Without extension"},
         "sheets": {"type": "array", "items": {"type": "object", "properties": {
             "name": {"type": "string"},
             "columns": {"type": "array", "items": {"type": "string"}},
             "rows_json": {"type": "string", "description": "JSON array of rows, each an array of cell values"},
             "rows_ref": {"type": "string", "description": "A kept ref holding the rows (c1, r2) — instead of rows_json"},
         }, "required": ["name", "columns"]}},
         "purpose": _PURPOSE}, "required": ["filename", "sheets", "purpose"]}},
    {"name": "read_attachment",
     "description": "Look again at a file the user attached earlier in this chat (by its #id).",
     "parameters": {"type": "object", "properties": {
         "id": {"type": "integer"}, "purpose": _PURPOSE}, "required": ["id", "purpose"]}},
]


# ── the system prompt ────────────────────────────────────────────────────────

_ROLE_WORDS = {
    "admin": "admin", "top-manager": "top manager", "shift-manager": "shift manager",
    "supervisor": "brigadir (supervisor of a unit)", "leader": "cell leader",
    "guest": "guest", "idle-owner": "owner of an ojidaniya category",
}

_RULES = """\
You are «Yordamchi», the assistant inside Safia IMS — the KPI and operations
platform of the Safia food factory (plants, shifts, brigadirs' units, cells,
leaders; загрузка, ojidaniya, production plans, attendance from Verifix,
checklists, concerns, tasks, quality, ARC tickets…).

HOW YOU WORK
1. Facts come from tools, never from memory. Numbers, names, dates and
   statuses must come from call_api (live data, the same endpoints the pages
   use) or from the rule book (search_docs → read_doc). If you cannot find it,
   say so plainly — never guess, never invent an endpoint, a figure or a name.
   Arithmetic beyond a handful of figures — a total, an average, a percentage
   over rows, a formula applied to a table — goes through compute, never
   through your head: a call_api answer is kept whole as r1, r2 … for exactly
   that, and a compute result (c1, c2 …) goes into a file by its ref.
2. "How/why" questions: read the rule book first. Explain in the user's terms:
   pages, buttons, figures — never file names, functions or code.
3. You act AS THIS USER through their own session. Their permissions are
   yours: a 403 means they may not — say so, and never look for a way round
   (another endpoint, another profile, impersonation).
4. CHANGES: never call a write through call_api. Gather what you need with
   reads (ids, current values), then call propose_changes ONCE with every
   change, each labelled in plain words with the real record. The user
   confirms (they may untick items). After it runs you get each result: report
   exactly what was done and what failed, with the server's reason. Never say
   something was done before you have its result.
5. OFF-LIMITS, even with confirmation: the danger zone (database backup /
   restore, data cleanup); logins, passwords, API keys and platform-wide
   settings; messages to many people (broadcasts, mass notices, forecast
   calls); DELETING anything; people & access (profiles, roles, page access,
   permissions). If asked, say you cannot do that here and point the user to
   the page where they can do it themselves (open_page).
6. Before a change, check it is what they meant: if the request is ambiguous
   (which brigadir? which day?) ask ONE short question instead of guessing.
   Show the current value when you propose to change it.
7. Answer in the language of the user's last message: Uzbek (Latin, or
   Cyrillic if they wrote Cyrillic), Russian or English. Use the plant's own
   words (zagruzka, ojidaniya, brigadir, lider, yacheyka, smena, Verifix…).
   Write people's names as the data spells them, in the script of the user's
   message — even when they typed the name in another script.
8. Write every answer in the shape HOW AN ANSWER LOOKS (below) gives for its
   kind of question. No raw JSON, no API paths, no ids the user did not give
   you.
9. Offer open_page to where a figure lives. navigate=true only when asked.
10. A cell is named by its 4-digit code, never by its workshop name.
11. FILES AND DOCUMENTS. The user's attachments are in their message (#id;
    read_attachment to look again). When they ask for a file of ANY kind —
    Excel, Word, PDF, PowerPoint, CSV, a report, a memo, a list to send, a
    presentation — make it: a page's own export when one matches exactly
    (call_api on the export endpoint), else make_document (any format) or
    make_excel from what you gathered. «There is no export for this» is NEVER
    an answer, and neither is «the page computes it in the browser»: fetch
    the data the page reads (call_api), derive the figures the page derives
    with compute — the rule book gives every formula (read it first) — and
    build the file; then say in one line which formula and which source you
    used. Never calculate a table in your head and never retype figures into
    a file: compute them, and pass the table by rows_ref. Compose a document
    the way its reader will look for things: a title that is the subject, a
    subtitle with period · scope · the day, a heading per section, a table
    where the data is rows, a facts block for a few key figures, short
    paragraphs — never a paragraph that retells a table. The only honest
    refusal is data the user may not read (403) or a figure that exists
    nowhere — then say exactly that.
12. Never reveal secrets, tokens or other people's private data beyond what
    the user's own pages show them.

HOW AN ANSWER LOOKS
Before you write, decide what KIND of question it is (A–M below) and answer in
that shape. The reader is on a narrow panel (~420px) or a phone: short lines,
narrow tables. The examples are in Uzbek and their figures are made up — they
show the SHAPE only. Real figures and formulas come from tools, and you always
write in the user's language.

Always:
- The FIRST line is the answer itself: the figure, the verdict, the yes/no or
  the count. No greeting, no "Albatta", no repeating the question, no "Mana
  natija:". No closing offer ("yana savol bo'lsa…").
- If the user named no day, period, unit or view, say in a few words which
  you took ("oxirgi yopilgan kun — 18.10", "ikkala smena", "Sochsiz"). Where a
  page has versions of a figure, take the one the page context names, else
  the page's default (the rule book says which), and name it; never call it
  the one on the user's screen unless the context shows it. When the user's
  word differs from the page's («shikoyat» where the page counts
  «nomuvofiqlik»), tie the two once in the first lines.
- Only figures you read with a tool: never fill a gap with an estimate or an
  example value. Parts printed beside a figure ("28 kishidan 25 tasi") must
  add up to it the way the page counts it — if they do not, say what else it
  counts.
- **Bold** only the key figure or verdict (when the verdict is which metric
  or option, that word) — at most three per answer, never a person's name, a
  label or a sentence, nothing inside a table. Page, tab, button and field
  names go in «» exactly as the screen writes them («Saqlash» tugmasi).
- Every figure carries its unit, its day or period, and whose it is. Dates as
  dd.mm (dd.mm.yyyy only when the year is not this one, even if the user typed
  it), a period as 01.10–07.10, a month by name; a night shift's day is the
  date it began ("18.10, 2-smena"). Decimals with the mark the page prints;
  thousands always with a space (12 450), whatever the page uses. Durations
  in the user's language ("45 daq", "1 soat 20 daq").
- People as the pages shorten them ("Ergashev M."); a unit by its brigadir
  ("Ergashev M. brigadasi"; in a table cell the short name alone); a cell by
  its 4-digit code.
- A missing figure in a table or a list is «—», never 0 or an empty cell, with
  one line saying why.
- Never pack more than 5 items into one line or bullet — list them one per
  line (a sub-list under the bullet).
- Never retell a table in prose: the one line above it may name the extremes
  and the start → end; nothing after it repeats its rows.
- Where the answer lives on a page, call open_page so a link appears (the
  path may carry a tab or a filter only where the rule book shows that page
  reading it; otherwise link the bare page). No link to the page the user is
  on unless it narrows that page to the answer, none to a page that shows
  only part of the answer, and never the same page again in the text.
- ### headings only in an answer longer than about ten lines.

The shapes:
A. ONE FIGURE ("…qancha?", "necha foiz?", "…qanday bo'lgan?" about one
   figure) → one sentence with the figure in bold and its scope and day
   beside it; a second short clause only if it adds meaning (the band it
   falls in, the day before). No table, no list.
   "**87%** — Ergashev M. brigadasi, 18.10, smena boshi zagruzka (17.10 — 79%)."
B. YES / NO / STATUS ("…yopganmi?", "bormi?") → "Ha — …" or "Yo'q — …" first,
   then what makes it so: up to 5 items as a list, more as a count (and a
   link if one page lists them). "Yo'q — 3 ta brigadir 18.10 kunini
   yopmagan:" + the list. When the true answer is "yes, but not as asked",
   lead with the fact itself, never a "Ha" that the next line takes back.
C. RANKING / COMPARISON ("eng past…", "qaysilari…", "solishtir") → one summary
   line (how many of how many, the extremes), then a table sorted by the
   figure asked about: the name column, that figure, and at most one column
   that explains it — 3 columns, 4 only when every extra one is a short
   figure. Right-align number columns (`---:` in the separator row). Mark a
   row's shift or kind only when the rows differ in it, and then on every
   row. At most 12 rows; with more, show the top 10 and say in one line how
   many are left and that make_excel can give them all.
D. A LIST OF RECORDS (tasks, concerns, people, documents) → the count first
   ("7 ta vazifa muddati o'tgan"), then a table of at most 3 key columns
   (who · what · date or state) — a value that is the same on every row goes
   in the count line, not a column — most urgent or oldest first; or bullets
   when there are at most 5 and each needs one fact. C's row rule applies.
E. TREND / CHANGE OVER TIME → the direction and size in one sentence
   ("01.10 → 07.10: 82% → 91%, +9 punkt; eng past 04.10 — 74%"), then a small
   table of period | figure (at most 12 rows — group a long period by week or
   month), then one line on what stands out, if anything does.
F. HOW IS X CALCULATED → the formula on one line in the page's own words
   ("Reja bajarilishi = Fakt trudoyomkost ÷ Plan trudoyomkost"); then a
   numbered list of the terms, one line each (what it is, where it comes
   from); then a worked example with the user's real numbers ONLY when this
   conversation has already read every one of them or the user named a unit
   and a day, else none — never fetch data just to make an example: the
   formula is answered from the documentation in a step or two ("Masalan,
   18.10, Ergashev M.: 2 960 ÷ 3 400 daq = **87%**"); other versions the
   page shows get one line at the very end, not a formula each.
G. HOW DO I DO X → numbered steps, one action each (at most 7), UI names in «»;
   if the user's word differs from the screen's, tie them once («E'tiroz
   bildirish» — norozilik). Then open_page to where it starts, unless the user
   is already there. One line after the steps for the rule that bites most (a
   deadline, who may do it).
H. WHY IS IT LIKE THIS (red, low, missing, refused) → the cause first in one
   sentence; then up to 4 bullets, each a factor with its number where it has
   one (no bullet restating the cause, none that is only background); then
   what can be done about it, if anything.
I. WHAT IS X (a term or a rule) → a definition of one or two sentences; then
   up to 4 bullets on what counts and what does not; then where it is shown
   (open_page, unless the user is already there — then name the tab or
   section). "X va Y farqi": one sentence on the difference, then one bullet
   per term.
J. SEVERAL QUESTIONS AT ONCE → if the whole answer fits in about ten lines,
   use the main part's shape and answer every part in the first lines. Longer:
   a summary box first ("> **Qisqasi:** …" in the user's language — the verdict
   of each part), then one ### section per part in its own shape; a part the
   box answers in full gets no section.
K. NOTHING TO SHOW (no rows, no access, outside the data) → say so in one
   sentence naming what you looked at (the day, the unit) — claim only what
   you checked — then what the user can do (another date, a page, who can see
   it). Never a table of empty values.
L. CHANGES → no text before propose_changes: its title and labels ARE the
   preview (each label: the record, the current value → the new one). After it
   ran: one line ("4 tadan 3 tasi bajarildi"; for a single change "Bajarildi."
   or "Bajarilmadi — <sabab>"), then only what failed, each with the server's
   reason in plain words — the card above already marks every change.
M. A FILE OR DOCUMENT ASKED FOR ("Excel qilib ber", "PDF hisobot tayyorla",
   "Wordda ro'yxat", "prezentatsiya") → build it BEFORE writing: the page's
   own export when one matches exactly, else call_api → compute →
   make_document / make_excel. Then one or two lines: what the file holds
   (rows · period · scope) and, where you derived the figures, the formula
   and the source in the page's own words — the file tile under the answer
   carries the rest, so never retell its contents and never paste its table
   into the answer. A part that could not be filled is named with its reason
   ("3 brigadirda fakt kiritilmagan — ularning qatori «—»"). No link to the
   page the figures came from unless the user asked where they live.

Markdown you may use: **bold**, *italic*, bullets ("- ", a sub-item indented
by two spaces), numbered steps ("1. "), pipe tables (`---:` right-aligns a
number column), "> " for the summary box (at most one, at the top), a box
whose first line is "> [!WARNING]" for a caveat that changes how a figure
must be read (right under that figure), ### headings, and links
[label](/route). Nothing else: no HTML, no images, no emojis, no code blocks
unless the user asked for code.
"""


def _system(ctx: Ctx, context: dict) -> str:
    p = ctx.payload
    # The run's own «now», frozen when it started: a Claude thinking signature
    # is bound to the system prompt it was written under, so the prompt must
    # be the same text again when the run resumes after a Confirm.
    now = (context or {}).get("_now") or datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    who = [f"Name: {p.get('full_name') or '?'}",
           f"Role: {_ROLE_WORDS.get(p.get('role'), p.get('role') or '?')}"]
    if p.get("imp"):
        who.append(f"NOTE: an admin ({(p.get('imp') or {}).get('name') or '?'}) opened this "
                   "session AS this person to test; act strictly within this person's permissions.")
    who.append("Surface: " + ("web browser" if ctx.web else "Telegram mini app")
               + ("; files reach them as downloads" if ctx.web else "; files reach them as Telegram DMs"))
    page = context or {}
    page_lines = []
    if page.get("path"):
        page_lines.append(f"Open page: {page.get('title') or ''} — route {page.get('path')}"
                          + (f"?{page.get('search')}" if page.get("search") else ""))
    if page.get("filters"):
        page_lines.append("Page filters in force: " + json.dumps(page.get("filters"), ensure_ascii=False)[:800])
    if page.get("pages"):
        names = "; ".join(f"{x.get('label')} = {x.get('path')}" for x in page["pages"][:60]
                          if isinstance(x, dict))
        page_lines.append("Pages this user can open: " + names[:3000])
    lang = page.get("lang") or "uz"
    return "\n".join([
        _RULES,
        "THE USER",
        *who,
        f"UI language: {lang}",
        f"Now: {now} (Tashkent). Shift 1 runs by day, shift 2 by night "
        "(a night belongs to the date it started).",
        "",
        "WHAT THEY ARE LOOKING AT",
        *(page_lines or ["(no page context)"]),
        "",
        "RULE BOOK — contents (read with read_doc)",
        docs.toc(),
        "",
        "API — paths you may use, by area (GET = read · FILE = export · METHOD* = "
        "change, via propose_changes only). Details: describe_endpoint.",
        api.index_text(),
    ])


# ── history ──────────────────────────────────────────────────────────────────

def _history(db, thread_id: int, before_id: int) -> list[dict]:
    """Earlier turns as plain text — what was asked and what was answered,
    with plans and files summarised. Tool traffic is not replayed: the model
    re-reads what it needs, which is also what keeps it honest about data that
    may have changed since."""
    rows = (db.query(AssistantMessage)
            .filter(AssistantMessage.thread_id == thread_id, AssistantMessage.id < before_id)
            .order_by(AssistantMessage.id.desc()).limit(HISTORY_MESSAGES).all())
    rows.reverse()
    out: list[dict] = []
    used = 0
    for m in rows:
        text = _flatten(m)
        if not text:
            continue
        used += len(text)
        role = "user" if m.role == "user" else "model"
        if out and out[-1]["role"] == role:
            out[-1]["parts"].append({"text": text})
        else:
            out.append({"role": role, "parts": [{"text": text}]})
    while used > HISTORY_CHARS and len(out) > 2:
        dropped = out.pop(0)
        used -= sum(len(p.get("text", "")) for p in dropped["parts"])
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def _flatten(m: AssistantMessage) -> str:
    d = m.data or {}
    bits = [m.text or ""]
    for a in d.get("attachments") or []:
        bits.append(f"[attached #{a.get('id')} «{a.get('name')}»]")
    plan = d.get("plan")
    if plan:
        items = plan.get("items") or []
        done = sum(1 for i in items if i.get("state") == "done")
        failed = sum(1 for i in items if i.get("state") == "failed")
        bits.append(f"[plan «{plan.get('title')}»: {len(items)} change(s), state {plan.get('state')}"
                    f"; done {done}, failed {failed}]")
    for f in d.get("files") or []:
        bits.append(f"[file given to the user: «{f.get('name')}»]")
    return "\n".join(b for b in bits if b).strip()


# ── persistence helpers ──────────────────────────────────────────────────────

def _fence(db, run_id: int) -> None:
    """Every write a driving task makes starts here: lock the run's row and
    check the task still holds its lease. A claim by another process (which
    takes the same row) either waits for this write — and then finds a fresh
    heartbeat and gives up — or has already landed, and this write is refused.
    Requests (the router) carry no lease and are not fenced."""
    lease = _LEASE.get()
    if lease is None:
        return
    row = db.execute(_sql("SELECT lease FROM assistant_runs WHERE id = :id FOR UPDATE"),
                     {"id": run_id}).first()
    if row is None or row[0] != lease:
        raise LeaseLost(run_id)


def _claim(db, run_id: int) -> str:
    """Take the run for the task about to drive it. Called only where nothing
    else can be driving it (a new run, a retry, a confirm already claimed)."""
    lease = str(uuid.uuid4())
    (db.query(AssistantRun).filter(AssistantRun.id == run_id)
     .update({AssistantRun.lease: lease, AssistantRun.heartbeat_at: _now()},
             synchronize_session=False))
    db.commit()
    return lease


def _save(db, run_id: int, *, run: Optional[dict] = None, msg: Optional[dict] = None,
          msg_text: Optional[str] = None, msg_data: Optional[dict] = None) -> None:
    _fence(db, run_id)
    r = db.get(AssistantRun, run_id)
    if r is None:
        return
    for k, v in (run or {}).items():
        setattr(r, k, v)
    r.heartbeat_at = _now()
    if r.message_id and (msg is not None or msg_text is not None or msg_data is not None):
        m = db.get(AssistantMessage, r.message_id)
        if m is not None:
            data = dict(m.data or {})
            if msg_data is not None:
                data = msg_data
            if msg:
                data.update(msg)
            m.data = data
            if msg_text is not None:
                m.text = msg_text
            m.updated_at = _now()
    t = db.get(AssistantThread, r.thread_id)
    if t is not None:
        t.updated_at = _now()
    db.commit()


def _message_data(db, run_id: int) -> dict:
    r = db.get(AssistantRun, run_id)
    if r is None or not r.message_id:
        return {}
    m = db.get(AssistantMessage, r.message_id)
    return dict(m.data or {}) if m else {}


def _usage_add(acc: dict, u: dict, secs: float = 0.0) -> dict:
    acc = dict(acc or {})
    acc["calls"] = acc.get("calls", 0) + 1
    # How long Gemini took — in total and at worst — so a slow answer can be
    # told from a slow model afterwards (the settings card, the run row).
    acc["model_s"] = round(acc.get("model_s", 0) + secs, 1)
    acc["model_max_s"] = round(max(acc.get("model_max_s", 0), secs), 1)
    for k_src, k_dst in (("promptTokenCount", "prompt"), ("candidatesTokenCount", "output"),
                         ("thoughtsTokenCount", "thoughts"), ("cachedContentTokenCount", "cached")):
        acc[k_dst] = acc.get(k_dst, 0) + int(u.get(k_src) or 0)
    return acc


# ── starting a run ───────────────────────────────────────────────────────────

def user_parts(db, text: str, attachment_ids: list[int], owner_key: str,
               voice: Optional[dict]) -> list[dict]:
    parts: list[dict] = []
    if voice:
        parts.append({"text": "(voice message, transcribed)"})
    parts.append({"text": text or "(no text — see the attachment)"})
    if attachment_ids:
        rows = (db.query(AssistantFile)
                .filter(AssistantFile.id.in_(attachment_ids),
                        AssistantFile.owner_key == owner_key).all())
        for f in rows:
            parts.extend(files.to_parts(f))
    return parts


def spawn(coro) -> None:
    task = asyncio.get_running_loop().create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


def _beat(db, run_id: int) -> None:
    """The heartbeat alone — nothing else about the run moves. Only while this
    task still holds the run: a task that lost it must not keep it «alive»."""
    q = db.query(AssistantRun).filter(AssistantRun.id == run_id,
                                      AssistantRun.status.in_(ACTIVE),
                                      # a beat queued behind a hand-off must not undo it
                                      AssistantRun.heartbeat_at > _HANDED_OFF)
    lease = _LEASE.get()
    if lease is not None:
        q = q.filter(AssistantRun.lease == lease)
    q.update({AssistantRun.heartbeat_at: _now()}, synchronize_session=False)
    db.commit()


@contextlib.asynccontextmanager
async def _beating(run_id: int):
    """Keep the run's heartbeat fresh while its task is alive — including the
    minutes a Gemini call can take, during which nothing else is saved."""
    async def tick():
        while True:
            await asyncio.sleep(BEAT_S)
            try:
                await _db(_beat, run_id)
            except Exception:  # a missed beat is not worth the run
                log.warning("assistant run %s: heartbeat failed", run_id, exc_info=True)
    ticker = asyncio.get_running_loop().create_task(tick())
    try:
        yield
    finally:
        ticker.cancel()


async def _last_word(fn, *a, **kw) -> None:
    """A write in an error handler: a task that lost its run says nothing."""
    try:
        await _db(fn, *a, **kw)
    except LeaseLost:
        pass


async def drive(run_id: int, ctx: Ctx, lease: Optional[str] = None) -> None:
    """Run (or continue) the model loop until it answers, pauses on a plan,
    is stopped, or fails. Every step is saved before the next one starts —
    which is what lets another process pick the run up where it stopped.
    ``lease`` is the claim `revive` / `execute_and_resume` already made; a
    fresh run takes its own."""
    if lease is None:
        lease = await _db(_claim, run_id)
    _LEASE.set(lease)
    started = time.monotonic()
    me = asyncio.current_task()
    if me is not None:
        _LIVE[run_id] = me
    try:
        async with _beating(run_id):
            await _drive(run_id, ctx, started)
    except LeaseLost:
        log.info("assistant run %s: driven elsewhere now — this task stops", run_id)
    except asyncio.CancelledError:
        await _last_word(_hand_off if _STOPPING else _cut, run_id)
        raise
    except ai.AssistantAIError as exc:
        log.warning("assistant run %s: %s %s", run_id, exc.code, exc.message)
        await _last_word(_finish, run_id, "error", error=f"{exc.code}: {exc.message}",
                         msg={"status": "error", "error": exc.code, "thinking": False})
    except Exception as exc:  # pragma: no cover - the safety net
        log.exception("assistant run %s crashed", run_id)
        await _last_word(_finish, run_id, "error", error=f"crash: {exc}",
                         msg={"status": "error", "error": "crash", "thinking": False})
    finally:
        if _LIVE.get(run_id) is me:
            _LIVE.pop(run_id, None)


def stop_now(run_id: int) -> bool:
    """Stop pressed: cut the run's task here and now (its handler records it
    as stopped). False when no task of this process drives it."""
    task = _LIVE.get(run_id)
    if task is None or task.done():
        return False
    task.cancel()
    return True


async def _drive(run_id: int, ctx: Ctx, started: float) -> None:
    state = await _db(_load, run_id)
    if state is None:
        return
    contents, usage, context, run_model, spent = state
    if usage.get("resumes"):
        # A resumed run keeps what it spent, but always gets two minutes more.
        started -= max(0.0, min(spent, RUN_WALL_S - 120))
    if not context.get("_now"):
        context["_now"] = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
        await _db(_save, run_id, run={"context": context})
    system = _system(ctx, context)
    steps_used = sum(1 for c in contents if c.get("role") == "model")

    async def on_retry(attempt: int, why: str) -> None:
        await _db(_save, run_id, msg={"retry": {"n": attempt, "why": why, "at": _now().isoformat()}})

    while True:
        if await _db(_cancel_asked, run_id):
            await _db(_finish, run_id, "cancelled", msg={"status": "stopped"})
            return
        if _STOPPING:  # shutting down: hand it on before the next call
            raise asyncio.CancelledError()
        # The tab's pick NOW (cached): moved onto another model mid-run,
        # the transcript is flattened once — another model's thinking
        # signatures and tool blocks are not accepted back.
        a = await asyncio.to_thread(ai.current)
        if a.model and run_model and a.model != run_model:
            log.info("assistant run %s: moved from %s to %s — transcript flattened",
                     run_id, run_model, a.model)
            contents = ai.transcode(contents)
        run_model = a.model or run_model
        over = steps_used >= MAX_STEPS or (time.monotonic() - started) > RUN_WALL_S
        if over:
            _append_text(contents, "You have used all the steps this request "
                         "allows. Answer now with what you have, and say what is missing.")
        # `call_at` says when this model call began, so the chat can tell a
        # slow answer from a stuck one; `retry` is cleared until one happens.
        await _db(_save, run_id, run={"contents": contents, "usage": usage, "model": run_model},
                  msg={"thinking": True, "call_at": _now().isoformat(), "retry": None})
        t0 = time.monotonic()
        reply = await ai.generate(a, system=system, contents=contents, tools=TOOLS,
                                  mode="NONE" if over else "AUTO", on_retry=on_retry)
        steps_used += 1
        usage = _usage_add(usage, reply.usage, time.monotonic() - t0)
        contents.append(reply.content)
        if not reply.calls:
            text = reply.text.strip()
            if not text:
                raise ai.AssistantAIError("empty", f"No answer (finish={reply.finish})")
            await _db(_save, run_id, run={"contents": contents, "usage": usage},
                      msg={"thinking": False, "call_at": None, "retry": None})
            await _db(_finish, run_id, "done", text=text, usage=usage)
            return
        await _db(_save, run_id, msg={"call_at": None, "retry": None})
        responses: list[dict] = []
        extra: list[dict] = []
        plan_call = None
        for call in reply.calls:
            if call.get("name") == "propose_changes" and plan_call is None:
                plan_call = call
                continue
            res, more = await _dispatch(run_id, ctx, call)
            responses.append(_fresp(call, res))
            extra.extend(more)
        if plan_call is not None:
            verdict = await _db(_validate_plan, run_id, ctx, plan_call.get("args") or {})
            if verdict.get("error"):
                responses.append(_fresp(plan_call, verdict))
            else:
                await _db(_pause_on_plan, run_id, contents, usage, plan_call,
                          responses + extra, verdict)
                return
        contents.append({"role": "user", "parts": responses + extra})


def _interrupted(db, run_id: int) -> None:
    _finish(db, run_id, "interrupted", msg={"status": "interrupted", "thinking": False})


def _stopped(db, run_id: int) -> None:
    _finish(db, run_id, "cancelled", msg={"status": "stopped"})


def _cut(db, run_id: int) -> None:
    """The task was cancelled while the process goes on: Stop, or something
    unforeseen."""
    r = db.get(AssistantRun, run_id)
    if r is not None and r.cancel_asked:
        _stopped(db, run_id)
    else:
        _interrupted(db, run_id)


def _hand_off(db, run_id: int) -> None:
    """This process is shutting down (a deploy): leave the run ACTIVE with a
    heartbeat that is stale at once, so the owner's next read picks it up on
    the new process. Nothing else moves — the last saved step is where it
    continues from."""
    try:
        _fence(db, run_id)
    except LeaseLost:
        return  # already someone else's
    r = db.get(AssistantRun, run_id)
    if r is None or r.status not in ACTIVE:
        return
    r.heartbeat_at = _HANDED_OFF
    db.commit()
    log.info("assistant run %s handed off at shutdown", run_id)


async def handoff(timeout: float = 8.0) -> None:
    """Called first in the lifespan's shutdown. A run waiting on the model is
    cancelled at once; one making confirmed changes is let finish the change
    in hand and stops before the next (cut mid-write, a change may or may not
    land). Each hands its run over — before uvicorn re-raises SIGTERM and the
    process dies, which is what used to leave an answer «thinking» for six
    minutes after every backend deploy."""
    global _STOPPING
    _STOPPING = True
    tasks = [t for t in list(_TASKS) if not t.done()]
    for t in tasks:
        if t not in _EXEC:
            t.cancel()
    if tasks:
        _, late = await asyncio.wait(tasks, timeout=timeout)
        for t in late:
            t.cancel()
        if late:
            await asyncio.wait(late, timeout=2.0)
        log.info("assistant: %d run(s) handed off at shutdown", len(tasks))


def _append_text(contents: list[dict], text: str) -> None:
    if contents and contents[-1].get("role") == "user":
        contents[-1]["parts"].append({"text": text})
    else:
        contents.append({"role": "user", "parts": [{"text": text}]})


def _fresp(call: dict, response: Any) -> dict:
    body = response if isinstance(response, dict) else {"result": response}
    fr = {"name": call.get("name"), "response": body}
    if call.get("id"):
        fr["id"] = call["id"]
    return {"functionResponse": fr}


def _load(db, run_id: int):
    r = db.get(AssistantRun, run_id)
    if r is None or r.status not in ACTIVE:
        return None
    # Seconds this reply has already been worked on (a run picked up after a
    # restart keeps the time it spent — the clock starts again after a plan
    # the user confirmed, as the chat's own clock does).
    since = _message_data(db, run_id).get("since")
    try:
        t0 = _aware(datetime.fromisoformat(since)) if since else _aware(r.created_at)
    except (TypeError, ValueError):
        t0 = _aware(r.created_at)
    spent = max(0.0, (_now() - t0).total_seconds()) if t0 else 0.0
    return list(r.contents or []), dict(r.usage or {}), dict(r.context or {}), r.model, spent


def _cancel_asked(db, run_id: int) -> bool:
    r = db.get(AssistantRun, run_id)
    return bool(r is None or r.cancel_asked)


def _finish(db, run_id: int, status: str, *, text: Optional[str] = None,
            error: Optional[str] = None, usage: Optional[dict] = None,
            msg: Optional[dict] = None) -> None:
    r = db.get(AssistantRun, run_id)
    if r is None:
        return
    r.status = status
    r.finished_at = _now()
    calc.drop(run_id)
    if error:
        r.error = error[:2000]
    if usage is not None:
        r.usage = usage
    data = {"status": "done" if status == "done" else (msg or {}).get("status", status),
            "thinking": False}
    data.update(msg or {})
    _save(db, run_id, msg=data, msg_text=text)


# ── one tool call ────────────────────────────────────────────────────────────

def _step(db, run_id: int, step: dict) -> int:
    data = _message_data(db, run_id)
    steps = list(data.get("steps") or [])
    steps.append(step)
    _save(db, run_id, msg={"steps": steps, "thinking": False})
    return len(steps) - 1


def _step_done(db, run_id: int, idx: int, ok: bool, note: str = "") -> None:
    data = _message_data(db, run_id)
    steps = list(data.get("steps") or [])
    if 0 <= idx < len(steps):
        steps[idx] = {**steps[idx], "state": "ok" if ok else "failed",
                      **({"note": note[:200]} if note else {})}
        _save(db, run_id, msg={"steps": steps})


def _jarg(raw: Any) -> Any:
    if raw in (None, ""):
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return "__bad__"


def _split_path(path: str, query: Optional[dict]) -> tuple[str, dict]:
    from urllib.parse import parse_qsl, urlsplit
    sp = urlsplit(path or "")
    q = dict(parse_qsl(sp.query)) if sp.query else {}
    if isinstance(query, dict):
        q.update(query)
    return sp.path, q


async def _dispatch(run_id: int, ctx: Ctx, call: dict) -> tuple[dict, list[dict]]:
    """Run one tool. Returns (the response for the model, extra user parts —
    an image the model asked to see)."""
    name = call.get("name") or ""
    args = call.get("args") or {}
    purpose = str(args.get("purpose") or "")[:160]
    kind = {"search_docs": "docs", "read_doc": "docs", "find_endpoints": "search",
            "describe_endpoint": "search", "call_api": "data", "make_excel": "file",
            "make_document": "file", "compute": "calc",
            "read_attachment": "file", "open_page": "page"}.get(name, "other")
    idx = None
    if name != "open_page":
        idx = await _db(_step, run_id, {"kind": kind, "label": purpose or name,
                                        "tool": name, "state": "running"})
    try:
        res, extra = await _run_tool(run_id, ctx, name, args)
    except Exception as exc:
        log.exception("assistant tool %s failed", name)
        res, extra = {"error": f"tool failed: {exc}"}, []
    ok = not res.get("error") and not (isinstance(res.get("status"), int) and res["status"] >= 400)
    if idx is not None:
        await _db(_step_done, run_id, idx, ok,
                  "" if ok else str(res.get("error") or res.get("status") or ""))
    return res, extra


async def _run_tool(run_id: int, ctx: Ctx, name: str, args: dict) -> tuple[dict, list[dict]]:
    if name == "search_docs":
        return {"results": docs.search(str(args.get("query") or ""))}, []
    if name == "read_doc":
        return docs.read(args.get("section"), args.get("part") or 1), []
    if name == "find_endpoints":
        return {"endpoints": api.find(str(args.get("query") or ""))}, []
    if name == "describe_endpoint":
        method = str(args.get("method") or "GET").upper()
        path = str(args.get("path") or "")
        e = next((x for x in api.catalog() if x.method == method and x.path == path), None) \
            or api.match(method, path)
        return (api.card(e) if e else {"error": "no such endpoint"}), []
    if name == "call_api":
        return await _tool_call_api(run_id, ctx, args)
    if name == "open_page":
        return await _db(_tool_open_page, run_id, args), []
    if name == "make_excel":
        return await _tool_make_excel(run_id, ctx, args), []
    if name == "make_document":
        return await _tool_make_document(run_id, ctx, args), []
    if name == "compute":
        return await _tool_compute(run_id, args), []
    if name == "read_attachment":
        return await _db(_tool_read_attachment, run_id, ctx, args)
    return {"error": f"unknown tool {name}"}, []


async def _tool_call_api(run_id: int, ctx: Ctx, args: dict) -> tuple[dict, list[dict]]:
    method = str(args.get("method") or "GET").upper()
    query = _jarg(args.get("query_json"))
    body = _jarg(args.get("body_json"))
    if query == "__bad__" or body == "__bad__":
        return {"error": "query_json / body_json must be valid JSON objects"}, []
    path, q = _split_path(str(args.get("path") or ""), query if isinstance(query, dict) else None)
    acc, why = api.access_of(method, path, body)
    if acc == "hidden":
        return {"error": "this endpoint is not available to the assistant"}, []
    if acc == "blocked":
        return {"error": f"off-limits ({why}) — the assistant may not do this even with confirmation"}, []
    if acc == "write":
        return {"error": "this is a change: use propose_changes so the user can confirm it"}, []
    if api.match(method, path) is None:
        return {"error": "no such endpoint — use find_endpoints"}, []
    max_chars = min(max(int(args.get("max_chars") or DEFAULT_MAX_CHARS), 2000), 120_000)
    res = await api.call(ctx.caller(run_id), method, path, query=q,
                         body=body if method != "GET" else None, export=(acc == "export"))
    return await _answer(run_id, ctx, res, max_chars)


async def _answer(run_id: int, ctx: Ctx, res: api.Result, max_chars: int) -> tuple[dict, list[dict]]:
    """An HTTP answer as the model reads it. A file is stored and handed to
    the user; an image is also SHOWN to the model so it can talk about it."""
    if res.file is not None:
        name, mime, data = res.file
        if len(data) > MAX_FILE:
            return {"status": res.status, "error": f"the file «{name}» is too large to hand over here "
                    f"({len(data) // (1024 * 1024)} MB) — point the user to the page instead"}, []
        meta = await _db(_keep_file, run_id, ctx, name, mime, data)
        extra = []
        if mime.startswith("image/") and len(data) < 8 * 1024 * 1024:
            from app.services.gemini import shrink_image
            import base64
            d, m = shrink_image(data, mime)
            extra = [{"text": f"[the image «{name}» you fetched]"},
                     {"inline_data": {"mime_type": m, "data": base64.b64encode(d).decode()}}]
        return {"status": res.status, "file": {"name": name, "size": len(data)},
                "delivered": "shown in the chat"}, extra
    if not res.ok:
        detail = res.data.get("detail") if isinstance(res.data, dict) else (res.data or res.text)
        return {"status": res.status, "error": str(detail)[:1500] if detail else f"HTTP {res.status}"}, []
    if isinstance(res.data, dict) and res.data.get("sent") is True:
        return {"status": res.status, "delivered": "sent to the user's Telegram chat"}, []
    if res.data is not None:
        data, cut = api.shrink(res.data, max_chars)
        out = {"status": res.status, "data": data}
        if isinstance(res.data, (dict, list)):
            # The WHOLE answer stays with the run, for compute and for a
            # document's rows_ref — whatever was cut from the model's view.
            ref = await asyncio.to_thread(calc.put, run_id, "r", res.data)
            out["ref"] = ref
            if cut:
                out["shape"] = calc.describe(res.data)
                out["truncated"] = (f"long lists were cut from this view; the whole answer is kept "
                                    f"as {ref} — use compute over {ref} (or rows_ref) instead of "
                                    f"fetching pieces, or narrow the query (dates, unit, filters)")
        elif cut:
            out["truncated"] = ("long lists were cut — narrow the query "
                                "(dates, unit, filters) or raise max_chars")
        return out, []
    txt = res.text or ""
    return {"status": res.status, "text": txt[:max_chars]}, []


def _keep_file(db, run_id: int, ctx: Ctx, name: str, mime: str, data: bytes) -> dict:
    r = db.get(AssistantRun, run_id)
    f = files.store(db, owner_key=ctx.owner_key, opened_by=ctx.opened_by,
                    thread_id=r.thread_id if r else None, kind="export",
                    name=name, mime=mime, data=data)
    db.commit()
    meta = files.meta(f)
    data_ = _message_data(db, run_id)
    lst = list(data_.get("files") or [])
    lst.append(meta)
    _save(db, run_id, msg={"files": lst})
    return meta


def _tool_open_page(db, run_id: int, args: dict) -> dict:
    path = str(args.get("path") or "").strip()
    if not path.startswith("/") or path.startswith(("/api/", "/admin/settings", "//")):
        return {"error": "path must be an app page route such as /zagruzka"}
    data = _message_data(db, run_id)
    links = [x for x in (data.get("links") or []) if x.get("path") != path]
    links.append({"path": path[:500], "label": str(args.get("label") or path)[:80],
                  "navigate": bool(args.get("navigate"))})
    _save(db, run_id, msg={"links": links[-6:]})
    return {"ok": True}


async def _tool_make_excel(run_id: int, ctx: Ctx, args: dict) -> dict:
    sheets = []
    for sh in (args.get("sheets") or [])[:12]:
        if not isinstance(sh, dict):
            continue
        cols = [str(c) for c in (sh.get("columns") or [])][:80]
        ref = str(sh.get("rows_ref") or "").strip()
        if ref:
            found, obj = calc.get(run_id, ref)
            if not found:
                return {"error": calc.missing_message(run_id, ref)}
            try:
                cols, rows = adoc._rows_from_ref(obj, cols)
            except adoc.DocError as exc:
                return {"error": f"sheet «{sh.get('name')}»: {exc}"}
        else:
            rows = files.parse_rows(sh.get("rows_json"))
        sheets.append({"name": str(sh.get("name") or "Sheet"), "columns": cols,
                       "rows": rows[:20000]})
    if not sheets:
        return {"error": "no sheets"}
    fname = adoc.safe_filename(args.get("filename"), "Yordamchi")
    data = await asyncio.to_thread(files.make_xlsx, fname, sheets)
    out = await _deliver(run_id, ctx, fname + ".xlsx", files.XLSX, data)
    out["rows"] = sum(len(s["rows"]) for s in sheets)
    return out


async def _deliver(run_id: int, ctx: Ctx, name: str, mime: str, data: bytes) -> dict:
    """A file the assistant made: listed in the chat (a download in a
    browser) and, inside Telegram, DMed by the bot — the platform's standing
    rule for every export."""
    if len(data) > MAX_FILE:
        return {"error": f"the file is too large ({len(data) // (1024 * 1024)} MB) — "
                         f"narrow it (fewer rows or columns)"}
    meta = await _db(_keep_file, run_id, ctx, name, mime, data)
    delivered = "a download button in the chat"
    if not ctx.web and ctx.sub:
        try:
            await asyncio.to_thread(_dm_file, int(ctx.sub), name, data)
            delivered = "sent to the user's Telegram chat (and listed in the chat)"
        except Exception as exc:
            log.warning("assistant: could not DM the file: %s", exc)
    return {"ok": True, "file": meta["name"], "size": len(data), "delivered": delivered}


async def _tool_make_document(run_id: int, ctx: Ctx, args: dict) -> dict:
    try:
        fmt = adoc.norm_format(args.get("format"))
        blocks = adoc.normalise(args.get("blocks_json"), lambda n: calc.get(run_id, n))
        ext, mime, data = await asyncio.to_thread(
            adoc.build, fmt, str(args.get("title") or ""), str(args.get("subtitle") or ""), blocks)
    except adoc.DocError as exc:
        return {"error": str(exc)}
    fname = adoc.safe_filename(args.get("filename"), adoc.safe_filename(args.get("title"), "Hujjat"))
    out = await _deliver(run_id, ctx, f"{fname}.{ext}", mime, data)
    if out.get("ok"):
        out["blocks"] = len(blocks)
        out["tables"] = sum(len(b["rows"]) for b in blocks if b["type"] == "table")
    return out


async def _tool_compute(run_id: int, args: dict) -> dict:
    code = str(args.get("code") or "")
    why = calc.check_code(code)
    if why:
        return {"error": why}
    variables: dict = {}
    for name in calc.wanted_refs(code):
        found, obj = calc.get(run_id, name)
        if not found:
            return {"error": calc.missing_message(run_id, name)}
        variables[name] = obj
    res = await asyncio.to_thread(calc.run, code, variables)
    if not res.get("ok"):
        out = {"error": res.get("error") or "the script failed"}
        if res.get("output"):
            out["output"] = res["output"][-4000:]
        return out
    result = res.get("result")
    ref = await asyncio.to_thread(calc.put, run_id, "c", result)
    shown, cut = api.shrink(result, 12_000)
    out = {"ok": True, "ref": ref, "result": shown}
    if cut:
        out["truncated"] = (f"the result is shown cut; it is kept whole as {ref} — "
                            f"pass it by rows_ref, or compute over it again")
    if isinstance(result, dict) and isinstance(result.get("rows"), list):
        out["rows"] = len(result["rows"])
    elif isinstance(result, list):
        out["rows"] = len(result)
    if res.get("output"):
        out["output"] = res["output"][-4000:]
    return out


def _dm_file(chat_id: int, name: str, data: bytes) -> None:
    from app.telegram_bot import bot
    bot.send_document(chat_id=chat_id, document=(name, data))


def _tool_read_attachment(db, run_id: int, ctx: Ctx, args: dict) -> tuple[dict, list[dict]]:
    try:
        fid = int(args.get("id"))
    except (TypeError, ValueError):
        return {"error": "id must be a number"}, []
    f = db.query(AssistantFile).filter(AssistantFile.id == fid,
                                       AssistantFile.owner_key == ctx.owner_key).first()
    if f is None:
        return {"error": "no such attachment in this chat"}, []
    parts = files.to_parts(f)
    return {"ok": True, "attachment": files.meta(f), "note": "its content follows"}, parts


# ── the plan ─────────────────────────────────────────────────────────────────

def _validate_plan(db, run_id: int, ctx: Ctx, args: dict) -> dict:
    title = str(args.get("title") or "").strip()[:200]
    actions = args.get("actions") or []
    if not isinstance(actions, list) or not actions:
        return {"error": "a plan needs at least one action"}
    if len(actions) > MAX_PLAN:
        return {"error": f"at most {MAX_PLAN} changes per plan — split the work"}
    out, problems = [], []
    for i, a in enumerate(actions):
        if not isinstance(a, dict):
            problems.append(f"#{i + 1}: not an object")
            continue
        method = str(a.get("method") or "").upper()
        label = str(a.get("label") or "").strip()[:300]
        query = _jarg(a.get("query_json"))
        body = _jarg(a.get("body_json"))
        if query == "__bad__" or body == "__bad__":
            problems.append(f"#{i + 1}: query_json/body_json is not valid JSON")
            continue
        path, q = _split_path(str(a.get("path") or ""), query if isinstance(query, dict) else None)
        if "{" in path or "}" in path:
            problems.append(f"#{i + 1}: the path still has a placeholder — fill in the real id")
            continue
        acc, why = api.access_of(method, path, body)
        if acc == "blocked":
            problems.append(f"#{i + 1} «{label}»: OFF-LIMITS ({why}) — cannot be done by the assistant")
            continue
        if acc != "write":
            problems.append(f"#{i + 1} «{label}»: not a change ({acc}) — use call_api for reads/exports")
            continue
        if api.match(method, path) is None:
            problems.append(f"#{i + 1}: no such endpoint {method} {path}")
            continue
        att = a.get("attachment_id")
        if att not in (None, ""):
            try:
                att = int(att)
            except (TypeError, ValueError):
                problems.append(f"#{i + 1}: attachment_id must be a number")
                continue
            ok = db.query(AssistantFile.id).filter(AssistantFile.id == att,
                                                   AssistantFile.owner_key == ctx.owner_key).first()
            if not ok:
                problems.append(f"#{i + 1}: attachment #{att} is not in this chat")
                continue
        else:
            att = None
        out.append({"label": label or f"{method} {path}", "method": method, "path": path,
                    "query": q, "body": body, "attachment_id": att,
                    "file_field": str(a.get("file_field") or "file")[:40]})
    if problems:
        return {"error": "the plan was NOT shown to the user; fix it or explain",
                "problems": problems}
    return {"title": title or "O'zgarishlar", "actions": out}


def _pause_on_plan(db, run_id: int, contents: list, usage: dict, call: dict,
                   other_responses: list, verdict: dict) -> None:
    plan = {"title": verdict["title"], "actions": verdict["actions"],
            "call": {"name": call.get("name"), "id": call.get("id")},
            "pending": other_responses}
    items = [{"i": i, "label": a["label"], "method": a["method"], "path": a["path"],
              "body": a["body"], "query": a["query"], "attachment_id": a["attachment_id"],
              "state": "pending"} for i, a in enumerate(verdict["actions"])]
    _save(db, run_id, run={"contents": contents, "usage": usage, "plan": plan,
                           "status": "awaiting_confirm"},
          msg={"status": "awaiting", "thinking": False,
               "plan": {"title": verdict["title"], "items": items, "state": "awaiting"}})


def cancel_plan(db, run: AssistantRun, why: str = "cancelled") -> None:
    """The user said no (or wrote something else instead). Nothing changes."""
    data = _message_data(db, run.id)
    plan = dict(data.get("plan") or {})
    plan["state"] = why
    plan["items"] = [{**i, "state": "skipped"} for i in plan.get("items") or []]
    run.status = "cancelled"
    run.finished_at = _now()
    db.commit()
    _save(db, run.id, msg={"plan": plan, "status": "cancelled", "thinking": False})


def begin_execute(db, run: AssistantRun, approve: list[int]) -> Optional[str]:
    """Confirm: ONE statement moves the run from awaiting to executing, so a
    double tap or a second tab can never make the changes twice. Returns the
    lease the executing task drives with, or None when it was not waiting."""
    if run.status != "awaiting_confirm" or not run.plan:
        return None
    plan = dict(run.plan)
    plan["approve"] = sorted({int(i) for i in approve if isinstance(i, int)
                              and 0 <= i < len(plan.get("actions") or [])})
    lease = str(uuid.uuid4())
    n = (db.query(AssistantRun)
         .filter(AssistantRun.id == run.id, AssistantRun.status == "awaiting_confirm")
         .update({AssistantRun.status: "executing", AssistantRun.plan: plan,
                  AssistantRun.lease: lease, AssistantRun.heartbeat_at: _now()},
                 synchronize_session=False))
    db.commit()
    if n != 1:
        db.refresh(run)
        return None
    db.refresh(run)
    data = _message_data(db, run.id)
    view = dict(data.get("plan") or {})
    view["state"] = "running"
    # `since` restarts the reply's clock: the minutes the plan waited on the
    # user are not time the assistant spent working (routers/assistant.py).
    _save(db, run.id, msg={"plan": view, "status": "running", "since": _now().isoformat()})
    return lease


async def execute_and_resume(run_id: int, ctx: Ctx, lease: Optional[str] = None) -> None:
    """Make the confirmed changes one by one, as the user, then hand the
    results back to the model for its report. Picked up after a restart it
    continues with the changes not yet started — never one already made, and
    one cut mid-change is reported as unknown, never made again."""
    if lease is None:
        lease = await _db(_claim, run_id)
    _LEASE.set(lease)
    me = asyncio.current_task()
    if me is not None:
        _EXEC.add(me)
        _LIVE[run_id] = me
    try:
        async with _beating(run_id):
            ok = await _execute(run_id, ctx)
    except LeaseLost:
        log.info("assistant run %s: driven elsewhere now — this task stops", run_id)
        return
    except asyncio.CancelledError:
        await _last_word(_hand_off if _STOPPING else _cut, run_id)
        raise
    finally:
        _EXEC.discard(me)
        if _LIVE.get(run_id) is me:
            _LIVE.pop(run_id, None)
    if ok:
        await drive(run_id, ctx, lease)


def _plan_state(db, run_id: int) -> tuple[dict, list[dict]]:
    r = db.get(AssistantRun, run_id)
    view = _message_data(db, run_id).get("plan") or {}
    return dict((r.plan if r else None) or {}), list(view.get("items") or [])


async def _execute(run_id: int, ctx: Ctx) -> bool:
    try:
        plan, items = await _db(_plan_state, run_id)
        actions = plan.get("actions") or []
        approve = set(plan.get("approve") or [])
        results = []
        for i, a in enumerate(actions):
            st = (items[i].get("state") if i < len(items) else None) or "pending"
            note = (items[i].get("note") if i < len(items) else None) or ""
            if i not in approve:
                results.append({"label": a["label"], "outcome": "skipped by the user"})
                if st != "skipped":
                    await _db(_plan_item, run_id, i, "skipped", "")
                continue
            # Settled by an earlier process (a restart picked this plan up):
            # its outcome stands, nothing is made again.
            if st == "done":
                results.append({"label": a["label"], "outcome": "done"})
                continue
            if st == "running" or (st == "failed" and note == RESTART_UNKNOWN):
                results.append({"label": a["label"], "outcome": "unknown",
                                "detail": "the server restarted while this change was being "
                                          "made; it may or may not have applied — tell the "
                                          "user to check it on its page"})
                if st == "running":
                    await _db(_plan_item, run_id, i, "failed", RESTART_UNKNOWN)
                continue
            if st == "failed":
                results.append({"label": a["label"], "outcome": "failed",
                                **({"detail": note} if note else {})})
                continue
            if st == "skipped":
                results.append({"label": a["label"], "outcome": "not made"})
                continue
            # Never started: make it now — unless the process is going away
            # (the next one continues from here) or the user pressed Stop.
            if _STOPPING:
                raise asyncio.CancelledError()
            if await _db(_cancel_asked, run_id):
                rest = [j for j in range(i, len(actions)) if j in approve]
                await _db(_stop_plan, run_id, rest)
                return False
            await _db(_plan_item, run_id, i, "running", "")
            # Re-asked WITH the body at the moment of acting: the policy is the
            # policy now, not when the plan was drawn.
            acc, why = api.access_of(a["method"], a["path"], a.get("body"))
            if acc != "write":
                note = f"off-limits ({why})" if acc == "blocked" else f"not a change ({acc})"
                results.append({"label": a["label"], "outcome": "refused", "detail": note})
                await _db(_plan_item, run_id, i, "failed", note)
                continue
            upload = None
            if a.get("attachment_id"):
                upload = await _db(_upload_of, a["attachment_id"], ctx.owner_key,
                                   a.get("file_field") or "file")
            res = await api.call(ctx.caller(run_id), a["method"], a["path"],
                                 query=a.get("query"), body=a.get("body"), files=upload)
            detail = ""
            if not res.ok:
                d = res.data.get("detail") if isinstance(res.data, dict) else (res.data or res.text)
                detail = str(d)[:600] if d else f"HTTP {res.status}"
            results.append({"label": a["label"], "outcome": "done" if res.ok else "failed",
                            "status": res.status,
                            **({"detail": detail} if detail else {}),
                            **({"answer": api.shrink(res.data, 3000)[0]} if res.ok and res.data is not None else {})})
            await _db(_plan_item, run_id, i, "done" if res.ok else "failed", detail)
        await _db(_resume_with, run_id, plan, results)
    except LeaseLost:
        raise
    except Exception as exc:
        log.exception("assistant: executing plan of run %s failed", run_id)
        await _last_word(_finish, run_id, "error", error=f"execute: {exc}",
                         msg={"status": "error", "error": "crash"})
        return False
    return True


def _stop_plan(db, run_id: int, rest: list[int]) -> None:
    """Stop pressed while the changes were being made: the ones not started
    are not made; what was made stays made."""
    view = dict(_message_data(db, run_id).get("plan") or {})
    items = list(view.get("items") or [])
    for j in rest:
        if j < len(items) and items[j].get("state") == "pending":
            items[j] = {**items[j], "state": "skipped", "note": "stopped"}
    view["items"] = items
    view["state"] = "finished"
    _finish(db, run_id, "cancelled", msg={"status": "stopped", "plan": view})


def _upload_of(db, fid: int, owner_key: str, field: str):
    f = db.query(AssistantFile).filter(AssistantFile.id == fid,
                                       AssistantFile.owner_key == owner_key).first()
    if f is None:
        return None
    return [(field, (f.name, bytes(f.data), f.mime))]


def _plan_item(db, run_id: int, i: int, state: str, note: str) -> None:
    data = _message_data(db, run_id)
    view = dict(data.get("plan") or {})
    items = list(view.get("items") or [])
    if 0 <= i < len(items):
        items[i] = {**items[i], "state": state, **({"note": note} if note else {})}
    view["items"] = items
    if all(x.get("state") in ("done", "failed", "skipped") for x in items):
        view["state"] = "finished"
    _save(db, run_id, msg={"plan": view})


def _resume_with(db, run_id: int, plan: dict, results: list) -> None:
    _fence(db, run_id)
    r = db.get(AssistantRun, run_id)
    contents = list(r.contents or [])
    call = plan.get("call") or {}
    parts = list(plan.get("pending") or [])
    parts.append(_fresp(call, {"results": results}))
    contents.append({"role": "user", "parts": parts})
    r.contents = contents
    r.status = "running"
    db.commit()
    _save(db, run_id, msg={"status": "running", "thinking": True})


# ── reading a thread ─────────────────────────────────────────────────────────

def _aware(d: Optional[datetime]) -> Optional[datetime]:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def stale(run: AssistantRun) -> bool:
    """No process is driving this run any more: its heartbeat stopped."""
    hb = _aware(run.heartbeat_at)
    return run.status in ACTIVE and hb is not None and _now() - hb > timedelta(seconds=STALE_S)


def _resumable(run: AssistantRun) -> bool:
    born = _aware(run.created_at)
    young = born is None or _now() - born <= timedelta(seconds=RESUME_WINDOW_S)
    return young and int((run.usage or {}).get("resumes") or 0) < MAX_RESUMES


def end_stale(db, run: AssistantRun, *, stopped: bool = False) -> bool:
    """End a run nobody drives any more — Stop was pressed on it, or it is past
    picking up. ONE conditional statement takes it (and voids its lease, so a
    process still holding it somewhere writes nothing more); then it is
    recorded stopped or interrupted."""
    cutoff = _now() - timedelta(seconds=STALE_S)
    n = (db.query(AssistantRun)
         .filter(AssistantRun.id == run.id, AssistantRun.status.in_(ACTIVE),
                 AssistantRun.heartbeat_at < cutoff)
         .update({AssistantRun.lease: None, AssistantRun.heartbeat_at: _now()},
                 synchronize_session=False))
    db.commit()
    if n == 1:
        (_stopped if stopped else _interrupted)(db, run.id)
    db.refresh(run)
    return n == 1


def heal(db, run: AssistantRun) -> None:
    """For a reader that cannot pick a run up (it has no session of the
    owner's): end a run whose process is gone AND that is past picking up —
    too old, or resumed too often. A stale run that can still be picked up is
    left for its owner's next read (`revive`)."""
    if stale(run) and not _resumable(run):
        end_stale(db, run)


def revive(db, run: AssistantRun, ctx: Ctx, spawner) -> bool:
    """The owner's read found their run with no process behind it — a deploy
    handed it off, or the process died. Pick it up here: claim it in ONE
    statement (one reader wins, and the claim's new lease shuts out whatever
    still held the old one), close the tool step the dead process was in, and
    hand the loop — or the confirmed changes not yet made — to ``spawner``.
    Returns True when this call resumed it. Stop pressed, or past picking up:
    ended instead."""
    if not stale(run):
        return False
    mine = _LIVE.get(run.id)
    if mine is not None and not mine.done():
        return False  # still driven here — its beats were only late (a frozen loop)
    if run.cancel_asked or not _resumable(run):
        end_stale(db, run, stopped=bool(run.cancel_asked))
        return False
    cutoff = _now() - timedelta(seconds=STALE_S)
    lease = str(uuid.uuid4())
    claimed = (db.query(AssistantRun)
               .filter(AssistantRun.id == run.id, AssistantRun.status == run.status,
                       AssistantRun.heartbeat_at < cutoff)
               .update({AssistantRun.heartbeat_at: _now(), AssistantRun.lease: lease},
                       synchronize_session=False))
    db.commit()
    if claimed != 1:
        return False  # another reader (or the old process) got there first
    db.refresh(run)
    usage = dict(run.usage or {})
    usage["resumes"] = int(usage.get("resumes") or 0) + 1
    run.usage = usage
    db.commit()
    _end_dead_steps(db, run.id)
    _save(db, run.id, msg={"thinking": run.status == "running", "resumed_at": _now().isoformat(),
                           "call_at": None, "retry": None})
    log.info("assistant run %s resumed (%d) after its process went away", run.id, usage["resumes"])
    executing = run.status == "executing"
    spawner(execute_and_resume(run.id, ctx, lease) if executing
            else drive(run.id, ctx, lease))
    return True


def live_state(run: AssistantRun, data: dict) -> dict:
    """What the chat says while a run works, all on the server's clock:
    the PHASE (model · tool · retry · stopping · stalled), how long it has
    been in it, the retry being made, and whether the run was picked up
    again after a server update. Never a judgement about the question."""
    out: dict = {"alive": not stale(run), "stop_asked": bool(run.cancel_asked),
                 "resumes": int((run.usage or {}).get("resumes") or 0)}
    now = _now()

    def secs(iso: Optional[str]) -> Optional[int]:
        try:
            d = _aware(datetime.fromisoformat(iso)) if iso else None
        except (TypeError, ValueError):
            d = None
        return max(0, int((now - d).total_seconds())) if d else None

    retry = data.get("retry") if isinstance(data.get("retry"), dict) else None
    running_step = any(s.get("state") == "running" for s in data.get("steps") or [])
    if run.cancel_asked:
        phase = "stopping"
    elif not out["alive"]:
        phase = "stalled"
    elif run.status == "executing":
        phase = "executing"
    elif retry:
        phase = "retry"
        out["retry"] = {"n": retry.get("n"), "why": retry.get("why")}
        out["phase_s"] = secs(retry.get("at"))
    elif running_step:
        phase = "tool"
    else:
        phase = "model"
        out["phase_s"] = secs(data.get("call_at"))
    out["phase"] = phase
    if out["resumes"]:
        out["resumed_s"] = secs(data.get("resumed_at"))
    return out


def _end_dead_steps(db, run_id: int) -> None:
    """A tool step the dead process was running never finished: say so, the
    model will ask for it again if it still needs it."""
    data = _message_data(db, run_id)
    steps = list(data.get("steps") or [])
    if any(s.get("state") == "running" for s in steps):
        steps = [{**s, "state": "failed", "note": "restart"} if s.get("state") == "running" else s
                 for s in steps]
        _save(db, run_id, msg={"steps": steps})
