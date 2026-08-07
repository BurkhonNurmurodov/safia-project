"""Request-scoped "Ghost Mode" flag.

Admins can toggle Ghost Mode in the dashboard header. While it is on, their
changes still apply and are still recorded in the audit trail, but no in-app
(bell) or Telegram notifications are pushed to the other parties — supervisors,
shift-managers, or other admins. It lets an admin make corrections quietly
without alerting the whole team.

The frontend sends the header ``X-Ghost-Mode: 1`` on every request while the
switch is on. ``GhostModeMiddleware`` reads it, honours it only for admins
(verified by decoding the bearer token), and sets the ContextVar below for the
duration of that request. ``staff._notify`` — the single chokepoint every
notification flows through — checks ``notifications_suppressed()`` and returns
early when it is set.

The middleware is intentionally pure-ASGI (not BaseHTTPMiddleware): a ContextVar
set here propagates into the sync route handlers, which Starlette runs in a
threadpool that copies the current context. A BaseHTTPMiddleware would run the
endpoint in a separate task and the value would not be visible.
"""
from contextvars import ContextVar

import jwt
from jwt import PyJWTError as JWTError

from app.config import settings

_suppress: ContextVar[bool] = ContextVar("suppress_notifications", default=False)


def set_suppressed(value: bool):
    """Set the request-scoped flag; returns a token for ``reset_suppressed``."""
    return _suppress.set(value)


def reset_suppressed(token) -> None:
    _suppress.reset(token)


def notifications_suppressed() -> bool:
    """True when the current request is running in Ghost Mode."""
    return _suppress.get()


def _wants_ghost(scope) -> bool:
    """Honour ``X-Ghost-Mode: 1`` only for an authenticated admin. The bearer
    token is decoded purely to read its role — this is advisory and never
    replaces the route's own auth, so any failure simply means "no ghost"."""
    headers = {k.lower(): v for k, v in scope.get("headers", [])}
    if headers.get(b"x-ghost-mode") != b"1":
        return False
    auth = headers.get(b"authorization", b"")
    if not auth.startswith(b"Bearer "):
        return False
    token = auth[len(b"Bearer "):].decode("latin-1")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return False
    return payload.get("role") == "admin"


class GhostModeMiddleware:
    """Sets the Ghost Mode ContextVar for admin requests carrying the header."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        token = None
        if scope.get("type") == "http" and _wants_ghost(scope):
            token = set_suppressed(True)
        try:
            await self.app(scope, receive, send)
        finally:
            if token is not None:
                reset_suppressed(token)
