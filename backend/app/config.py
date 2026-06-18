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
    # Comma-separated Telegram IDs. Only used to seed the admins DB table
    # (see startup.seed_admins) — after seeding, the DB is the source of truth.
    admin_telegram_id: str = ""
    webapp_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
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

    class Config:
        env_file = _ENV_FILE


settings = Settings()
