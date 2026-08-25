import hashlib
import logging
import os

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings

log = logging.getLogger(__name__)

# Resolve .env relative to this file (backend/app/config.py → backend/.env)
_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")

# The built-in placeholder signing key. It is a PUBLIC constant — it lives in
# this source file — so any JWT signed with it is forgeable by anyone, which
# would mean unauthenticated admin access (verify_admin trusts the token's role
# claim) and a bypass of the browser-session origin wall. It exists only so a
# local checkout runs without configuration. `_resolve_secret_key` replaces it
# with a strong per-deployment key when possible, and `assert_secure_config`
# refuses to serve production if it ever remains in force.
_DEFAULT_SECRET = "change-this-secret-key"


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/zagruzka_db"
    google_credentials_file: str = "../safia-project-bea00b0b2514.json"
    secret_key: str = "change-this-secret-key"
    algorithm: str = "HS256"
    access_token_expire_hours: int = 24
    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    # Max age of a Telegram initData string (its auth_date). initData is signed
    # once at launch and never refreshes, so a leaked/captured string would
    # otherwise stay replayable forever. Every request re-checks this window, so
    # a session that stays open past it must relaunch to get fresh initData —
    # this mirrors the JWT lifetime above. 0 disables the freshness check.
    init_data_max_age_hours: int = 24
    # Shared secret Telegram echoes back in the X-Telegram-Bot-Api-Secret-Token
    # header on every webhook delivery, so /bot/webhook can reject forged
    # updates. Blank → derived deterministically from secret_key (see
    # webhook_secret), so protection is on out of the box.
    telegram_webhook_secret: str = ""
    # Comma-separated Telegram IDs. Only used to seed the admins DB table
    # (see startup.seed_admins) — after seeding, the DB is the source of truth.
    admin_telegram_id: str = ""
    webapp_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    # Notion internal-integration token for the Kaizen project analytics page.
    # Loaded from backend/.env; blank disables the integration.
    notion_token: str = ""
    # Google AI Studio key for the leader-checklist proof-photo review.
    # Loaded from backend/.env (gitignored); blank disables the whole feature —
    # nothing is queued, nothing is shown. See services/gemini.py.
    gemini_api_key: str = ""
    # Free-tier vision model. A "-latest" alias on purpose: gemini-2.5-flash was
    # already retired for new keys ("no longer available to new users") while
    # still being listed, and a pinned version 404s the day that happens again.
    # NOT the lite alias any more. Lite was right while the backfill was the
    # whole job — requests per DAY was the binding constraint and the reviewer
    # only had to read a clock off an image. It now also judges whether the
    # photo is even about the task it was filed under, which is a semantic
    # comparison against the task's own description; lite (today
    # gemini-3.5-flash-lite) answers that noticeably worse than flash (today
    # gemini-3.6-flash) for a handful of thinking tokens a photo.
    gemini_model: str = "gemini-flash-latest"
    # Reviews attempted per drain. The free tier caps requests per minute AND
    # per day, so a full backfill drains in slices rather than failing at once.
    gemini_batch_size: int = 40
    # Telegram chat that receives boot-failure reports (the "Report the problem"
    # button on the recovery screen). Blank → falls back to the admins table.
    support_chat_id: str = ""
    # Allows the "__dev__" auth bypass (admin login without Telegram initData).
    # Must stay off in production; set DEV_AUTH=1 in backend/.env for local dev.
    dev_auth: bool = False
    # IT's read-only internal API (page /arc). ONE key, no user login, GET only:
    # the username+password ARC login it replaced is gone, and so are the
    # USERNAME / PASSWORD / PASSAWORD names IT had written into prod's .env by
    # SSH. Blank disables the integration — startup.ensure_internal_api_key
    # seeds the key into backend/.env on boot, so a fresh box connects itself.
    internal_api_url: str = "https://api.service.safiabakery.uz"
    internal_api_key: str = Field("", validation_alias=AliasChoices("INTERNAL_API_KEY"))

    @field_validator("admin_telegram_id", mode="before")
    @classmethod
    def parse_admin_id(cls, v):
        if v is None:
            return ""
        return str(v)

    @property
    def admin_telegram_ids(self) -> list[int]:
        return [int(x) for x in self.admin_telegram_id.replace(" ", "").split(",") if x]

    @property
    def webhook_secret(self) -> str:
        """The secret token registered with Telegram's setWebhook and verified on
        every incoming update. Uses an explicit telegram_webhook_secret when set,
        otherwise derives a stable one from secret_key so the check works without
        extra configuration. Telegram allows 1-256 chars of [A-Za-z0-9_-]; a hex
        digest satisfies that."""
        explicit = (self.telegram_webhook_secret or "").strip()
        if explicit:
            return explicit
        return hashlib.sha256(f"tg-webhook:{self.secret_key}".encode()).hexdigest()

    @model_validator(mode="after")
    def _resolve_secret_key(self):
        """Never let the signing key stay at the public placeholder.

        When SECRET_KEY is unset (or still the placeholder), derive a strong,
        deployment-stable key from the bot token — itself a high-entropy secret
        only this deployment holds, and one that survives restarts, so existing
        sessions are not invalidated on every boot. If there is no usable bot
        token either, the placeholder is left in place and assert_secure_config()
        decides whether that is fatal (production) or a warning (local dev)."""
        if not self.secret_key or self.secret_key == _DEFAULT_SECRET:
            token = (self.telegram_bot_token or "").strip()
            if len(token) >= 20:
                object.__setattr__(
                    self, "secret_key",
                    hashlib.sha256(f"safia-jwt-secret::{token}".encode()).hexdigest(),
                )
        return self

    @property
    def is_production(self) -> bool:
        """True on the live deployment, False for local dev.

        Keyed on the public app URL: production serves the SPA from an https
        host, local dev from http://localhost. Deliberately NOT keyed on the
        database host (the prod DB may be reached over localhost) nor on
        dev_auth (which we want to be able to forbid independently)."""
        url = (self.webapp_url or "").lower()
        return url.startswith("https://") and "localhost" not in url and "127.0.0.1" not in url

    class Config:
        env_file = _ENV_FILE
        # A key in .env with no matching field used to abort boot (extra_forbidden)
        # — and the rollback commit died the same way. A stray key must read as
        # «not configured», never as an outage, on a platform with no SSH.
        extra = "ignore"


