"""Bot-signed tokens for the registration mini-app.

Keyboard-button WebApp launches (required for sendData()) never receive
Telegram initData — platform rule — so the initData gate on
/api/profiles/registration-options can never pass from the register button.
Instead the bot appends ?rt=<token> to the /login URL and the endpoint
accepts a valid token as the alternative credential.
"""
import hashlib
import hmac
import time

from app.config import settings

# Reply-keyboard buttons linger in chat history; keep old register buttons
# working for a week before forcing a fresh /register.
REG_TOKEN_TTL_SEC = 7 * 24 * 3600


def _sign(payload: str) -> str:
    return hmac.new(settings.secret_key.encode(), payload.encode(),
                    hashlib.sha256).hexdigest()


def make_reg_token(telegram_id: int) -> str:
    exp = int(time.time()) + REG_TOKEN_TTL_SEC
    payload = f"{telegram_id}.{exp}"
    return f"{payload}.{_sign(payload)}"


def validate_reg_token(token: str) -> bool:
    try:
        tid, exp, sig = token.split(".")
        if int(exp) < time.time():
            return False
        return hmac.compare_digest(_sign(f"{tid}.{exp}"), sig)
    except (ValueError, AttributeError):
        return False
