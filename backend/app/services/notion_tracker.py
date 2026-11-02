"""«Notion vazifalari» — the Notion "Production" task list in IMS: the daily
Telegram reminders, the bot's group commands, and the read the /notion-tasks
page shows.

Moved here on 2026-11-02 from the stand-alone ``safia-tracker-bot`` (GitHub
Actions started hourly by cron-job.org, with its settings on a GitHub Pages
site), because that needed a paid server to run reliably. Everything about the
MESSAGES is that bot's own code, carried over line for line: Russian, one rich
message per person mentioning only that person, 🚨 overdue / 🔴 today / 🟠
tomorrow / 🟡 later, the ordinary-HTML fallback when Telegram refuses a rich
one, and /tasks, /id, /help in the group. Only where things live changed:

- **The bot** is still @Safia_Tracker_agent, with its own token, kept SEALED
  in ``app_settings`` (``web_auth.seal_password``) and set on the admin tab.
  Its updates arrive on ``/bot/notion-webhook`` (secret token, like the main
  bot), so it answers commands again — the GitHub version could not.
- **Settings** are one JSON blob in ``app_settings`` (``notion_tracker_settings``),
  edited on the admin tab «Notion eslatmalari»; **status** (last send, last
  error, the bot, each group) and **memory** (Telegram IDs behind @usernames,
  groups the bot was added to) are two more.
- **What was sent** is ``notion_tracker_sent``, one row per key, so a retry or
  a restart never repeats a message.
- **When**: a job every minute (one copy, the jobs lock) sends the day's
  messages at the first tick after the send time.
- **Notion** is read with the platform's ``NOTION_TOKEN`` (the Kaizen page's).

Nothing here writes to Notion.
"""
from __future__ import annotations

import contextvars
import datetime as dt
import hashlib
import html
import http.client
import json
import logging
import re
import socket
import ssl
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from app.config import settings as app_settings
from app.database import SessionLocal
from app.models import AppSetting, NotionTrackerSent

logger = logging.getLogger(__name__)

NOTION_API = "https://api.notion.com/v1"
TELEGRAM_API = "https://api.telegram.org"
TZ = dt.timezone(dt.timedelta(hours=5), "Asia/Tashkent")  # no daylight saving

K_SETTINGS = "notion_tracker_settings"
K_TOKEN = "notion_tracker_bot_token"   # sealed
K_STATUS = "notion_tracker_status"
K_MEMORY = "notion_tracker_memory"


def log(msg):
    logger.info("notion-tracker: %s", msg)


# The settings the admin tab edits. A ContextVar, so a send, a preview and a
# command each read the settings they loaded, whichever thread they run on.
@dataclass
class Settings:
    """What the settings tab controls. A missing or unusable value keeps its default."""
    enabled: bool = False
    send_at: dt.time = dt.time(8, 0)
    days: frozenset = frozenset(range(7))  # weekdays to send on, Monday = 0
    remind_days: int = 2                   # deadlines this many days ahead go in the message
    sections_open: bool = False            # task sections start expanded instead of collapsed
    usernames: dict = field(default_factory=dict)    # Notion name, casefolded -> "@username"
    groups: list = field(default_factory=list)       # chat IDs to send to
    group_names: dict = field(default_factory=dict)  # chat ID -> the name the settings tab gave it


_SETTINGS: contextvars.ContextVar = contextvars.ContextVar("notion_tracker_settings", default=Settings())


def S() -> Settings:
    return _SETTINGS.get()


@contextmanager
def using(s: Settings):
    token = _SETTINGS.set(s)
    try:
        yield s
    finally:
        _SETTINGS.reset(token)

# =========================================================================== the GitHub bot's own code
# (reminder_bot.py, carried over as it was; `S()` is its SETTINGS)

NOTION_VERSION = "2025-09-03"
DEFAULT_DATA_SOURCE = "3e4ba473-81d8-8105-a530-000b8de84e98"  # the "Production" task list

# Column names in the Notion task database. Change these if the columns get renamed.
PROP_DUE = "Due date"
PROP_STATUS = "Status"
PROP_ASSIGNEE = "Assignee"
PROP_PRIORITY = "Priority"
PROP_PARENT = "Parent item"
PROP_NOTE = "Izoh"       # the task's description
DONE_STATUSES = {"done"}

DIGEST_DAYS = 7          # how far ahead /tasks looks
MAX_REMIND_DAYS = 3      # the furthest ahead the daily message may look (settings: remind_days)
NOTE_LIMIT = 300         # a longer description is cut; the full text is one tap away in Notion
RICH_BLOCK_LIMIT = 480   # Telegram allows 500 blocks per rich message, and every table row is one
SEND_GAP_SECONDS = 3.1   # Telegram allows about 20 messages a minute in one group
SENT_HISTORY_DAYS = 60   # how long to remember which messages were sent
MESSAGE_LIMIT = 4000     # Telegram allows 4096 characters of visible text per message

WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]
MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
COMMANDS = [
    {"command": "tasks", "description": f"Просроченные задачи и сроки на {DIGEST_DAYS} дней"},
    {"command": "id", "description": "ID и сведения о группе"},
    {"command": "help", "description": "Как работают напоминания"},
]

# For /id
CHAT_TYPES = {"group": "группа", "supergroup": "супергруппа", "channel": "канал", "private": "личный чат"}
MEMBER_STATUSES = {"creator": "владелец", "administrator": "администратор", "member": "участник",
                   "restricted": "участник с ограничениями", "left": "не в группе", "kicked": "заблокирован"}
MEMBER_PERMISSIONS = [  # ChatPermissions fields, in the order Telegram's group settings list them
    ("can_send_messages", "текст"),
    ("can_send_photos", "фото"),
    ("can_send_videos", "видео"),
    ("can_send_other_messages", "стикеры и GIF"),
    ("can_send_audios", "музыка"),
    ("can_send_documents", "файлы"),
    ("can_send_voice_notes", "голосовые"),
    ("can_send_video_notes", "видеосообщения"),
    ("can_add_web_page_previews", "превью ссылок"),
    ("can_send_polls", "опросы"),
    ("can_invite_users", "приглашать"),
    ("can_pin_messages", "закреплять"),
    ("can_change_info", "менять данные группы"),
    ("can_manage_topics", "создавать темы"),
]
ADMIN_RIGHTS = [  # ChatMemberAdministrator fields that matter in a group
    ("can_change_info", "менять данные группы"),
    ("can_delete_messages", "удалять сообщения"),
    ("can_restrict_members", "блокировать участников"),
    ("can_invite_users", "приглашать"),
    ("can_pin_messages", "закреплять"),
    ("can_manage_topics", "управлять темами"),
    ("can_manage_video_chats", "видеочаты"),
    ("can_promote_members", "назначать админов"),
]
SSL_CTX = ssl.create_default_context()
TRANSIENT = (urllib.error.URLError, http.client.HTTPException, socket.timeout, TimeoutError, ConnectionError)


def parse_hhmm(text):
    """dt.time from "HH:MM", or None."""
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", str(text).strip())
    if match and int(match[1]) < 24 and int(match[2]) < 60:
        return dt.time(int(match[1]), int(match[2]))
    return None


# --------------------------------------------------------------------------- HTTP

class ApiError(Exception):
    def __init__(self, service, status, message, params=None):
        super().__init__(f"{service} HTTP {status}: {message}")
        self.service = service
        self.status = status
        self.message = message or ""
        self.params = params or {}


