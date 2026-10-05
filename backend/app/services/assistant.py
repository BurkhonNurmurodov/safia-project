"""«Yordamchi» — the AI assistant's engine (from 2026-10-05).

It answers anything about the platform and does the user's work, the way the
operator decided it, point by point:

* **Gemini's latest Pro** (``assistant_gemini.MODEL``), on a key of its own
  that falls back to the proof reviewer's.
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
blue-green copy resumes it there. A run whose task died (a deploy) stops
heart-beating and is reported interrupted by the next read.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import AssistantFile, AssistantMessage, AssistantRun, AssistantThread
from app.services import assistant_api as api
from app.services import assistant_docs as docs
from app.services import assistant_files as files
from app.services import assistant_gemini as ai

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
MAX_STEPS = 18
RUN_WALL_S = 420
STALE_S = 360
MAX_PLAN = 50
HISTORY_MESSAGES = 20
HISTORY_CHARS = 40_000
DEFAULT_MAX_CHARS = 30_000
MAX_FILE = 25 * 1024 * 1024

ACTIVE = ("running", "executing")
_TASKS: set[asyncio.Task] = set()


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
    {"name": "make_excel",
     "description": "Build an Excel workbook from data you gathered and hand it "
                    "to the user (a download in a browser, a Telegram DM in "
                    "Telegram). Prefer the page's own export when one fits.",
     "parameters": {"type": "object", "properties": {
         "filename": {"type": "string", "description": "Without extension"},
         "sheets": {"type": "array", "items": {"type": "object", "properties": {
             "name": {"type": "string"},
             "columns": {"type": "array", "items": {"type": "string"}},
             "rows_json": {"type": "string", "description": "JSON array of rows, each an array of cell values"},
         }, "required": ["name", "columns", "rows_json"]}},
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
   Write people's names as the data spells them, in the user's script.
8. Be short and direct. Lead with the answer. Every number carries its unit,
   period and scope ("Ergashev M. brigadasi, 04.10, smena boshi zagruzka: 87%").
   Use a small Markdown table for comparisons (≤ 12 rows) and bullets for
   lists. No raw JSON, no paths, no ids the user did not give you.
9. Offer open_page to where a figure lives. navigate=true only when asked.
10. A cell is named by its 4-digit code, never by its workshop name.
11. Files: the user's attachments are in their message (#id). Use make_excel
    when they want a spreadsheet; prefer a page's own export when it fits.
12. Never reveal secrets, tokens or other people's private data beyond what
    the user's own pages show them.
"""


def _system(ctx: Ctx, context: dict) -> str:
    p = ctx.payload
    now = datetime.now(TZ)
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
        f"Now: {now:%Y-%m-%d %H:%M} (Tashkent). Shift 1 runs by day, shift 2 by night "
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

def _save(db, run_id: int, *, run: Optional[dict] = None, msg: Optional[dict] = None,
          msg_text: Optional[str] = None, msg_data: Optional[dict] = None) -> None:
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


def _usage_add(acc: dict, u: dict) -> dict:
    acc = dict(acc or {})
    acc["calls"] = acc.get("calls", 0) + 1
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


