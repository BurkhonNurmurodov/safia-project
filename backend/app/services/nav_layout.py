"""«Ilovalar tuzilmasi» — the launcher's apps, menu tabs and screens as the
operator arranged them on the org chart (`/panel/orgchart`, the «Ilovalar» view).

The launcher's structure used to be code only (`frontend/src/config/navLinks.js`:
`APPS`, a link's `app`, `GROUP_APP`, an app's `sections`). It still is the
DEFAULT. This is ONE stored layout laid over it — which apps exist and in what
order, each app's menu tabs, and which screen sits where:

    {"v": 1, "apps": [
        {"id": "overview", "pages": ["/overview", "/cells"], "tabs": []},
        {"id": "x4f9k2a", "label": {"ru": "Склад"}, "icon": "Package",
         "hue": "teal", "pages": [],
         "tabs": [{"id": "xk81m0c", "label": {"ru": "Отчёты"},
                   "icon": "Folder", "pages": ["/reports"]}]},
    ], "loose": ["/assistant"]}

`loose` are the screens that sit in NO app (they stay reachable by their
address and the header search) — an explicit list, because a screen the layout
merely does not mention goes back to where the code puts it.

**The server keeps the SHAPE, never the register.** A screen is named by its
path, and the list of paths lives in the browser bundle alone — so nothing here
knows which paths exist. The page reconciles (`utils/navLayout.js`): a stored
path no bundle knows is dropped, a screen the layout does not place sits where
the code puts it. A second list of pages here would be one more list to forget.

Nothing here decides ACCESS: a screen moved into another app is opened by
exactly the people who opened it before (`permissions.py`, `capabilities.py`).

No stored layout (the row absent, or unreadable) means the coded default,
byte for byte what the launcher drew before this existed.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

SETTING_KEY = "nav_layout"
VERSION = 1

LANGS = ("uz", "uz_cyrl", "ru", "en")
MAX_APPS = 40
MAX_TABS = 20          # per app
MAX_PAGES = 400        # in the whole layout
MAX_LABEL = 60

_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
_PATH = re.compile(r"^/[A-Za-z0-9/_-]{0,79}$")
_ICON = re.compile(r"^[A-Za-z0-9]{1,40}$")
_HUE = re.compile(r"^[a-z]{1,20}$")


class LayoutError(ValueError):
    """The layout sent is not one — the message says what is wrong."""


def _label(raw: Any) -> dict:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise LayoutError("label must be an object")
    out = {}
    for lang in LANGS:
        text = raw.get(lang)
        if text is None:
            continue
        if not isinstance(text, str):
            raise LayoutError("label text must be a string")
        text = " ".join(text.split())
        if len(text) > MAX_LABEL:
            raise LayoutError(f"label longer than {MAX_LABEL} characters")
        if text:
            out[lang] = text
    return out


def _opt(raw: Any, pattern: re.Pattern, what: str) -> Optional[str]:
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str) or not pattern.match(raw):
        raise LayoutError(f"invalid {what}")
    return raw


def _ident(raw: Any, seen: set, what: str) -> str:
    if not isinstance(raw, str) or not _ID.match(raw):
        raise LayoutError(f"invalid {what} id")
    if raw in seen:
        raise LayoutError(f"{what} id listed twice: {raw}")
    seen.add(raw)
    return raw


def _pages(raw: Any, placed: set) -> list:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise LayoutError("pages must be a list")
    out = []
    for p in raw:
        if not isinstance(p, str) or not _PATH.match(p):
            raise LayoutError("invalid page path")
        # A screen sits in ONE place: the first mention wins, the rest are dropped.
        if p in placed:
            continue
        placed.add(p)
        out.append(p)
    return out


def _entry(raw: dict, ident: str, placed: set) -> dict:
    out: dict = {"id": ident}
    label = _label(raw.get("label"))
    if label:
        out["label"] = label
    icon = _opt(raw.get("icon"), _ICON, "icon")
    if icon:
        out["icon"] = icon
    out["pages"] = _pages(raw.get("pages"), placed)
    return out


def clean(raw: Any) -> Optional[dict]:
    """The layout as it is stored — validated and normalised — or ``None`` for
    «no layout» (the coded default). Raises :class:`LayoutError` on anything
    that is not a layout: a malformed one must be refused, never half-kept."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise LayoutError("layout must be an object")
    apps = raw.get("apps")
    if not isinstance(apps, list):
        raise LayoutError("apps must be a list")
    if not apps:
        return None
    if len(apps) > MAX_APPS:
        raise LayoutError(f"more than {MAX_APPS} apps")

    app_ids: set = set()
    tab_ids: set = set()
    placed: set = set()
    out = []
    for a in apps:
        if not isinstance(a, dict):
            raise LayoutError("app must be an object")
        app = _entry(a, _ident(a.get("id"), app_ids, "app"), placed)
        hue = _opt(a.get("hue"), _HUE, "colour")
        if hue:
            app["hue"] = hue
        tabs = a.get("tabs") or []
        if not isinstance(tabs, list):
            raise LayoutError("tabs must be a list")
        if len(tabs) > MAX_TABS:
            raise LayoutError(f"more than {MAX_TABS} menu tabs in one app")
        app["tabs"] = []
        for t in tabs:
            if not isinstance(t, dict):
                raise LayoutError("menu tab must be an object")
            # «top» is the app's own headerless row of screens — never a folder.
            ident = _ident(t.get("id"), tab_ids, "menu tab")
            if ident == "top":
                raise LayoutError("invalid menu tab id")
            app["tabs"].append(_entry(t, ident, placed))
        out.append(app)
    # Screens the operator took out of every app (the assistant ships so).
    loose = _pages(raw.get("loose"), placed)
    if len(placed) > MAX_PAGES:
        raise LayoutError(f"more than {MAX_PAGES} screens")
    return {"v": VERSION, "apps": out, "loose": loose}


def get(db) -> Optional[dict]:
    """The stored layout, or ``None``. Never raises: every route's first answer
    (`page_access_payload`, and the sign-in) carries it, and an unreadable row
    must mean «the default», not a platform nobody can open."""
    from app import session_memo
    from app.models import AppSetting
    try:
        raw = session_memo.get(db, ("nav_layout",), lambda: db.query(AppSetting.value)
                               .filter(AppSetting.key == SETTING_KEY).scalar())
        return clean(json.loads(raw)) if raw else None
    except Exception:  # noqa: BLE001 — see the docstring
        return None


def counts(layout: Optional[dict]) -> tuple:
    """``(apps, menu tabs, screens)`` a layout names — for the action register."""
    apps = (layout or {}).get("apps") or []
    tabs = sum(len(a["tabs"]) for a in apps)
    pages = sum(len(a["pages"]) + sum(len(t["pages"]) for t in a["tabs"]) for a in apps)
    pages += len((layout or {}).get("loose") or [])
    return len(apps), tabs, pages


def save(db, raw: Any) -> Optional[dict]:
    """Store a layout (validated here) or, with ``None`` / no apps, remove the
    stored one — back to the coded default. Returns what is now in force."""
    from app.models import AppSetting
    layout = clean(raw)
    row = db.query(AppSetting).filter(AppSetting.key == SETTING_KEY).first()
    if layout is None:
        if row:
            db.delete(row)
    else:
        value = json.dumps(layout, ensure_ascii=False, separators=(",", ":"))
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=SETTING_KEY, value=value))
    db.commit()
    return layout