def call_json(service, url, body=None, headers=None, timeout=60, attempts=5):
    """JSON request with retries on rate limits, server errors and network hiccups."""
    data = None if body is None else json.dumps(body).encode("utf-8")
    hdrs = {"Content-Type": "application/json", "User-Agent": "safia-ims-notion-tracker/1.0"}
    hdrs.update(headers or {})
    backoff, last = 2.0, None
    for attempt in range(attempts):
        req = urllib.request.Request(url, data=data, headers=hdrs, method="GET" if data is None else "POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                info = json.loads(raw)
            except ValueError:
                info = {}
            params = info.get("parameters") or {}
            last = ApiError(service, e.code, info.get("description") or info.get("message") or raw[:200], params)
            if (e.code == 429 or e.code >= 500) and attempt < attempts - 1:
                try:
                    wait = float(params.get("retry_after") or e.headers.get("Retry-After") or backoff)
                except ValueError:
                    wait = backoff
                log(f"{service}: HTTP {e.code}, retrying in {wait:.0f}s")
                time.sleep(wait)
                backoff = min(backoff * 2, 60)
                continue
            raise last
        except TRANSIENT as e:
            last = ApiError(service, 0, f"network error: {e}")
            if attempt < attempts - 1:
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
    raise last


class Notion:
    def __init__(self, token):
        self.headers = {"Authorization": f"Bearer {token}", "Notion-Version": NOTION_VERSION}

    def query_all(self, data_source_id):
        rows, cursor = [], None
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            data = call_json("Notion", f"{NOTION_API}/data_sources/{data_source_id}/query",
                             body=body, headers=self.headers)
            rows.extend(data.get("results") or [])
            cursor = data.get("next_cursor")
            if not data.get("has_more") or not cursor:
                return rows


# --------------------------------------------------------------------------- tasks

@dataclass
class Task:
    id: str
    title: str
    url: str
    status: str
    due: Optional[dt.date]
    due_time: Optional[str]
    assignees: List[str] = field(default_factory=list)
    priority: str = ""
    parent_id: Optional[str] = None
    note: str = ""

    @property
    def is_open(self):
        return self.status.strip().lower() not in DONE_STATUSES


def plain(rich):
    return "".join(t.get("plain_text", "") for t in rich or [])


def option_name(prop):
    value = (prop or {}).get((prop or {}).get("type"))
    return value.get("name", "") if isinstance(value, dict) else ""


def person_name(user):
    name = user.get("name") or (user.get("person") or {}).get("email") or "Без имени"
    if "@" in name and " " not in name:  # guests without a name show their email
        name = name.split("@", 1)[0]
    return name


def names(prop):
    """Names in an Assignee column, whether it is a Person, Select, Multi-select or Text column."""
    kind = (prop or {}).get("type")
    value = (prop or {}).get(kind)
    if kind == "people":
        return [person_name(u) for u in value or []]
    if kind == "select":
        return [value["name"]] if value else []
    if kind == "multi_select":
        return [o["name"] for o in value or []]
    if kind == "rich_text":
        return [n.strip() for n in plain(value).split(",") if n.strip()]
    return []


def parse_due(prop, tz):
    """Deadline as (date, "HH:MM" or None). For a date range, the end date is the deadline."""
    value = (prop or {}).get("date") or {}
    raw = value.get("end") or value.get("start")
    if not raw:
        return None, None
    if len(raw) == 10:
        return dt.date.fromisoformat(raw), None
    stamp = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=tz)
    stamp = stamp.astimezone(tz)
    return stamp.date(), stamp.strftime("%H:%M")


def parse_tasks(rows, tz):
    tasks = []
    for r in rows:
        if r.get("object") != "page" or r.get("in_trash") or r.get("archived"):
            continue
        props = r.get("properties") or {}
        title = next((plain(p.get("title")) for p in props.values() if p.get("type") == "title"), "")
        due, due_time = parse_due(props.get(PROP_DUE), tz)
        parent = (props.get(PROP_PARENT) or {}).get("relation") or []
        tasks.append(Task(
            id=r["id"],
            title=" ".join(title.split()) or "Без названия",
            url=r.get("url", ""),
            status=option_name(props.get(PROP_STATUS)),
            due=due,
            due_time=due_time,
            assignees=names(props.get(PROP_ASSIGNEE)),
            priority=option_name(props.get(PROP_PRIORITY)),
            parent_id=parent[0]["id"] if parent else None,
            note=plain((props.get(PROP_NOTE) or {}).get("rich_text")),
        ))
    return tasks


def reminder_stage(task, today):
    """Days left (0 to the remind_days setting) or a negative number when overdue; None if the daily message skips it."""
    if task.due is None or not task.is_open:
        return None
    left = (task.due - today).days
    return left if left <= S().remind_days else None


# --------------------------------------------------------------------------- message text

def plural(n, one, few, many):
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def days_word(n):
    return f"{n} {plural(n, 'день', 'дня', 'дней')}"


def ru_date(d, time_text=None, today=None):
    text = f"{WEEKDAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]}"
    if today is not None and d.year != today.year:
        text += f" {d.year}"
    if time_text:
        text += f", {time_text}"
    return text


def esc(text):
    return html.escape(text or "", quote=False)


def link(url, text):
    return f'<a href="{html.escape(url or "", quote=True)}">{esc(text)}</a>' if url else esc(text)


def people(task):
    return ", ".join(task.assignees) or "Не назначен"


def is_high(task):
    return task.priority.strip().lower() == "high"


def note_lines(task):
    """The task's description as clean lines, cut to NOTE_LIMIT characters."""
    lines = [" ".join(line.split()) for line in task.note.splitlines()]
    text = "\n".join(line for line in lines if line and not re.fullmatch(r"[\d.)•*-]+", line))  # drops empty "2."
    if len(text) > NOTE_LIMIT:
        text = text[:NOTE_LIMIT].rstrip() + "…"
    return text.splitlines()


def short_date(d, time_text=None, today=None):
    text = f"{d.day} {MONTHS_SHORT[d.month - 1]}"
    if today is not None and d.year != today.year:
        text += f" {d.year}"
    if time_text:
        text += f", {time_text}"
    return text


def norm(name):
    return " ".join((name or "").split()).casefold()


@dataclass
class Mentions:
    """Each person's Telegram @username (the settings' team list), mentioned by ID when the bot has seen it.
    A message mentions only its own person: with several @usernames in one message, nobody was notified."""
    usernames: dict  # Notion name, casefolded -> "@username"
    ids: dict        # username, lowercase without @ -> Telegram user ID, learned from people's messages

    def handle(self, name):
        return self.usernames.get(norm(name))

    def html(self, handle):
        user_id = self.ids.get(handle.lstrip("@").lower())
        return f'<a href="tg://user?id={user_id}">{esc(handle)}</a>' if user_id else esc(handle)


def mention_report(sent_html, message):
    """How many of the @usernames we wrote Telegram turned into real mentions (the kind that notify)."""
    written = len(re.findall(r"(?<![\w/])@[A-Za-z]\w{3,31}", re.sub(r'href="[^"]*"', "", sent_html)))
    found = 0
    stack = [message]
    while stack:  # walk the returned Message: "mention" is by @username, "text_mention" is by ID
        node = stack.pop()
        if isinstance(node, dict):
            found += node.get("type") in ("mention", "text_mention")
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    if not written:
        return ""
    if found >= written:
        return f"Telegram turned all {written} @usernames into mentions."
    return (f"Telegram turned only {found} of {written} @usernames into mentions; "
            "the rest are plain text and notify nobody.")


def daily_people(tasks, today):
    """Who gets a message today: (Notion name, their due tasks) in the settings' team order, then anyone
    not in the team list by name; None collects tasks nobody owns, last.
    A task with two assignees is in both people's messages."""
    due = [t for t in tasks if reminder_stage(t, today) is not None]
    order = {name: i for i, name in enumerate(S().usernames)}  # the team list, top to bottom
    names = sorted({n for t in due for n in t.assignees}, key=lambda n: (order.get(norm(n), len(order)), norm(n)))
    people = [(name, [t for t in due if name in t.assignees]) for name in names]
    unassigned = [t for t in due if not t.assignees]
    return people + ([(None, unassigned)] if unassigned else [])


def others(task, person):
    """The task's other assignees, by name only: a second @username in the message would stop the mention working."""
    return esc(", ".join(n for n in task.assignees if n != person))


def task_card(task, today, parent_titles, person):
    """One task in ordinary Telegram HTML (the fallback): title, description, then when · with whom · link."""
    title = f"<b>{esc(task.title)}</b>"
    if is_high(task):
        title = "❗ " + title
    parent = parent_titles.get(task.parent_id)
    if parent:
        title += f" <i>· в задаче «{esc(parent)}»</i>"
    when = "срок " + short_date(task.due, task.due_time, today)
    late = (today - task.due).days
    if late > 0:
        when += f" ({days_word(late)} назад)"
    meta = f"⏳ <i>{when}</i>"
    if others(task, person):
        meta += f" · 👥 <i>вместе с {others(task, person)}</i>"
    if task.url:
        meta += " · 🔗 " + link(task.url, "Открыть")
    return "\n    ".join([title] + [esc(line) for line in note_lines(task)] + [meta])