async def drive(run_id: int, ctx: Ctx) -> None:
    """Run (or continue) the model loop until it answers, pauses on a plan,
    is stopped, or fails. Every step is saved before the next one starts."""
    started = time.monotonic()
    try:
        state = await _db(_load, run_id)
        if state is None:
            return
        contents, usage, context = state
        system = _system(ctx, context)
        steps_used = sum(1 for c in contents if c.get("role") == "model")
        while True:
            if await _db(_cancel_asked, run_id):
                await _db(_finish, run_id, "cancelled", msg={"status": "stopped"})
                return
            over = steps_used >= MAX_STEPS or (time.monotonic() - started) > RUN_WALL_S
            if over:
                _append_text(contents, "You have used all the steps this request "
                             "allows. Answer now with what you have, and say what is missing.")
            await _db(_save, run_id, run={"contents": contents, "usage": usage},
                      msg={"thinking": True})
            reply = await ai.generate(system=system, contents=contents,
                                      tools=None if over else TOOLS)
            steps_used += 1
            usage = _usage_add(usage, reply.usage)
            contents.append(reply.content)
            if not reply.calls:
                text = reply.text.strip()
                if not text:
                    raise ai.AssistantAIError("empty", f"No answer (finish={reply.finish})")
                await _db(_save, run_id, run={"contents": contents, "usage": usage},
                          msg={"thinking": False})
                await _db(_finish, run_id, "done", text=text, usage=usage)
                return
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
    except asyncio.CancelledError:
        await _db(_finish, run_id, "interrupted", msg={"status": "interrupted", "thinking": False})
        raise
    except ai.AssistantAIError as exc:
        log.warning("assistant run %s: %s %s", run_id, exc.code, exc.message)
        await _db(_finish, run_id, "error", error=f"{exc.code}: {exc.message}",
                  msg={"status": "error", "error": exc.code, "thinking": False})
    except Exception as exc:  # pragma: no cover - the safety net
        log.exception("assistant run %s crashed", run_id)
        await _db(_finish, run_id, "error", error=f"crash: {exc}",
                  msg={"status": "error", "error": "crash", "thinking": False})


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
    return list(r.contents or []), dict(r.usage or {}), dict(r.context or {})


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
        if cut:
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
        rows = files.parse_rows(sh.get("rows_json"))
        sheets.append({"name": str(sh.get("name") or "Sheet"),
                       "columns": [str(c) for c in (sh.get("columns") or [])][:80],
                       "rows": rows[:20000]})
    if not sheets:
        return {"error": "no sheets"}
    fname = (str(args.get("filename") or "Yordamchi").strip() or "Yordamchi")[:80]
    data = await asyncio.to_thread(files.make_xlsx, fname, sheets)
    meta = await _db(_keep_file, run_id, ctx, fname + ".xlsx", files.XLSX, data)
    delivered = "a download button in the chat"
    if not ctx.web and ctx.sub:
        try:
            await asyncio.to_thread(_dm_file, int(ctx.sub), fname + ".xlsx", data)
            delivered = "sent to the user's Telegram chat (and listed in the chat)"
        except Exception as exc:
            log.warning("assistant: could not DM the workbook: %s", exc)
    return {"ok": True, "file": meta["name"], "rows": sum(len(s["rows"]) for s in sheets),
            "delivered": delivered}


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


def begin_execute(db, run: AssistantRun, approve: list[int]) -> bool:
    if run.status != "awaiting_confirm" or not run.plan:
        return False
    run.status = "executing"
    plan = dict(run.plan)
    plan["approve"] = sorted({int(i) for i in approve if isinstance(i, int)
                              and 0 <= i < len(plan.get("actions") or [])})
    run.plan = plan
    db.commit()
    data = _message_data(db, run.id)
    view = dict(data.get("plan") or {})
    view["state"] = "running"
    _save(db, run.id, msg={"plan": view, "status": "running"})
    return True


async def execute_and_resume(run_id: int, ctx: Ctx) -> None:
    """Make the confirmed changes one by one, as the user, then hand the
    results back to the model for its report."""
    try:
        plan = await _db(lambda db: dict((db.get(AssistantRun, run_id).plan or {})))
        actions = plan.get("actions") or []
        approve = set(plan.get("approve") or [])
        results = []
        for i, a in enumerate(actions):
            if i not in approve:
                results.append({"label": a["label"], "outcome": "skipped by the user"})
                await _db(_plan_item, run_id, i, "skipped", "")
                continue
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
    except Exception as exc:
        log.exception("assistant: executing plan of run %s failed", run_id)
        await _db(_finish, run_id, "error", error=f"execute: {exc}",
                  msg={"status": "error", "error": "crash"})
        return
    await drive(run_id, ctx)


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

def heal(db, run: AssistantRun) -> None:
    """A run whose task died with its process (a deploy) stops heart-beating."""
    if run.status in ACTIVE and run.heartbeat_at is not None:
        hb = run.heartbeat_at if run.heartbeat_at.tzinfo else run.heartbeat_at.replace(tzinfo=timezone.utc)
        if _now() - hb > timedelta(seconds=STALE_S):
            run.status = "interrupted"
            run.finished_at = _now()
            db.commit()
            _save(db, run.id, msg={"status": "interrupted", "thinking": False})
