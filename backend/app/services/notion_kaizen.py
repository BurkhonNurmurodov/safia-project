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
# Data-source API — required for databases upgraded to Notion's multi-source
# model, where the legacy /databases/{id}/query endpoint returns object_not_found.
NOTION_VERSION_DS = "2025-09-03"

# Hub page that contains the tasks database (for reference / docs). Lives in the
# "cicon" workspace — the same workspace as the NOTION_TOKEN integration.
HUB_PAGE_ID = "c8bf94a4-688c-4336-8339-206e0d786042"

# All tasks live in a single "Проекты" database; each row's project is a
# "Project" select option rather than a separate per-project database.
KAIZEN_DATABASE_ID = "a5d14331-5ee6-8209-9fea-017c4b8b15a3"

# The eight projects. ``key`` is a stable slug used by the frontend (and mapped
# to an emoji there); ``option`` is the exact "Project" select value in Notion.
KAIZEN_PROJECTS: list[dict] = [
    {"key": "zakreplenie", "name": "Проект Закрепление",                          "option": "Проект Закрепление"},
    {"key": "shadzinka",   "name": "Проект Шадзинка",                             "option": "Шадзинка"},
    {"key": "nastavnich",  "name": "Проект наставничества",                       "option": "Наставничества"},
    {"key": "kachestvo",   "name": "Проект по качеству",                          "option": "Проект по качеству"},
    {"key": "pokazateli",  "name": "Показатели производства",                     "option": "Показатели производства"},
    {"key": "standarty",   "name": "Создание среды для стандартов",               "option": "Создание среды для стандартов"},
    {"key": "hansei",      "name": "Хансей",                                      "option": "Хансей"},
    {"key": "kormery",     "name": "Назначить ответственного за разработку кор.мер", "option": "Назначить ответственного за разработку кор.мер"},
]
_OPTION_TO_PROJECT = {p["option"]: p for p in KAIZEN_PROJECTS}
_UNKNOWN_PROJECT = {"key": "other", "name": "Прочее"}

# Column-name variants. The same concept is labelled differently across the
# older per-project databases, so we match by a set of known names.
_CUSTOMER_NAMES = {"Заказчик", "Person 1"}
_DEADLINE_NAMES = {"Срок", "Date", "Дедлайн", "Deadline"}
_TYPE_NAMES = {"Тип задачи", "Тип Задачи", "Text", "Описание", "Type"}
_PROJECT_NAMES = {"Project", "Проект"}

# Canonical status buckets. Notion stores the localized option name; everything
# that is not explicitly "Done"/"In progress" counts as not-started.
STATUS_DONE = "Done"
STATUS_IN_PROGRESS = "In progress"
STATUS_NOT_STARTED = "Not started"


def _token() -> str:
    # pydantic-settings loads .env into the Settings object (not os.environ),
    # so prefer settings.notion_token; fall back to a real env var for local runs.
    return settings.notion_token or os.getenv("NOTION_TOKEN", "")


def token_configured() -> bool:
    return bool(_token())


def _headers(version: str = NOTION_VERSION) -> dict:
    token = _token()
    if not token:
        raise RuntimeError(
            "NOTION_TOKEN is not configured. Add it to the backend environment "
            "and share the hub page with the integration."
        )
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": version,
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


def _people_names(value: list | None, users: dict[str, str]) -> list[str]:
    """Resolve a people-property value to display names.

    Notion only embeds ``name`` in a people value when the integration has the
    *Read user information* capability — otherwise every entry but the owning
    user comes back nameless. We therefore resolve each entry's id against the
    workspace user map first, falling back to any embedded name.
    """
    names: list[str] = []
    for p in value or []:
        name = (users.get(p.get("id")) or p.get("name") or "").strip()
        if name:
            names.append(name)
    return names