def task_table(task, number, today, parent_titles, person):
    """One task as its own Rich HTML table: the title row, then one row per detail.
    Returns (html, rows); Telegram counts each row toward the 500-block limit."""
    when = ru_date(task.due, task.due_time, today)
    late = (today - task.due).days
    if late > 0:
        when += f" · <b>просрочено на {days_word(late)}</b>"
    note = " · ".join(esc(line) for line in note_lines(task))  # table cells take inline text only, no <br>
    rows = [("📝 Описание", note),  # ⏳, not 📅: Apple draws 📅 as a page reading "JUL 17"
            ("👥 Вместе с", others(task, person)),
            ("⏳ Срок", when),
            ("❗ Приоритет", "<b>Высокий</b>" if is_high(task) else ""),
            ("📂 Входит в", esc(parent_titles.get(task.parent_id, ""))),
            ("🔗 Notion", link(task.url, "Открыть задачу") if task.url else "")]
    rows = [(label, value) for label, value in rows if value]
    body = "".join(f"<tr><td><i>{label}</i></td><td>{value}</td></tr>" for label, value in rows)
    head = f'<tr><th colspan="2" align="left">{number}. {esc(task.title)}</th></tr>'
    return f"<table bordered>{head}{body}</table>", 2 + len(rows)  # the table, its title row, the detail rows


def daily_groups(tasks, today):
    """A message's sections as (icon, title, word for the summary line, tasks); empty ones left out."""
    due = [t for t in tasks if reminder_stage(t, today) is not None]
    order = lambda t: (t.due, not is_high(t), t.due_time or "", t.title)  # most overdue, then high priority
    sections = [  # 🚨, not ⛔: at chat size ⛔ looks like the same red circle as 🔴
        ("🚨", "Просрочено", "просрочено", lambda left: left < 0),
        ("🔴", "Сегодня", "сегодня", lambda left: left == 0),
        ("🟠", "Завтра", "завтра", lambda left: left == 1),
    ] + [("🟡", f"Через {days_word(n)}", f"через {days_word(n)}", lambda left, n=n: left == n)
         for n in range(2, MAX_REMIND_DAYS + 1)]
    groups = []
    for icon, title, word, match in sections:
        items = sorted((t for t in due if match((t.due - today).days)), key=order)
        if items:
            groups.append((icon, title, word, items))
    return groups


def summary_line(groups):
    return " · ".join(f"{icon} <b>{len(items)}</b> {word}" for icon, _, word, items in groups)


def person_heading(person, groups, today, mentions, rich):
    """Whose tasks these are, the person's one mention, and their counts."""
    counts = summary_line(groups)
    if person is None:
        title, line = "❔ Без ответственного", f"{counts} · назначьте ответственного в Notion"
    else:
        handle = mentions.handle(person)
        title, line = f"👤 {esc(person)}", (mentions.html(handle) + " · " if handle else "") + counts
    if rich:
        return [f"<h3>{title} · {ru_date(today)}</h3>", f"<p>{line}</p>"]
    return [f"<b>{title}</b> · {ru_date(today)}", line]


def person_rich_messages(person, tasks, today, parent_titles, mentions):
    """One person's daily message as Rich HTML for sendRichMessage, one table per task.
    Usually one message; more only when Telegram's 500-block limit would be crossed. [] when nothing is due."""
    groups = daily_groups(tasks, today)
    if not groups:
        return []
    messages, blocks = [], person_heading(person, groups, today, mentions, rich=True)
    used = len(blocks)
    for icon, title, _, items in groups:
        tables, continued = [], False
        for number, task in enumerate(items, 1):
            table, size = task_table(task, number, today, parent_titles, person)
            if tables and used + 1 + size > RICH_BLOCK_LIMIT:  # +1 for the section's details block
                blocks.append(section_html(f"{icon} {title}", len(items), tables, continued))
                messages.append("".join(blocks))
                blocks, used, tables, continued = [], 0, [], True
            tables.append(table)
            used += size
        blocks.append(section_html(f"{icon} {title}", len(items), tables, continued))
        used += 1
    messages.append("".join(blocks))
    return messages


def section_html(title, count, tables, continued):
    label = f"{title} · {count}" + (" (продолжение)" if continued else "")
    details = "<details open>" if S().sections_open else "<details>"  # collapsed: a tap opens it
    return f"{details}<summary><b>{label}</b></summary>{''.join(tables)}</details>"


def person_plain_messages(person, tasks, today, parent_titles, mentions):
    """One person's daily message in ordinary formatting, for when Telegram rejects the rich one."""
    groups = daily_groups(tasks, today)
    lines = person_heading(person, groups, today, mentions, rich=False)
    for icon, title, _, items in groups:
        lines += ["", f"{icon} <b>{title} · {len(items)}</b>"]
        for i, t in enumerate(items, 1):
            lines += ["", f"{i}. " + task_card(t, today, parent_titles, person)]
    return pack_lines(lines)


def digest_messages(tasks, today):
    """The /tasks reply, split into Telegram-sized messages."""
    open_tasks = [t for t in tasks if t.is_open]
    dated = [t for t in open_tasks if t.due]
    undated = len(open_tasks) - len(dated)
    order = lambda t: (t.due, t.due_time or "", t.title)
    left = lambda t: (t.due - today).days
    groups = [
        ("🚨", "Просрочено", [t for t in dated if left(t) < 0],
         lambda t: "просрочено на " + days_word(-left(t))),
        ("🔴", "Сегодня", [t for t in dated if left(t) == 0], lambda t: t.due_time or ""),
        ("🟠", "Завтра", [t for t in dated if left(t) == 1], lambda t: t.due_time or ""),
        ("🟡", f"Через 2–{DIGEST_DAYS} дней", [t for t in dated if 2 <= left(t) <= DIGEST_DAYS],
         lambda t: ru_date(t.due, t.due_time, today)),
    ]
    sections, footers = [], []
    for icon, label, items, note in groups:
        if items:
            lines = []
            for t in sorted(items, key=order):
                extra = note(t)
                lines.append(f"• {link(t.url, t.title)}\n   {esc(people(t))}" + (f" · {esc(extra)}" if extra else ""))
            sections.append((f"{icon} <b>{label} · {len(items)}</b>", lines))
    if not sections:
        footers.append(f"Просроченных задач нет, и на ближайшие {DIGEST_DAYS} дней сроков нет.")
    if undated:
        footers.append(f"<i>Без срока: {undated} {plural(undated, 'задача', 'задачи', 'задач')}. "
                       "О них я не напоминаю.</i>")

    messages, current = [], f"<b>Сроки задач</b> · {ru_date(today)}"
    for header, lines in sections:
        for i, line in enumerate(lines):
            piece = (f"\n\n{header}\n" if i == 0 else "\n") + line
            if telegram_length(current + piece) > MESSAGE_LIMIT:
                messages.append(current)
                current = (f"{header} <i>(продолжение)</i>\n" if i else f"{header}\n") + line
            else:
                current += piece
    for footer in footers:
        if telegram_length(current + "\n\n" + footer) > MESSAGE_LIMIT:
            messages.append(current)
            current = footer
        else:
            current += "\n\n" + footer
    messages.append(current)
    return messages


