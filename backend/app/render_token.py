"""Short-lived tokens that let the server screenshot a page as a real user.

The bot's page-screenshot commands (see ``PAGE_SHOTS`` in ``telegram_bot.py``)
drive a headless Chromium over the real SPA, so the render needs a session —
but a headless browser has no Telegram WebView and therefore no ``initData``,
which ``app/security.py`` demands on every ``/api`` call.

A render token is the alternative credential for exactly that case. It is:

  * **HMAC-signed** with ``secret_key`` — same scheme as ``reg_token.py``.
  * **Short-lived** (3 minutes) — long enough for one Chromium boot + page
    load, far too short to be useful if it ever leaked.
  * **Bound to one Telegram id** — it buys the caller's OWN session and nothing
    more. ``/api/auth/webapp`` resolves the same role, the same active profile
    and the same page grants it would resolve for a normal login, so the token
    can never widen access.
  * **Server-internal** — minted in the bot handler and handed to a Chromium on
    the same host. It never travels to a client.

That last point is why there is no single-use bookkeeping: Passenger runs
several worker processes, so an in-memory "already consumed" set would not be
shared between the process that mints the token and the one that validates it.
The TTL is the bound that actually holds across processes.
"""
import hashlib
import hmac
import secrets
import time

from app.config import settings

# One render = Chromium cold start (~2 s) + page load + data fetch. 3 minutes
# leaves room for a slow first shot without keeping the credential alive.
RENDER_TOKEN_TTL_SEC = 180

# Marks a render token where an initData string is expected — both the login
# endpoint and the global origin guard branch on it.
RENDER_PREFIX = "render:"


def _sign(payload: str) -> str:
    return hmac.new(settings.secret_key.encode(), payload.encode(),
                    hashlib.sha256).hexdigest()


def make_render_token(telegram_id: int) -> str:
    exp = int(time.time()) + RENDER_TOKEN_TTL_SEC
    # The nonce keeps two tokens minted in the same second distinct, so one
    # showing up in a log can't be confused for another.
    payload = f"{telegram_id}.{exp}.{secrets.token_hex(8)}"
    return f"{payload}.{_sign(payload)}"


def validate_render_token(token: str) -> int | None:
    """Telegram id the token was minted for, or None if it is malformed,
    expired or not signed by us."""
    try:
        tid, exp, nonce, sig = token.split(".")
        if int(exp) < time.time():
            return None
        if not hmac.compare_digest(_sign(f"{tid}.{exp}.{nonce}"), sig):
            return None
        return int(tid)
    except (ValueError, AttributeError):
        return None


def read_init_data_render_token(init_data: str) -> int | None:
    """Telegram id when ``init_data`` is a valid ``render:<token>`` string.
    None for anything else — including a well-formed but expired token, so
    callers fall through to the normal initData checks."""
    if not init_data or not init_data.startswith(RENDER_PREFIX):
        return None
    return validate_render_token(init_data[len(RENDER_PREFIX):])