def normalize_page(page: dict, users: dict[str, str] | None = None) -> dict:
    """Flatten one Notion page (row of the "Проекты" database) into our task shape.

    Classifies each property by its Notion *type* and *name*, collapsing to:
    project / title / status / responsible people / customer people / deadline /
    task-type. Property-type strings are matched leniently so the same code
    parses both the classic REST shape ("people"/"rich_text") and the newer
    data-source shape ("person"/"text").
    """
    users = users or {}
    props = page.get("properties", {})
    title = ""
    status_raw: str | None = None
    project_option: str | None = None
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
        elif ptype == "select":
            option = (val.get("select") or {}).get("name")
            if name in _PROJECT_NAMES:
                project_option = option
            elif name in ("Status", "Статус"):
                status_raw = option
        elif ptype in ("people", "person"):
            names = _people_names(val.get("people") or val.get("person"), users)
            if name in _CUSTOMER_NAMES:
                customer.extend(names)
            else:  # "Ответственный", "Person", or any other person field
                responsible.extend(names)
        elif ptype == "date" and name in _DEADLINE_NAMES:
            deadline = (val.get("date") or {}).get("start")
        elif ptype in ("rich_text", "text") and name in _TYPE_NAMES:
            task_type = _rich_text(val.get("rich_text") or val.get("text"))

    if deadline:
        deadline = deadline[:10]  # keep the date part; drop any time component

    project = _OPTION_TO_PROJECT.get(project_option, _UNKNOWN_PROJECT)

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


def _paginate(client: httpx.Client, url: str, version: str, label: str) -> list[dict]:
    """POST a Notion query endpoint and follow pagination into a flat page list."""
    pages: list[dict] = []
    cursor: str | None = None
    while True:
        body: dict = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        resp = client.post(url, headers=_headers(version), json=body)
        if resp.status_code != 200:
            raise RuntimeError(
                f"Notion query failed for {label}: {resp.status_code} {resp.text[:300]}"
            )
        data = resp.json()
        pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return pages


def _query_database(client: httpx.Client, database_id: str) -> list[dict]:
    """Legacy single-source query — /databases/{id}/query (API 2022-06-28)."""
    return _paginate(
        client, f"{NOTION_API}/databases/{database_id}/query", NOTION_VERSION, database_id
    )


def _primary_data_source(client: httpx.Client, database_id: str) -> str | None:
    """Return the id of a database's primary (first) data source, or None.

    Databases migrated to Notion's multi-source model expose their rows through
    data sources; the legacy database-query endpoint returns object_not_found
    for them. Requires the 2025-09-03 API. Best-effort: returns None on any
    error so the caller can fall back to the legacy query.
    """
    try:
        resp = client.get(
            f"{NOTION_API}/databases/{database_id}", headers=_headers(NOTION_VERSION_DS)
        )
        if resp.status_code != 200:
            return None
        sources = resp.json().get("data_sources") or []
        return sources[0].get("id") if sources else None
    except Exception:
        return None


def _query_data_source(client: httpx.Client, data_source_id: str) -> list[dict]:
    """Query a single data source — /data_sources/{id}/query (API 2025-09-03)."""
    return _paginate(
        client, f"{NOTION_API}/data_sources/{data_source_id}/query", NOTION_VERSION_DS,
        f"data source {data_source_id}",
    )


def _fetch_pages(client: httpx.Client, database_id: str) -> list[dict]:
    """Return every page for a configured database, handling both the legacy
    single-source model and the newer multi-source model. Prefers the primary
    data source (equivalent to the legacy primary view) and falls back to the
    legacy endpoint for workspaces still on the old model."""
    ds_id = _primary_data_source(client, database_id)
    if ds_id:
        return _query_data_source(client, ds_id)
    return _query_database(client, database_id)


def _fetch_users(client: httpx.Client) -> dict[str, str]:
    """Map every workspace user id → display name.

    Requires the integration's *Read user information* capability. If that
    capability is missing the endpoint 403s (or any other error occurs); we
    swallow it and return an empty map so people resolution simply falls back
    to whatever names Notion embedded in the query response.
    """
    users: dict[str, str] = {}
    cursor: str | None = None
    try:
        while True:
            params: dict = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            resp = client.get(f"{NOTION_API}/users", headers=_headers(), params=params)
            if resp.status_code != 200:
                break
            data = resp.json()
            for u in data.get("results", []):
                uid, name = u.get("id"), (u.get("name") or "").strip()
                if uid and name:
                    users[uid] = name
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
            if not cursor:
                break
    except Exception:
        pass
    return users


def fetch_all_tasks() -> list[dict]:
    """Pull and normalize every task from the single "Проекты" database.

    Each row carries its own "Project" select, so a task's project is derived
    per-row rather than per-database.
    """
    tasks: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        users = _fetch_users(client)  # id → name, so every assignee resolves (not just the owner)
        for page in _fetch_pages(client, KAIZEN_DATABASE_ID):
            tasks.append(normalize_page(page, users))
    return tasks


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
