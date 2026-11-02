"""«Notion vazifalari» — the Notion "Production" task list in IMS
(services/notion_tracker.py; moved from the stand-alone GitHub bot on
2026-11-02).

Three routers:

- ``/api/notion-tasks`` — the page: every task in the list, read-only. Page
  key ``notion-tasks``, ADMIN-ONLY until the operator opens it on the Access
  tab; everybody who can open it sees every task.
- ``/api/admin/notion-tracker`` — the admin tab «Notion eslatmalari»: the
  reminders' schedule, team and groups, the bot token (sealed, it goes in and
  never comes out), the status, and «Preview to my Telegram». ADMIN-ONLY and
  not grantable, and refused from an «open as» tab.
- ``/bot/notion-webhook`` — @Safia_Tracker_agent's updates (its secret token
  checked first), answered on the bot's own thread.
"""
from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, notion_tracker as nt

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notion-tasks", tags=["notion-tasks"])
admin_router = APIRouter(prefix="/api/admin/notion-tracker", tags=["notion-tasks"])
hook_router = APIRouter(tags=["notion-tasks"])


def _admin(payload: dict = Depends(verify_admin)) -> dict:
    if payload.get("imp"):
        raise HTTPException(status_code=403, detail="admin_only")
    return payload


def _notion_error(e: Exception) -> HTTPException:
    """409 when Notion is not connected at all, 424 when Notion (or the network)
    refused — never 502/503, which the client reads as a restart."""
    if isinstance(e, nt.NotionMissing):
        return HTTPException(status_code=409, detail={"code": "notion_missing"})
    code, detail = nt.explain(e)
    return HTTPException(status_code=424, detail={"code": code, "message": detail})


# --------------------------------------------------------------------------- the page

@router.get("")
def notion_tasks(refresh: bool = False, _p: dict = Depends(require_page("notion-tasks"))):
    """Every task in the Notion list (the page sorts and filters). Read at most
    once a minute, every 10 s when the reader asks for a refresh."""
    try:
        return nt.page_payload(force=refresh)
    except (nt.NotionMissing, nt.ApiError) as e:
        raise _notion_error(e)


# --------------------------------------------------------------------------- the admin tab

@admin_router.get("")
def tracker_get(_a: dict = Depends(_admin)):
    return nt.admin_payload()


@admin_router.get("/status")
def tracker_status(_a: dict = Depends(_admin)):
    """The tab's live look — the bot, each group, who is in Notion — then the
    whole tab. A read of Telegram and Notion; nothing is sent."""
    nt.refresh_status()
    return nt.admin_payload()


@admin_router.put("")
def tracker_save(body: dict, _a: dict = Depends(_admin)):
    clean, errors = nt.clean_settings(body or {})
    if errors:
        raise HTTPException(status_code=400, detail={"code": "invalid", "fields": errors})
    before = nt.settings_out(nt.raw_settings_now())
    nt.save_settings(clean)
    changed = sorted(k for k in clean if clean.get(k) != before.get(k))
    action_log.enrich(target_kind="setting", target_id="notion_tracker", target_name="Notion eslatmalari",
                      details={"changed": changed, "enabled": clean["enabled"],
                               "groups": len(clean["groups"]), "team": len(clean["team"])})
    return nt.admin_payload()


class TokenIn(BaseModel):
    token: str


@admin_router.put("/token")
def tracker_token(body: TokenIn, _a: dict = Depends(_admin)):
    """A new bot token: checked with Telegram first (a token it refuses is not
    stored), then sealed, and the bot's webhook pointed at this server."""
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail={"code": "required"})
    try:
        me = nt.Tracker(token).tg("getMe", attempts=2)
    except nt.ApiError as e:
        if e.status in (401, 404):
            raise HTTPException(status_code=400, detail={"code": "token_refused"})
        raise HTTPException(status_code=424, detail={"code": "service", "message": e.message})
    nt.save_token(token)
    nt.clear_token_errors()
    hook = None
    try:
        hook = nt.setup_webhook(force=True)
    except Exception as e:  # noqa: BLE001 — the token is stored; the next boot tries the webhook again
        log.warning("notion-tracker: webhook not set after a token save: %s", e)
    action_log.enrich(target_kind="setting", target_id="notion_tracker_token", target_name="Notion eslatmalari",
                      details={"length": len(token), "bot": me.get("username"), "webhook": bool(hook)})
    out = nt.admin_payload()
    out["saved_bot"] = me.get("username")
    out["webhook_set"] = bool(hook)
    return out


@admin_router.put("/notion-token")
def tracker_notion_token(body: TokenIn, _a: dict = Depends(_admin)):
    """The Notion token the reminders and the page read with (else the platform's
    NOTION_TOKEN): checked against the task list first — a token Notion refuses,
    or one that cannot see the list, is not stored — then sealed."""
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail={"code": "required"})
    try:
        nt.check_notion_token(token)
    except nt.ApiError as e:
        if e.status == 401:
            raise HTTPException(status_code=400, detail={"code": "notion_refused"})
        if e.status in (403, 404):
            raise HTTPException(status_code=400, detail={"code": "notion_no_access"})
        raise HTTPException(status_code=424, detail={"code": "service", "message": e.message})
    nt.save_notion_token(token)
    action_log.enrich(target_kind="setting", target_id="notion_tracker_notion_token",
                      target_name="Notion eslatmalari", details={"length": len(token)})
    return nt.admin_payload()


@admin_router.post("/preview")
def tracker_preview(admin: dict = Depends(_admin)):
    """Today's messages, sent only to the caller's own chat with the bot."""
    try:
        chat_id = int(admin.get("telegram_id") or admin.get("sub") or 0)
    except (TypeError, ValueError):
        chat_id = 0
    if not chat_id:
        raise HTTPException(status_code=400, detail={"code": "no_chat"})
    try:
        n = nt.preview(chat_id)
    except nt.NoToken:
        raise HTTPException(status_code=409, detail={"code": "no_token"})
    except nt.NotionMissing as e:
        raise _notion_error(e)
    except nt.ApiError as e:
        low = (e.message or "").lower()
        if e.service == "Telegram" and (e.status == 403 or "chat not found" in low or "initiate" in low):
            raise HTTPException(status_code=409, detail={"code": "start_bot"})
        raise _notion_error(e)
    action_log.enrich(target_kind="setting", target_id="notion_tracker", target_name="Notion eslatmalari",
                      details={"messages": n})
    return {"messages": n}


# --------------------------------------------------------------------------- the bot's webhook

@hook_router.post("/bot/notion-webhook")
async def notion_webhook(request: Request):
    provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not hmac.compare_digest(provided, nt.webhook_secret()):
        log.warning("notion-tracker: rejected a webhook POST with a bad secret token")
        return Response(status_code=403)
    try:
        nt.accept_update(await request.json())
    except Exception:  # noqa: BLE001 — always 200, or Telegram sends it again
        log.exception("notion-tracker: could not read a webhook update")
    return {"ok": True}
