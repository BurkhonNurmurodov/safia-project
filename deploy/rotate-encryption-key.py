#!/usr/bin/env python3
"""Reseal only encrypted credentials after the separate keys are configured.

Run from backend with its virtualenv and PYTHONPATH=. after a private pg_dump.
No plaintext is logged. All values must decrypt before one transaction commits.
"""
from unittest.mock import patch

from sqlalchemy import text

from app.config import settings
from app.data_encryption import reseal_values
from app.database import engine
from app import web_auth


def main():
    if not settings.data_encryption_key or not settings.legacy_data_encryption_key:
        raise RuntimeError("Separate primary and legacy encryption keys are required.")
    with engine.begin() as connection:
        credentials = connection.execute(text("SELECT id, password_enc FROM web_credentials WHERE password_enc IS NOT NULL FOR UPDATE")).all()
        integrations = connection.execute(text("SELECT id, value FROM app_settings WHERE value LIKE 'v1$%' FOR UPDATE")).all()
        values = {("web_credentials", row.id): row.password_enc for row in credentials}
        values.update({("app_settings", row.id): row.value for row in integrations})
        rotated = reseal_values(values)
        primary_only = settings.model_copy(update={"legacy_data_encryption_key": ""})
        with patch.object(web_auth, "settings", primary_only):
            if any(web_auth.open_password(value) is None for value in rotated.values()):
                raise RuntimeError("Replacement ciphertext validation failed.")
        for (table, identity), value in rotated.items():
            column = "password_enc" if table == "web_credentials" else "value"
            connection.execute(text(f"UPDATE {table} SET {column} = :value WHERE id = :id"), {"value": value, "id": identity})
    print(f"Encryption rotation committed; credential rows={len(credentials)}; integration rows={len(integrations)}; all replacements decrypt with the new key.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Encryption rotation failed; transaction rolled back. No secret values logged.")
        raise SystemExit(1)
