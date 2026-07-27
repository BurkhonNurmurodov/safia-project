import os
from pydantic import field_validator
from pydantic_settings import BaseSettings

# Resolve .env relative to this file (backend/app/config.py → backend/.env)
_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")


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
    # Telegram chat that receives boot-failure reports (the "Report the problem"
    # button on the recovery screen). Blank → falls back to the admins table.
    support_chat_id: str = ""
    # Origin the headless Chromium loads when the bot screenshots a page
    # (/ojidaniya & friends — see app/services/page_shot.py). Blank → webapp_url.
    # Set it only if the app can be reached on the box by a URL that skips the
    # hosting's anti-bot layer; otherwise the public URL is correct, and
    # Chromium solves the JS challenge the way any real browser does.
    render_base_url: str = ""
    # Seconds to wait for one screenshot subprocess before giving up. Chromium
    # cold start is ~2 s, the page's own data fetches add a few more.
    render_timeout_sec: int = 75
    # Allows the "__dev__" auth bypass (admin login without Telegram initData).
    # Must stay off in production; set DEV_AUTH=1 in backend/.env for local dev.
    dev_auth: bool = False

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
        import hashlib
        return hashlib.sha256(f"tg-webhook:{self.secret_key}".encode()).hexdigest()

    class Config:
        env_file = _ENV_FILE


settings = Settings()
