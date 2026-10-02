#!/usr/bin/env python3
"""Reseal only encrypted credentials after the separate keys are configured.

Run from backend with its virtualenv and PYTHONPATH=. after a private pg_dump.
No plaintext is logged. All values must decrypt before one transaction commits.
"""
from unittest.mock import patch

from sqlalchemy import select, update

from app.config import settings
from app.data_encryption import reseal_values
from app.database import engine
from app.models import AppSetting, WebCredential
from app import web_auth



def rotate_connection(connection):
    credentials = connection.execute(select(WebCredential.id, WebCredential.password_enc).where(WebCredential.password_enc.is_not(None)).with_for_update()).all()
    integrations = connection.execute(select(AppSetting.key, AppSetting.value).where(AppSetting.value.like("v1$%")).with_for_update()).all()
    values = {("web_credentials", row.id): row.password_enc for row in credentials}
    values.update({("app_settings", row.key): row.value for row in integrations})
    rotated = reseal_values(values)
    primary_only = settings.model_copy(update={"legacy_data_encryption_key": ""})
    with patch.object(web_auth, "settings", primary_only):
        if any(web_auth.open_password(value) is None for value in rotated.values()):
            raise RuntimeError("Replacement ciphertext validation failed.")
    for (table, identity), value in rotated.items():
        if table == "web_credentials":
            statement = update(WebCredential).where(WebCredential.id == identity).values(password_enc=value)
        else:
            statement = update(AppSetting).where(AppSetting.key == identity).values(value=value)
        connection.execute(statement)
    return len(credentials), len(integrations)


def main():
    if not settings.data_encryption_key or not settings.legacy_data_encryption_key:
        raise RuntimeError("Separate primary and legacy encryption keys are required.")
    with engine.begin() as connection:
        credentials, integrations = rotate_connection(connection)
    print(f"Encryption rotation committed; credential rows={credentials}; integration rows={integrations}; all replacements decrypt with the new key.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Encryption rotation failed; transaction rolled back. No secret values logged.")
        raise SystemExit(1)
