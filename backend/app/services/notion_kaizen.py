"""
Kaizen-session Notion integration.

Pulls the eight "Kaizen session & project" task databases that live under the
hub page «🌟 Кайзен сессия ва проектлар топшириклари» in Notion, normalizes the
heterogeneously-named columns into one flat shape, and stores a snapshot in
``kaizen_tasks`` so the dashboard can render analytics without hitting Notion on
every request.

Why the REST API (and not the MCP/AI connector): the workspace is not on a
Business plan, so the connector's SQL ``query_data_sources`` is gated. The plain
``POST /v1/databases/{id}/query`` endpoint works on any plan with an integration
token, so that is what we use here.

Setup (one-time, done by an admin — never store the token in git):
  1. Create an internal integration at https://www.notion.so/my-integrations
  2. Open the hub page in Notion → ••• → Connections → add the integration
     (sharing the hub page also shares every inline database under it).
  3. Put the token in the backend environment as ``NOTION_TOKEN`` and restart.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx

from app.config import settings

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Hub page that contains all eight inline databases (for reference / docs).
HUB_PAGE_ID = "e416ee89-a36c-82ba-b89b-01007491b2db"

# The eight projects, in the order they appear on the hub page. ``key`` is a
# stable slug used by the frontend; ``name`` mirrors the Notion heading.
KAIZEN_DATABASES: list[dict] = [
    {"key": "zakreplenie",  "name": "Проект Закрепление",                         "database_id": "4b56ee89-a36c-821e-a150-816b3bef27b6"},
    {"key": "shadzinka",    "name": "Проект Шадзинка",                            "database_id": "7196ee89-a36c-8344-bad3-81e2070b173d"},
    {"key": "nastavnich",   "name": "Проект наставничества",                      "database_id": "0d06ee89-a36c-8247-80c5-019c34429713"},
    {"key": "kachestvo",    "name": "Проект по качеству",                         "database_id": "a136ee89-a36c-83fa-9dcb-81e8a4881c78"},
    {"key": "pokazateli",   "name": "Показатели производства",                    "database_id": "a3d6ee89-a36c-83e6-baf7-8109ef62cb18"},
    {"key": "standarty",    "name": "Создание среды для стандартов",              "database_id": "be06ee89-a36c-82b9-a306-010180280c5f"},
    {"key": "hansei",       "name": "Хансей",                                     "database_id": "4e26ee89-a36c-82a4-89a7-0145e9279c8c"},
    {"key": "kormery",      "name": "Назначить ответственного за разработку кор.мер", "database_id": "fca6ee89-a36c-834f-87e0-818c132bdedb"},
]

# Column-name variants seen across the eight databases (they were built
# independently, so the same concept has different labels).
_CUSTOMER_NAMES = {"Заказчик", "Person 1"}
_DEADLINE_NAMES = {"Срок", "Date", "Дедлайн", "Deadline"}
_TYPE_NAMES = {"Тип задачи", "Тип Задачи", "Text", "Описание", "Type"}

# Canonical status buckets. Notion stores the localized option name; everything
# that is not explicitly "Done"/"In progress" counts as not-started.
STATUS_DONE = "Done"
STATUS_IN_PROGRESS = "In progress"
STATUS_NOT_STARTED = "Not started"


def token_configured() -> bool:
    return bool(os.getenv("NOTION_TOKEN"))


def _headers() -> dict:
    token = os.getenv("NOTION_TOKEN")
    if not token:
        raise RuntimeError(
            "NOTION_TOKEN is not configured. Add it to the backend environment "
            "and share the hub page with the integration."
        )
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _rich_text(value: list | None) -> str:
    return "".join(part.get("plain_text", "") for part in (value or [])).strip()


def _canonical_status(raw: str | None) -> str:
    if not raw:
        return STATUS_NOT_STARTED
    low = raw.strip().lower()
    if low in ("done", "готово", "выполнено", "tugallandi"):
        return STATUS_DONE
    if low in ("in progress", "в работе", "в процессе", "jarayonda"):
        return STATUS_IN_PROGRESS
    return STATUS_NOT_STARTED


def normalize_page(page: dict, project: dict) -> dict:
    """Flatten one Notion page (database row) into our common task shape.

    Classifies each property by its Notion *type* and *name* so the eight
    differently-labelled schemas all collapse to: title / status / responsible
    people / customer people / deadline / task-type.
    """
    props = page.get("properties", {})
    title = ""
    status_raw: str | None = None
    responsible: list[str] = []
    customer: list[str] = []
    deadline: str | None = None
    task_type = ""

    for name, val in props.items():
        ptype = val.get("type")
        if ptype == "title":
            title = _rich_text(val.get("title"))
        elif ptype == "status":
            status_raw = (val.get("status") or {}).get("name")
        elif ptype == "select" and name in ("Status", "Статус"):
            status_raw = (val.get("select") or {}).get("name")
        elif ptype == "people":
            names = [p.get("name") or "" for p in val.get("people", [])]
            names = [n.strip() for n in names if n and n.strip()]
            if name in _CUSTOMER_NAMES:
                customer.extend(names)
            else:  # "Ответственный", "Person", or any other person field
                responsible.extend(names)
        elif ptype == "date" and name in _DEADLINE_NAMES:
            deadline = (val.get("date") or {}).get("start")
        elif ptype == "rich_text" and name in _TYPE_NAMES:
            task_type = _rich_text(val.get("rich_text"))

    if deadline:
        deadline = deadline[:10]  # keep the date part; drop any time component

    return {
        "project": project["name"],
        "project_key": project["key"],
        "notion_id": page.get("id"),
        "url": page.get("url"),
        "title": title or "(без названия)",
        "status": _canonical_status(status_raw),
        "task_type": task_type or None,
        "responsible": responsible,
        "customer": customer,
        "deadline": deadline,
        "created_time": page.get("created_time"),
    }


def _query_database(client: httpx.Client, database_id: str) -> list[dict]:
    """Return every page in a database, following pagination."""
    pages: list[dict] = []
    cursor: str | None = None
    while True:
        body: dict = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        resp = client.post(
            f"{NOTION_API}/databases/{database_id}/query",
            headers=_headers(),
            json=body,
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Notion query failed for {database_id}: "
                f"{resp.status_code} {resp.text[:300]}"
            )
        data = resp.json()
        pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return pages


def fetch_all_tasks() -> list[dict]:
    """Pull and normalize every task across all eight Kaizen databases."""
    tasks: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        for project in KAIZEN_DATABASES:
            for page in _query_database(client, project["database_id"]):
                tasks.append(normalize_page(page, project))
    return tasks


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