def help_html():
    ahead = (["🔴 срок сегодня", "🟠 срок завтра"]
             + [f"🟡 срок через {days_word(n)}" for n in range(2, MAX_REMIND_DAYS + 1)])[:S().remind_days + 1]
    return (f"<b>Напоминания о сроках задач из Notion</b>\n\n"
            f"Каждый день в {S().send_at:%H:%M} я присылаю сюда каждому ответственному отдельное сообщение "
            "и отмечаю его, чтобы пришло уведомление. В сообщении его задачи:\n"
            "🚨 просроченные, каждый день, пока статус задачи не станет Done\n"
            + "\n".join(ahead) + "\n\n"
            "У каждой задачи: 📝 описание, 👥 с кем вместе, ⏳ срок и 🔗 ссылка на Notion.\n"
            "Задачи без ответственного приходят последним сообщением.\n\n"
            "Задачи без срока и задачи со статусом Done я пропускаю.\n\n"
            f"/tasks: просроченные задачи и сроки на {DIGEST_DAYS} дней вперёд\n"
            "/id: ID и сведения о группе")


def user_name(user):
    name = " ".join(p for p in (user.get("first_name"), user.get("last_name")) if p) or "Без имени"
    return name + (f" (@{user['username']})" if user.get("username") else "")


def duration_ru(seconds):
    if seconds % 86400 == 0:
        return days_word(seconds // 86400)
    if seconds % 3600 == 0:
        return f"{seconds // 3600} ч"
    if seconds % 60 == 0:
        return f"{seconds // 60} мин"
    return f"{seconds} с"


def group_info_messages(full_info, member_count, admins, bot_member, msg, reminders):
    """The /id reply. full_info is getChat's result; it, member_count, admins and bot_member are None
    when Telegram didn't return them. Admins who post anonymously stay anonymous."""
    info = full_info or msg["chat"]
    supergroup = info.get("type") == "supergroup"
    forum = bool(info.get("is_forum"))
    bot_is_admin = (bot_member or {}).get("status") in ("creator", "administrator")
    applies = lambda key: forum or key != "can_manage_topics"
    yes_no = lambda key: "да" if info.get(key) else "нет"
    off_or = lambda key: duration_ru(info[key]) if info.get(key) else "выкл."

    kind = CHAT_TYPES.get(info.get("type"), info.get("type") or "")
    lines = [f"ℹ️ <b>{esc(info.get('title') or 'Группа')}</b>", "",
             f"🆔 ID: <code>{info['id']}</code>",
             "Тип: " + kind + (" с темами" if forum else "")]
    if info.get("type") == "group":
        lines.append("<i>Когда группа станет супергруппой, её ID изменится.</i>")
    if msg.get("is_topic_message") and msg.get("message_thread_id"):
        lines.append(f"ID темы: <code>{msg['message_thread_id']}</code>")
    usernames = info.get("active_usernames") or ([info["username"]] if info.get("username") else [])
    if usernames:
        lines.append("Публичная ссылка: " + ", ".join(f"t.me/{esc(u)}" for u in usernames))
    if info.get("invite_link"):
        lines.append(f"Ссылка-приглашение: {esc(info['invite_link'])}")
    if member_count is not None:
        lines.append(f"Участников: {member_count}")
    if info.get("linked_chat_id"):
        lines.append(f"Связанный канал: <code>{info['linked_chat_id']}</code>")
    if info.get("description"):
        lines += ["", "<b>Описание</b>", esc(info["description"])]

    if full_info is None:
        lines += ["", "<i>Telegram не прислал подробные сведения о группе. Попробуйте /id ещё раз через минуту.</i>"]
    else:
        lines += ["", "<b>Настройки</b>"]
        if supergroup:
            lines.append(f"Медленный режим: {off_or('slow_mode_delay')}")
        lines += [f"Автоудаление сообщений: {off_or('message_auto_delete_time')}",
                  f"Запрет пересылки и копирования: {yes_no('has_protected_content')}"]
        if supergroup:
            lines += [f"Вступление по заявке: {yes_no('join_by_request')}",
                      f"Список участников скрыт: {yes_no('has_hidden_members')}"]
        if supergroup and bot_is_admin:  # Telegram shows these two only to administrators
            lines += [f"Новые участники видят историю: {yes_no('has_visible_history')}",
                      f"Агрессивный антиспам: {yes_no('has_aggressive_anti_spam_enabled')}"]

    perms = info.get("permissions")
    if perms:
        allowed = [label for key, label in MEMBER_PERMISSIONS if applies(key) and perms.get(key)]
        denied = [label for key, label in MEMBER_PERMISSIONS if applies(key) and not perms.get(key)]
        lines += ["", "<b>Что могут участники</b>"]
        if allowed:
            lines.append("✅ " + ", ".join(allowed))
        if denied:
            lines.append("🚫 " + ", ".join(denied))

    roles = {}
    if admins is not None:
        lines += ["", f"<b>Администраторы · {len(admins)}</b>"]
        for a in sorted(admins, key=lambda a: (a.get("status") != "creator", bool(a["user"].get("is_bot")))):
            role = MEMBER_STATUSES.get(a.get("status"), "администратор")
            user = a["user"]
            if a.get("is_anonymous"):
                lines.append(f"• Анонимный {role}")
                continue
            if a.get("custom_title"):
                role += f" «{a['custom_title']}»"
            roles[user["id"]] = role
            icon = "🤖 " if user.get("is_bot") else ""
            lines.append(f"• {icon}{esc(user_name(user))} · <code>{user['id']}</code> · {esc(role)}")

    lines += ["", "<b>Бот</b>"]
    if bot_member:
        status = bot_member.get("status")
        lines.append(f"Статус: {MEMBER_STATUSES.get(status, status)}")
        if bot_is_admin:
            rights = [label for key, label in ADMIN_RIGHTS if applies(key) and bot_member.get(key)]
            lines.append("Права: " + (", ".join(rights) or "без дополнительных прав"))
        else:
            lines.append("<i>Ссылку-приглашение и часть настроек я вижу, только если я администратор.</i>")
    lines.append(reminders)

    sender, sender_chat = msg.get("from") or {}, msg.get("sender_chat")
    lines += ["", "<b>Вы</b>"]
    if sender_chat:
        lines.append(f"Сообщение отправлено от имени «{esc(sender_chat.get('title') or '')}», "
                     "поэтому ваш личный ID не виден.")
    elif sender:
        role = roles.get(sender["id"]) or ("участник" if admins is not None else "")
        lines.append(f"{esc(user_name(sender))} · <code>{sender['id']}</code>" + (f" · {esc(role)}" if role else ""))
    return pack_lines(lines)


def pack_lines(lines):
    """Join lines into as few Telegram-sized messages as possible, breaking only between lines."""
    messages, current = [], ""
    for line in lines:
        if current and telegram_length(current + "\n" + line) > MESSAGE_LIMIT:
            messages.append(current.strip("\n"))
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    messages.append(current.strip("\n"))
    return messages


def to_console(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def telegram_length(text):
    """Visible length as Telegram counts it: UTF-16 units, without HTML tags."""
    return len(to_console(text).encode("utf-16-le")) // 2


# =========================================================================== IMS
# Everything below replaces the stand-alone bot's files, .env and GitHub run
# with the platform's database, scheduler and webhook.

DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
USERNAME_RE = re.compile(r"@[A-Za-z]\w{3,31}")
CHAT_RE = re.compile(r"-?\d{5,20}")
RETRY_S = 600            # a failed send is tried again 10 minutes later; nothing already sent repeats
TASKS_CACHE_S = 60       # the page reads Notion at most once a minute (10 s on «refresh»)

# Carried over once from safia-tracker-bot's data/settings.json (2026-11-02),
# with the operator's change: the TEST group first, the work group
# («Рабочая группа», -1002661831949) switched on later on the settings tab, and
# paused until an admin switches it on.
SEED_SETTINGS = {
    "enabled": False,
    "send_at": "08:00",
    "days": list(DAY_KEYS),
    "remind_days": 2,
    "sections_open": False,
    "team": [
        {"name": "Maqsud Mamatov", "telegram": "@Maksud_Mamatov"},
        {"name": "Sultonov Abror", "telegram": "@Abror_Sultonov_safia"},
        {"name": "adiy.ruziev77", "telegram": "@Adiy_1410"},
        {"name": "Umarbek Karimov", "telegram": "@Mr_karimofff"},
        {"name": "Ikromxõja Shaysayev", "telegram": "@Shaysayev_Ikromxoja"},
        {"name": "Xurshid Rajabov", "telegram": "@Xurshid_0701"},
        {"name": "Abbos", "telegram": "@wocnaoisnc"},
        {"name": "Beck Alimov", "telegram": "@aliimovb"},
        {"name": "Usmonov Sirojiddin", "telegram": "@sirojiddin_assistent_production"},
        {"name": "Azizxon Yoqutxonov", "telegram": "@CPO_assistant"},
    ],
    "groups": [{"name": "Test Group", "chat_id": -1003966895975}],
}
# …and what the bot had learned: the Telegram IDs behind four @usernames (so
# they are mentioned by ID, which always notifies) and the groups it is in.
SEED_MEMORY = {
    "users": {
        "burkhon_n": {"id": 6302307151, "name": "Burkhon (@burkhon_n)"},
        "wocnaoisnc": {"id": 811884943, "name": "Aббос (@wocnaoisnc)"},
        "maksud_mamatov": {"id": 3962847, "name": "Maksud Mamatov (@Maksud_Mamatov)"},
        "cpo_assistant": {"id": 8650841487, "name": "Azizxon Yoqutxonov (@CPO_assistant)"},
    },
    "seen_groups": {"-1003966895975": "Test Group", "-1002661831949": "Рабочая группа"},
}


# --------------------------------------------------------------------------- storage

def _read(db, key, default=None):
    row = db.get(AppSetting, key)
    if not row or not row.value:
        return default
    try:
        return json.loads(row.value)
    except ValueError:
        return default


def _write(db, key, value):
    text = json.dumps(value, ensure_ascii=False)
    row = db.get(AppSetting, key)
    if row:
        row.value = text
    else:
        db.add(AppSetting(key=key, value=text))


def _mutate(key, fn):
    """Read-modify-write one JSON blob under a row lock: the job, a webhook
    update and a request may all write the same one. `fn` changes the dict in
    place. Returns the dict as stored."""
    for attempt in (1, 2):
        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter(AppSetting.key == key).with_for_update().first()
            data = {}
            if row and row.value:
                try:
                    data = json.loads(row.value) or {}
                except ValueError:
                    data = {}
            before = json.dumps(data, sort_keys=True, ensure_ascii=False)
            fn(data)
            if json.dumps(data, sort_keys=True, ensure_ascii=False) != before:
                text = json.dumps(data, ensure_ascii=False)
                if row:
                    row.value = text
                else:
                    db.add(AppSetting(key=key, value=text))
            db.commit()
            return data
        except IntegrityError:  # two first writes raced on the insert: the second re-reads
            db.rollback()
            if attempt == 2:
                raise
        finally:
            db.close()


def seed() -> None:
    """Boot step: put the carried-over settings and memory in place when they
    are not there yet. Never overwrites — what an admin saved stands."""
    with SessionLocal() as db:
        wrote = []
        if db.get(AppSetting, K_SETTINGS) is None:
            _write(db, K_SETTINGS, SEED_SETTINGS)
            wrote.append("settings")
        if db.get(AppSetting, K_MEMORY) is None:
            _write(db, K_MEMORY, SEED_MEMORY)
            wrote.append("memory")
        db.commit()
    if wrote:
        log(f"seeded {', '.join(wrote)} from the GitHub bot (test group, paused)")


def raw_settings(db) -> dict:
    return _read(db, K_SETTINGS, {}) or {}


def parse_settings(raw: dict) -> Settings:
    """The stored JSON as Settings (the GitHub bot's load_settings): an unusable
    value keeps its default."""
    s = Settings()
    if isinstance(raw.get("enabled"), bool):
        s.enabled = raw["enabled"]
    send_at = parse_hhmm(raw.get("send_at") or "")
    if send_at:
        s.send_at = send_at
    days = raw.get("days")
    if isinstance(days, list) and all(d in DAY_KEYS for d in days):
        s.days = frozenset(DAY_KEYS.index(d) for d in days)
    rd = raw.get("remind_days")
    if isinstance(rd, int) and not isinstance(rd, bool) and 0 <= rd <= MAX_REMIND_DAYS:
        s.remind_days = rd
    if isinstance(raw.get("sections_open"), bool):
        s.sections_open = raw["sections_open"]
    for person in raw.get("team") or []:
        name = " ".join(str((person or {}).get("name") or "").split())
        handle = "@" + str((person or {}).get("telegram") or "").strip().lstrip("@")
        if name and USERNAME_RE.fullmatch(handle):
            s.usernames[name.casefold()] = handle
    for group in raw.get("groups") or []:
        chat_id = str((group or {}).get("chat_id") or "").strip() if isinstance(group, dict) else ""
        if CHAT_RE.fullmatch(chat_id) and int(chat_id) not in s.groups:
            s.groups.append(int(chat_id))
            s.group_names[int(chat_id)] = " ".join(str(group.get("name") or "").split())
    return s


def settings_out(raw: dict) -> dict:
    """What the settings tab edits, every field filled in."""
    s = parse_settings(raw)
    team = []
    for person in raw.get("team") or []:
        name = " ".join(str((person or {}).get("name") or "").split())
        handle = "@" + str((person or {}).get("telegram") or "").strip().lstrip("@")
        if name and USERNAME_RE.fullmatch(handle):
            team.append({"name": name, "telegram": handle})
    return {
        "enabled": s.enabled,
        "send_at": f"{s.send_at:%H:%M}",
        "days": [DAY_KEYS[d] for d in sorted(s.days)],
        "remind_days": s.remind_days,
        "sections_open": s.sections_open,
        "team": team,
        "groups": [{"name": s.group_names.get(c, ""), "chat_id": c} for c in s.groups],
    }


def clean_settings(body: dict):
    """The settings tab's Save, checked whole: (the JSON to store, {field: error
    code}). Nothing is stored while any field is wrong."""
    errors, out = {}, {}
    out["enabled"] = bool(body.get("enabled"))
    t = parse_hhmm(body.get("send_at") or "")
    if t:
        out["send_at"] = f"{t:%H:%M}"
    else:
        errors["send_at"] = "time"
    days = body.get("days")
    if isinstance(days, list) and all(d in DAY_KEYS for d in days):
        out["days"] = [d for d in DAY_KEYS if d in days]
    else:
        errors["days"] = "days"
    rd = body.get("remind_days")
    if isinstance(rd, int) and not isinstance(rd, bool) and 0 <= rd <= MAX_REMIND_DAYS:
        out["remind_days"] = rd
    else:
        errors["remind_days"] = "range"
    out["sections_open"] = bool(body.get("sections_open"))
    team, names = [], set()
    for i, person in enumerate(body.get("team") or []):
        name = " ".join(str((person or {}).get("name") or "").split())
        handle = "@" + str((person or {}).get("telegram") or "").strip().lstrip("@")
        if not name:
            errors[f"team.{i}.name"] = "required"
        elif name.casefold() in names:
            errors[f"team.{i}.name"] = "duplicate"
        if not USERNAME_RE.fullmatch(handle):
            errors[f"team.{i}.telegram"] = "username"
        if name and name.casefold() not in names and USERNAME_RE.fullmatch(handle):
            names.add(name.casefold())
            team.append({"name": name, "telegram": handle})
    out["team"] = team
    groups, ids = [], set()
    for i, group in enumerate(body.get("groups") or []):
        chat_id = str((group or {}).get("chat_id") or "").strip()
        name = " ".join(str((group or {}).get("name") or "").split())
        if not CHAT_RE.fullmatch(chat_id):
            errors[f"groups.{i}.chat_id"] = "chat_id"
        elif int(chat_id) in ids:
            errors[f"groups.{i}.chat_id"] = "duplicate"
        else:
            ids.add(int(chat_id))
            groups.append({"name": name, "chat_id": int(chat_id)})
    out["groups"] = groups
    return out, errors


def save_settings(clean: dict) -> None:
    with SessionLocal() as db:
        _write(db, K_SETTINGS, clean)
        db.commit()
    reset_retry()


def raw_settings_now() -> dict:
    with SessionLocal() as db:
        return raw_settings(db)


def _move_group(old_id, new_id) -> None:
    """Telegram upgraded a group to a supergroup and gave it a new ID: follow it
    in the settings, so the next day goes to the new ID too."""
    def fn(raw):
        for g in raw.get("groups") or []:
            if str(g.get("chat_id")) == str(old_id):
                g["chat_id"] = int(new_id)
    _mutate(K_SETTINGS, fn)

    def mem(m):
        seen = m.setdefault("seen_groups", {})
        title = seen.pop(str(old_id), None)
        if title is not None:
            seen[str(new_id)] = title
    _mutate(K_MEMORY, mem)
    log(f"group {old_id} became a supergroup with ID {new_id}: the settings follow it")


# --------------------------------------------------------------------------- bot token

def bot_token(db) -> str:
    from app.web_auth import open_password
    row = db.get(AppSetting, K_TOKEN)
    return (open_password(row.value) if row and row.value else None) or ""


def token_hint(token: str) -> Optional[str]:
    return f"…{token[-4:]}" if token else None


def save_token(token: str) -> None:
    from app.web_auth import seal_password
    with SessionLocal() as db:
        row = db.get(AppSetting, K_TOKEN)
        if row:
            row.value = seal_password(token)
        else:
            db.add(AppSetting(key=K_TOKEN, value=seal_password(token)))
        db.commit()
    _mutate(K_MEMORY, lambda m: m.pop("webhook_sig", None))


# --------------------------------------------------------------------------- status

def write_status(**changes) -> None:
    _mutate(K_STATUS, lambda d: d.update(changes))


def record_error(code: str, detail: str, now) -> None:
    """Put a failed run on the settings tab. The same error again keeps its first time."""
    def fn(d):
        e = d.get("error") or {}
        if e.get("code") == code and e.get("detail") == detail:
            return
        d["error"] = {"at": now.isoformat(timespec="seconds"), "code": code, "detail": detail}
    _mutate(K_STATUS, fn)


def clear_token_errors() -> None:
    """A token Telegram just accepted: drop the token errors and try again at once."""
    def fn(d):
        if (d.get("error") or {}).get("code") in ("telegram_token", "no_token"):
            d["error"] = None
    _mutate(K_STATUS, fn)
    reset_retry()


class NotionMissing(Exception):
    pass


class NoToken(Exception):
    pass


def explain(error):
    """(code, detail) of a failed run, for the settings tab to word."""
    if isinstance(error, NotionMissing):
        return "notion_missing", ""
    if isinstance(error, NoToken):
        return "no_token", ""
    if isinstance(error, ApiError):
        if error.service == "Telegram" and error.status in (401, 404):
            return "telegram_token", ""
        if error.service == "Notion" and error.status == 401:
            return "notion_token", ""
        if error.service == "Notion" and error.status == 404:
            return "notion_not_found", ""
        return "service", f"{error.service}: {error.message or error.status}"
    return "other", str(error)[:300]


# --------------------------------------------------------------------------- Notion

def notion_token() -> str:
    from app.services.notion_kaizen import _token
    return _token()


def load_tasks():
    token = notion_token()
    if not token:
        raise NotionMissing()
    tasks = parse_tasks(Notion(token).query_all(DEFAULT_DATA_SOURCE), TZ)
    _remember_tasks(tasks)
    return tasks


_CACHE = {"at": 0.0, "read_at": None, "tasks": None}
_CACHE_LOCK = threading.Lock()


def _remember_tasks(tasks) -> None:
    _CACHE.update(at=time.monotonic(), tasks=tasks,
                  read_at=dt.datetime.now(TZ).isoformat(timespec="seconds"))


def cached_tasks(force: bool = False):
    """The task list for the page: read at most once a minute (10 s when asked to
    refresh), one read at a time — viewers asking together share it."""
    with _CACHE_LOCK:
        age = time.monotonic() - _CACHE["at"]
        if _CACHE["tasks"] is not None and age < (10 if force else TASKS_CACHE_S):
            return _CACHE["tasks"], _CACHE["read_at"]
        load_tasks()
        return _CACHE["tasks"], _CACHE["read_at"]


# --------------------------------------------------------------------------- Telegram

class Tracker:
    """The bot, for one run: its token and the gap Telegram needs between messages."""

    def __init__(self, token):
        self.token = token
        self.last_sent = 0.0
        self.bot_id = None
        self.username = ""

    def tg(self, method, payload=None, timeout=60, attempts=5):
        url = f"{TELEGRAM_API}/bot{self.token}/{method}"
        return call_json("Telegram", url, body=payload or {}, timeout=timeout, attempts=attempts)["result"]

    def me(self):
        if self.bot_id is None:
            info = self.tg("getMe", attempts=3)
            self.bot_id, self.username = info.get("id"), info.get("username", "")
        return self.bot_id

    def post(self, method, payload):
        """Call a send method, following the group to its new chat ID if it became a supergroup."""
        try:
            return self.tg(method, payload)
        except ApiError as e:
            new_id = e.params.get("migrate_to_chat_id")
            if not new_id:
                raise
            _move_group(payload["chat_id"], new_id)
            payload["chat_id"] = new_id
            return self.tg(method, payload)

    def send(self, chat_id, text, reply_to=None):
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                   "link_preview_options": {"is_disabled": True}}
        if reply_to:
            payload["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
        return self.post("sendMessage", payload)

    def send_rich(self, chat_id, rich_html):
        return self.post("sendRichMessage", {"chat_id": chat_id, "rich_message": {"html": rich_html}})


def mentions(db) -> Mentions:
    mem = _read(db, K_MEMORY, {}) or {}
    return Mentions(S().usernames, {u: (info or {}).get("id") for u, info in (mem.get("users") or {}).items()
                                    if (info or {}).get("id")})


# --------------------------------------------------------------------------- what was sent

def daily_key(today, chat):
    return f"daily|{today.isoformat()}|{chat}"


def _sent_keys(today) -> set:
    prefix = f"daily|{today.isoformat()}|"
    with SessionLocal() as db:
        rows = db.query(NotionTrackerSent.key).filter(NotionTrackerSent.key.startswith(prefix)).all()
    return {r[0] for r in rows}


def _mark(key, today) -> None:
    with SessionLocal() as db:
        db.execute(pg_insert(NotionTrackerSent).values(key=key, day=today.isoformat())
                   .on_conflict_do_nothing(index_elements=["key"]))
        db.commit()


def _prune(today) -> None:
    cutoff = (today - dt.timedelta(days=SENT_HISTORY_DAYS)).isoformat()
    with SessionLocal() as db:
        db.query(NotionTrackerSent).filter(NotionTrackerSent.day < cutoff).delete(synchronize_session=False)
        db.commit()


# --------------------------------------------------------------------------- sending

def send_reminders(today, tracker, tasks, ments):
    """Send each person's message for today to every group that hasn't had it, and
    put the outcome on the settings tab. Returns True when nothing failed."""
    s = S()
    parents = {t.id: t.title for t in tasks}
    people = daily_people(tasks, today)
    sent = _sent_keys(today)
    todo = [chat for chat in s.groups if daily_key(today, chat) not in sent]
    already, failed = not todo, []
    if not people:
        log(f"daily messages for {today}: nothing is overdue or due soon, so nothing to send")
    for chat in todo if people else []:
        key, group_failed = daily_key(today, chat), False
        name = s.group_names.get(chat) or ""
        where = f"«{name}»" if name else f"group {chat}"
        for person, items in people:
            person_key = f"{key}|{norm(person) or '-'}"
            if person_key in sent:
                continue
            try:
                send_person(tracker, person, items, today, parents, ments, person_key, chat, sent)
            except ApiError as e:
                group_failed = True
                failed.append(f"{person or 'без ответственного'} → {where}: {e.message or e}")
                log(f"could not send the message for {person or 'unassigned tasks'} to {where}: {e}")
                if e.status == 403 or "chat not found" in e.message.lower():
                    break  # the bot was removed from the group; retry the rest later
        if not group_failed:
            _mark(key, today)
            log(f"daily messages for {today}: sent to {where}, one per person ({len(people)})")
    if not people:
        for chat in todo:
            _mark(daily_key(today, chat), today)
    now = dt.datetime.now(TZ)
    if failed:
        record_error("send_failed", "; ".join(failed)[:1500], now)
    elif not already:
        write_status(last_sent={"date": today.isoformat(), "at": now.isoformat(timespec="seconds"),
                                "messages": len(people), "groups": len(todo)},
                     error=None,
                     notion_people=sorted({n for t in tasks if t.is_open for n in t.assignees}, key=norm))
    return not failed


def send_person(tracker, person, tasks, today, parents, ments, key, chat_id, sent, record=True):
    """One person's message to one chat: rich, or ordinary formatting if Telegram rejects the rich one.
    record=False (a preview) sends without noting it as sent. Raises ApiError when it can't be sent."""
    label = person or "unassigned tasks"
    rich = person_rich_messages(person, tasks, today, parents, ments)
    try:
        send_parts(tracker, rich, f"{key}|rich", today, True, chat_id, sent, record)
    except ApiError as e:
        if e.status not in (400, 404) or "chat not found" in e.message.lower():
            raise  # network trouble, rate limit, or the bot was removed from the group
        log(f"Telegram rejected the rich message for {label} ({e}); sending it in ordinary formatting")
        plain_parts = person_plain_messages(person, tasks, today, parents, ments)
        send_parts(tracker, plain_parts, f"{key}|plain", today, False, chat_id, sent, record)
    if record:
        _mark(key, today)
        sent.add(key)


def send_parts(tracker, parts, prefix, today, rich, chat_id, sent, record=True):
    """Send the parts that have not gone out yet, recording each one so a retry never repeats it."""
    for i, part in enumerate(parts):
        part_key = f"{prefix}|{i}"
        if record and part_key in sent:
            continue
        wait = tracker.last_sent + SEND_GAP_SECONDS - time.monotonic()  # about 20 messages a minute per group
        if wait > 0:
            time.sleep(wait)
        tracker.send_rich(chat_id, part) if rich else tracker.send(chat_id, part)
        tracker.last_sent = time.monotonic()
        if record:
            _mark(part_key, today)
            sent.add(part_key)


def check_telegram(tracker) -> bool:
    """Tell the settings tab which bot the token belongs to and whether it can
    reach each group it sends to. Returns False when Telegram rejects the token."""
    now = dt.datetime.now(TZ)
    try:
        tracker.me()
    except ApiError as e:
        if e.status in (401, 404):
            write_status(bot={"ok": False})
            record_error("telegram_token", "", now)
            return False
        log(f"Telegram is not reachable right now ({e})")
        return True
    groups = {}
    for chat in S().groups:
        try:
            info = tracker.tg("getChat", {"chat_id": chat}, attempts=2)
            member = tracker.tg("getChatMember", {"chat_id": chat, "user_id": tracker.bot_id}, attempts=2)
        except ApiError as e:
            moved = e.params.get("migrate_to_chat_id")
            groups[str(chat)] = {"ok": False, "moved_to": moved, "error": None if moved else "not_member",
                                 "detail": e.message}
            continue
        can_post = member.get("status") in ("member", "administrator", "creator") or (
            member.get("status") == "restricted" and member.get("can_send_messages"))
        groups[str(chat)] = {"ok": bool(can_post), "title": info.get("title") or "",
                             "error": None if can_post else "cannot_post"}
    write_status(bot={"ok": True, "username": tracker.username, "id": tracker.bot_id},
                 groups=groups, checked_at=now.isoformat(timespec="seconds"))
    return True


def daily_wait(now) -> Optional[str]:
    """Why today's messages don't go out yet, or None when it's time."""
    s = S()
    if not s.groups:
        return "no_groups"
    sent = _sent_keys(now.date())
    if all(daily_key(now.date(), chat) in sent for chat in s.groups):
        return "done"
    if not s.enabled:
        return "paused"
    if now.weekday() not in s.days:
        return "day_off"
    if now.time() < s.send_at:
        return "not_yet"
    return None


_RUN_LOCK = threading.Lock()
_retry_at = 0.0


def reset_retry() -> None:
    """A settings or token save: the next minute tries again, whatever failed before."""
    global _retry_at
    _retry_at = 0.0


def _load():
    with SessionLocal() as db:
        return parse_settings(raw_settings(db)), bot_token(db)


def tick() -> None:
    """The minute job: send today's messages at the first tick after the send time."""
    global _retry_at
    if not _RUN_LOCK.acquire(blocking=False):
        return
    try:
        s, token = _load()
        now = dt.datetime.now(TZ)
        with using(s):
            if daily_wait(now) or time.monotonic() < _retry_at:
                return
            if not token:
                record_error("no_token", "", now)
                return
            if not _send_today(now, token):
                log("will retry in 10 minutes; anything already sent is not repeated")
                _retry_at = time.monotonic() + RETRY_S
    except Exception:  # noqa: BLE001 — the next minute tries again
        logger.exception("notion-tracker: tick failed")
    finally:
        _RUN_LOCK.release()


def _send_today(now, token) -> bool:
    tracker = Tracker(token)
    if not check_telegram(tracker):
        return False
    try:
        tasks = load_tasks()
        with SessionLocal() as db:
            ments = mentions(db)
        ok = send_reminders(now.date(), tracker, tasks, ments)
    except Exception as e:  # noqa: BLE001 — named on the settings tab
        logger.warning("notion-tracker: run failed: %s", e)
        code, detail = explain(e)
        record_error(code, detail, now)
        return False
    if ok:
        _prune(now.date())
    return ok


def preview(chat_id: int) -> int:
    """Today's messages, sent only to `chat_id` (an admin's own chat with the
    bot). Nothing is recorded, so the groups still get them as usual. Returns
    how many people's messages went out; raises NoToken / NotionMissing / ApiError."""
    s, token = _load()
    if not token:
        raise NoToken()
    with using(s):
        tasks = load_tasks()
        today = dt.datetime.now(TZ).date()
        people = daily_people(tasks, today)
        parents = {t.id: t.title for t in tasks}
        with SessionLocal() as db:
            ments = mentions(db)
        tracker = Tracker(token)
        for person, items in people:
            send_person(tracker, person, items, today, parents, ments, "preview", int(chat_id), set(), record=False)
        return len(people)


def refresh_status() -> None:
    """The settings tab's live look: the bot, each group, and who is in Notion."""
    s, token = _load()
    now = dt.datetime.now(TZ)
    with using(s):
        if token:
            check_telegram(Tracker(token))
        else:
            write_status(bot=None, groups={}, checked_at=now.isoformat(timespec="seconds"))
        try:
            tasks = load_tasks()
            write_status(notion={"ok": True, "tasks": len(tasks), "open": sum(1 for t in tasks if t.is_open)},
                         notion_people=sorted({n for t in tasks if t.is_open for n in t.assignees}, key=norm))
        except Exception as e:  # noqa: BLE001
            code, _ = explain(e)
            write_status(notion={"ok": False, "code": code})


def admin_payload() -> dict:
    with SessionLocal() as db:
        raw = raw_settings(db)
        token = bot_token(db)
        mem = _read(db, K_MEMORY, {}) or {}
        status = _read(db, K_STATUS, {}) or {}
    s = parse_settings(raw)
    now = dt.datetime.now(TZ)
    with using(s):
        wait = daily_wait(now)
        sent = _sent_keys(now.date())
    seen = mem.get("seen_groups") or {}
    return {
        "settings": settings_out(raw),
        "token": {"set": bool(token), "hint": token_hint(token)},
        "status": status,
        "today": {"date": now.date().isoformat(), "wait": wait,
                  "sent_groups": [c for c in s.groups if daily_key(now.date(), c) in sent]},
        "bot_groups": [{"chat_id": int(k), "title": v}
                       for k, v in sorted(seen.items(), key=lambda kv: (kv[1] or "").casefold())],
        "notion": {"configured": bool(notion_token()), "data_source": DEFAULT_DATA_SOURCE},
        "webhook": bool(webhook_url()),
        "max_remind_days": MAX_REMIND_DAYS,
    }


# --------------------------------------------------------------------------- the page

def page_payload(force: bool = False) -> dict:
    """The /notion-tasks page: every task in the list, as Notion has it."""
    tasks, read_at = cached_tasks(force)
    today = dt.datetime.now(TZ).date()
    titles = {t.id: t.title for t in tasks}
    out = []
    for t in tasks:
        lines = [" ".join(line.split()) for line in (t.note or "").splitlines()]
        out.append({
            "id": t.id, "title": t.title, "url": t.url, "status": t.status, "done": not t.is_open,
            "due": t.due.isoformat() if t.due else None, "due_time": t.due_time,
            "left": (t.due - today).days if t.due else None,
            "assignees": t.assignees, "priority": t.priority, "high": is_high(t),
            "parent": titles.get(t.parent_id), "note": "\n".join(line for line in lines if line),
        })
    return {"today": today.isoformat(), "read_at": read_at, "tasks": out,
            "people": sorted({n for t in tasks for n in t.assignees}, key=norm)}


# --------------------------------------------------------------------------- the webhook

def webhook_secret() -> str:
    return hashlib.sha256(f"notion-tracker-webhook:{app_settings.secret_key}".encode()).hexdigest()


def webhook_url() -> Optional[str]:
    base = (app_settings.backend_url or "").rstrip("/")
    return f"{base}/bot/notion-webhook" if base.startswith("https://") else None


def setup_webhook(force: bool = False) -> bool:
    """Point the bot's updates at /bot/notion-webhook and set its command menu.
    Skipped on a local box (no HTTPS backend_url) and when nothing changed."""
    with SessionLocal() as db:
        token = bot_token(db)
        mem = _read(db, K_MEMORY, {}) or {}
    url = webhook_url()
    if not token or not url:
        return False
    sig = hashlib.sha256(f"{token}|{url}|{webhook_secret()}|{json.dumps(COMMANDS)}".encode()).hexdigest()
    if not force and mem.get("webhook_sig") == sig:
        return True
    tracker = Tracker(token)
    tracker.tg("setWebhook", {"url": url, "secret_token": webhook_secret(),
                              "allowed_updates": ["message", "my_chat_member"],
                              "drop_pending_updates": True}, attempts=3)
    try:
        tracker.tg("setMyCommands", {"commands": COMMANDS}, attempts=2)
    except ApiError as e:
        log(f"could not set the command menu: {e}")
    _mutate(K_MEMORY, lambda m: m.update(webhook_sig=sig))
    log(f"webhook set to {url}")
    return True


def boot_webhook() -> None:
    try:
        setup_webhook()
    except Exception:  # noqa: BLE001 — the next token save or boot tries again
        logger.exception("notion-tracker: could not set the webhook")


_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="notion-tracker")
_SEEN_UPDATES: list = []


def accept_update(update: dict) -> None:
    """Called by the webhook: hand the update to the bot's own thread (in order),
    skipping one Telegram sent twice."""
    uid = update.get("update_id")
    if uid is not None:
        if uid in _SEEN_UPDATES:
            return
        _SEEN_UPDATES.append(uid)
        del _SEEN_UPDATES[:-200]
    _POOL.submit(_handle_safe, update)


def _handle_safe(update):
    try:
        handle(update)
    except Exception:  # noqa: BLE001
        logger.exception("notion-tracker: could not handle an update")


def _remember(update) -> None:
    """The Telegram ID behind every @username the bot sees (so the daily message
    can mention by ID), and the groups the bot is in."""
    msg = update.get("message") or {}
    member = update.get("my_chat_member") or {}
    people = [msg.get("from"), (msg.get("reply_to_message") or {}).get("from"), member.get("from")]
    people += msg.get("new_chat_members") or []
    people += [e.get("user") for e in msg.get("entities") or [] if e.get("type") == "text_mention"]

    def fn(m):
        users = m.setdefault("users", {})
        for person in people:
            if person and person.get("username") and not person.get("is_bot"):
                key = person["username"].lower()
                if (users.get(key) or {}).get("id") != person["id"]:
                    users[key] = {"id": person["id"], "name": user_name(person)}
        seen = m.setdefault("seen_groups", {})
        chat = member.get("chat") or msg.get("chat") or {}
        if chat.get("type") not in ("group", "supergroup"):
            return
        if member and (member.get("new_chat_member") or {}).get("status") in ("left", "kicked"):
            seen.pop(str(chat["id"]), None)
        elif msg.get("migrate_to_chat_id"):
            seen.pop(str(chat["id"]), None)
            seen[str(msg["migrate_to_chat_id"])] = chat.get("title") or ""
        elif not msg.get("migrate_from_chat_id"):
            seen[str(chat["id"])] = chat.get("title") or ""
    _mutate(K_MEMORY, fn)


def handle(update) -> None:
    s, token = _load()
    if not token:
        return
    with using(s):
        _remember(update)
        if update.get("my_chat_member"):
            return
        msg = update.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        if msg.get("migrate_to_chat_id") and chat_id in s.groups:
            _move_group(chat_id, msg["migrate_to_chat_id"])
            return
        text = (msg.get("text") or "").strip()
        if not text.startswith("/"):
            return
        tracker = Tracker(token)
        command, _, target = text.split()[0][1:].partition("@")
        if target:
            tracker.me()
            if tracker.username and target.lower() != tracker.username.lower():
                return  # a command meant for another bot
        command = command.lower()
        in_group = chat.get("type") in ("group", "supergroup")
        team = chat_id in s.groups
        reply_to = msg.get("message_id")

        if command == "start":
            if team:
                tracker.send(chat_id, help_html(), reply_to)
            elif in_group:
                tracker.send(chat_id, "Этой группы нет в настройках напоминаний. "
                                      "Администратор может подключить её в Safia IMS.", reply_to)
            else:
                tracker.send(chat_id, "Я напоминаю команде о сроках задач из Notion. "
                                      "Добавьте меня в группу команды, и администратор подключит её в Safia IMS.")
        elif command == "help":
            tracker.send(chat_id, help_html(), reply_to)
        elif command == "id":
            if not in_group:
                user_id = (msg.get("from") or {}).get("id", chat_id)
                tracker.send(chat_id, f"Ваш ID: <code>{user_id}</code>\n\n"
                                      "Отправьте /id в группе, и я пришлю туда сведения о ней.", reply_to)
                return
            for part in group_info(tracker, msg, team):
                tracker.send(chat_id, part, reply_to)  # every part replies, so all of it lands in the same topic
        elif command == "tasks":
            if not team:
                tracker.send(chat_id, "Список задач доступен только в группе команды.", reply_to)
                return
            try:
                tracker.tg("sendChatAction", {"chat_id": chat_id, "action": "typing"}, attempts=1)
            except ApiError:
                pass
            try:
                tasks = load_tasks()
            except Exception as e:  # noqa: BLE001
                log(f"/tasks: could not load tasks from Notion: {e}")
                tracker.send(chat_id, "Не удалось получить задачи из Notion. Попробуйте ещё раз через минуту.", reply_to)
                return
            for i, part in enumerate(digest_messages(tasks, dt.datetime.now(TZ).date())):
                tracker.send(chat_id, part, reply_to if i == 0 else None)


def group_info(tracker, msg, team):
    """Collect what Telegram tells the bot about the group /id was sent in. Returns the reply messages."""
    chat_id = msg["chat"]["id"]

    def ask(method, **params):
        try:
            return tracker.tg(method, {"chat_id": chat_id, **params}, attempts=2)
        except ApiError as e:
            log(f"/id: {method} failed: {e}")
            return None

    try:
        tracker.me()
    except ApiError:
        pass
    info = ask("getChat")
    bot_member = ask("getChatMember", user_id=tracker.bot_id) if tracker.bot_id else None
    if team:
        reminders = "✅ Напоминания о задачах приходят в эту группу."
    elif S().groups:
        reminders = "Напоминания о задачах приходят в другую группу."
    else:
        reminders = "Напоминания ещё никуда не подключены. Группы подключает администратор в Safia IMS."
    return group_info_messages(info, ask("getChatMemberCount"), ask("getChatAdministrators"),
                               bot_member, msg, reminders)


def register_jobs() -> None:
    """Every minute (mirrored in passenger_wsgi.py): today's messages at the
    first tick after the send time; nothing on any other tick."""
    from app.scheduler import schedule_interval
    schedule_interval("notion-tracker", tick, minutes=1)

