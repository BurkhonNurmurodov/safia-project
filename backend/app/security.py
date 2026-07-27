"""Request-level Telegram-origin enforcement.

Every call the web app makes to the backend carries the Telegram WebApp
``initData`` string in the ``X-Telegram-Init-Data`` header (see the axios
interceptor in ``frontend/src/utils/api.js``). This module re-verifies that
signature on every API request, so no endpoint can be reached from outside a
genuine Telegram WebView — not just at login.

This sits *in addition to* the per-endpoint JWT/role checks: the initData guard
proves the caller is inside Telegram; the JWT proves which approved profile they
are and what pages they may see. ``require_auth`` below is the minimal "any
approved session" JWT check for endpoints that previously had none.

Wiring (see ``main.py``):
  * ``enforce_telegram_origin_global`` is registered as an app-wide dependency.
    It guards every ``/api/*`` path. It deliberately ignores non-API paths so it
    never blocks the SPA HTML, hashed assets, ``/health`` or the Telegram
    webhook — and it ignores ``/admin/*`` so a browser navigation to an SPA
    route like ``/admin/upload`` (served by the catch-all) is never mistaken for
    an API call.
  * ``enforce_telegram_origin_admin`` is attached at ``include_router`` time to
    the three routers that expose ``/admin/*`` API routes (admin, production,
    leader_tasks). Router-level dependencies only run for that router's own
    matched routes, so there is no collision with the SPA catch-all. It guards
    only the ``/admin/*`` paths (their ``/api/*`` siblings are already covered
    by the global dep).
"""
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError

from app.config import settings
from app.routers.auth import _validate_init_data

# Endpoints that legitimately run without the initData header. Each either
# verifies initData itself (from its request body) or must work before/without a
# Telegram session:
#   * /api/auth/webapp             — the login exchange; validates the body's initData
#   * /api/auth/bot-info           — bot username, needed by the pre-login error screens
#   * /api/auth/send-start-hint    — validates its body's initData itself
#   * /api/profiles/registration-options — accepts initData OR a bot-signed reg_token
#                                    (keyboard-button launches never receive initData)
#   * /api/boot-report             — the recovery screen's crash reporter, must work
#                                    when the app failed to boot / user isn't logged in
#   * /api/translations            — public UI strings (no user data); fetched at boot
_EXEMPT_PATHS = frozenset({
    "/api/auth/webapp",
    "/api/auth/bot-info",
    "/api/auth/send-start-hint",
    "/api/profiles/registration-options",
    "/api/boot-report",
    "/api/translations",
})

_INIT_DATA_HEADER = "X-Telegram-Init-Data"


def _check_init_data(request: Request) -> None:
    """Verify the request carries a valid, in-window Telegram initData header.
    Raises 401 otherwise. The dev bypass ('__dev__') is honored only when
    DEV_AUTH is on, mirroring /api/auth/webapp."""
    init_data = request.headers.get(_INIT_DATA_HEADER, "")

    # Server-side page screenshots: a headless Chromium has no Telegram WebView
    # and so no initData. A bot-minted, 3-minute, HMAC-signed render token is
    # the stand-in credential — it proves the request came from this server on
    # behalf of one Telegram id, and buys only that user's own session (see
    # app/render_token.py). Checked before the empty/dev branches so a render
    # never depends on DEV_AUTH.
    if read_init_data_render_token(init_data) is not None:
        return

    if init_data == "__dev__":
        if settings.dev_auth:
            return
        raise HTTPException(status_code=401, detail="Missing Telegram initData")

    if not init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram initData")

    if _validate_init_data(init_data) is None:
        raise HTTPException(status_code=401, detail="Invalid or expired Telegram initData")


def enforce_telegram_origin_global(request: Request) -> None:
    """App-wide dependency: guard every real ``/api/*`` API call. Non-API paths
    (SPA HTML, assets, /health, /bot/webhook, /admin/* SPA navigations) are left
    alone — /admin/* API routes are guarded by the router-level dep below."""
    path = request.url.path
    if not path.startswith("/api/"):
        return
    if path in _EXEMPT_PATHS:
        return
    _check_init_data(request)


def enforce_telegram_origin_admin(request: Request) -> None:
    """Router-level dependency for routers that expose ``/admin/*`` API routes.
    Only runs for that router's matched routes, so it never sees the SPA
    catch-all. Skips ``/api/*`` paths, already covered by the global dep."""
    if not request.url.path.startswith("/admin/"):
        return
    _check_init_data(request)


_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")


def require_auth(token: Annotated[str, Depends(_oauth2)]) -> dict:
    """Minimal authorization: a valid, unexpired app JWT (issued by
    /api/auth/webapp only to approved profiles). Use on shared/reference
    endpoints that need an approved session but no specific page grant."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