settings = Settings()


def assert_secure_config() -> None:
    """Fail-closed startup check, called once from each web-app entrypoint
    (app/main.py lifespan and passenger_wsgi.py).

    In production it REFUSES to serve on an insecure configuration rather than
    silently running with a forgeable signing key or an open dev bypass. A failed
    boot makes the deploy's health check fail, which rolls the release back and
    leaves the previous version running — far safer than serving an app whose
    admin tokens anyone can mint. In local dev it only warns, so a fresh checkout
    still runs."""
    problems: list[str] = []
    if settings.secret_key == _DEFAULT_SECRET:
        msg = ("SECRET_KEY is unset and no bot token was available to derive one, "
               "so the JWT signing key is a public constant that lets anyone forge "
               "an admin token.")
        if settings.is_production:
            problems.append(msg)
        else:
            log.warning("INSECURE CONFIG (dev only): %s Set SECRET_KEY in backend/.env.", msg)
    if settings.is_production and settings.dev_auth:
        problems.append("DEV_AUTH is enabled in production — the __dev__ header "
                        "bypasses authentication entirely.")
    if problems:
        raise RuntimeError(
            "Refusing to start: insecure production configuration.\n  - "
            + "\n  - ".join(problems)
            + "\nSet a strong SECRET_KEY (and DEV_AUTH=0) in backend/.env, then redeploy."
        )
