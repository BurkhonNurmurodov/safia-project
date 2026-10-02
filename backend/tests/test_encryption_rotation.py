import unittest
from unittest.mock import patch

import jwt

from app.config import Settings
from app import web_auth


class EncryptionRotationTests(unittest.TestCase):
    def settings(self, jwt_key, data_key="", legacy=""):
        return Settings(_env_file=None, environment="production", secret_key=jwt_key,
                        webapp_url="https://production.example", data_encryption_key=data_key,
                        legacy_data_encryption_key=legacy)

    def test_independent_data_key_survives_jwt_rotation(self):
        with patch.object(web_auth, "settings", self.settings("a" * 48, "d" * 48)):
            sealed = web_auth.seal_password("example-only-password")
        with patch.object(web_auth, "settings", self.settings("b" * 48, "d" * 48)):
            self.assertEqual(web_auth.open_password(sealed), "example-only-password")

    def test_legacy_ciphertext_can_be_resealed_and_old_key_removed(self):
        with patch.object(web_auth, "settings", self.settings("a" * 48)):
            old = web_auth.seal_password("example-only-password")
        with patch.object(web_auth, "settings", self.settings("b" * 48, "d" * 48, "a" * 48)):
            plain = web_auth.open_password(old)
            self.assertEqual(plain, "example-only-password")
            new = web_auth.seal_password(plain)
        with patch.object(web_auth, "settings", self.settings("b" * 48, "d" * 48)):
            self.assertEqual(web_auth.open_password(new), "example-only-password")
            self.assertIsNone(web_auth.open_password(old))

    def test_rotation_invalidates_old_jwt(self):
        old = jwt.encode({"sub":"123", "exp":9999999999}, "a" * 48, algorithm="HS256")
        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(old, "b" * 48, algorithms=["HS256"])

    def test_tampered_ciphertext_is_rejected(self):
        with patch.object(web_auth, "settings", self.settings("a" * 48, "d" * 48)):
            sealed = web_auth.seal_password("example-only-password")
            self.assertIsNone(web_auth.open_password(sealed[:-3] + "AA="))


class RotationPreparationTests(unittest.TestCase):
    def test_every_row_is_checked_before_any_ciphertext_changes(self):
        from app.data_encryption import reseal_values
        values = {("web_credentials", 1): "valid", ("app_settings", 2): "corrupt"}
        with patch("app.data_encryption.open_password", side_effect=["example", None]), patch("app.data_encryption.seal_password") as seal:
            with self.assertRaises(ValueError):
                reseal_values(values)
            seal.assert_not_called()

    def test_synthetic_rows_use_new_key_after_legacy_rotation(self):
        from app.data_encryption import reseal_values
        settings = EncryptionRotationTests()
        with patch.object(web_auth, "settings", settings.settings("a" * 48)):
            values = {("web_credentials", 1): web_auth.seal_password("example-password"), ("app_settings", 2): web_auth.seal_password("example-api-key")}
        with patch.object(web_auth, "settings", settings.settings("b" * 48, "d" * 48, "a" * 48)):
            rotated = reseal_values(values)
        with patch.object(web_auth, "settings", settings.settings("b" * 48, "d" * 48)):
            self.assertEqual(web_auth.open_password(rotated[("web_credentials", 1)]), "example-password")
            self.assertEqual(web_auth.open_password(rotated[("app_settings", 2)]), "example-api-key")


class RotationTransactionTests(unittest.TestCase):
    def test_real_synthetic_tables_preserve_keys_and_unrelated_rows(self):
        import importlib.util
        from pathlib import Path
        from sqlalchemy import create_engine, insert, select
        from app.models import AppSetting, WebCredential
        spec = importlib.util.spec_from_file_location("rotation", Path(__file__).resolve().parents[2] / "deploy/rotate-encryption-key.py")
        rotation = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rotation)
        engine = create_engine("sqlite:///:memory:")
        WebCredential.__table__.create(engine)
        AppSetting.__table__.create(engine)
        helper = EncryptionRotationTests()
        with patch.object(web_auth, "settings", helper.settings("a" * 48)):
            credential = web_auth.seal_password("example-password")
            integration = web_auth.seal_password("example-api-key")
        with engine.begin() as connection:
            connection.execute(insert(WebCredential).values(id=1, profile_key="example:1", username="example", password_hash="unchanged-fixture-hash", password_enc=credential))
            connection.execute(insert(AppSetting), [{"key":"example_api_key", "value":integration}, {"key":"unrelated", "value":"unchanged"}])
        rotated = helper.settings("b" * 48, "d" * 48, "a" * 48)
        with patch.object(web_auth, "settings", rotated), patch.object(rotation, "settings", rotated), engine.begin() as connection:
            self.assertEqual(rotation.rotate_connection(connection), (1, 1))
        with patch.object(web_auth, "settings", helper.settings("b" * 48, "d" * 48)), engine.connect() as connection:
            row = connection.execute(select(WebCredential.password_enc, WebCredential.password_hash)).one()
            self.assertEqual(web_auth.open_password(row.password_enc), "example-password")
            self.assertEqual(row.password_hash, "unchanged-fixture-hash")
            settings = dict(connection.execute(select(AppSetting.key, AppSetting.value)).all())
            self.assertEqual(web_auth.open_password(settings["example_api_key"]), "example-api-key")
            self.assertEqual(settings["unrelated"], "unchanged")
        with engine.begin() as connection:
            connection.execute(insert(AppSetting).values(key="corrupt", value="v1$corrupt"))
        with patch.object(web_auth, "settings", rotated), patch.object(rotation, "settings", rotated), self.assertRaises(ValueError), engine.begin() as connection:
            rotation.rotate_connection(connection)
        with engine.connect() as connection:
            self.assertEqual(connection.execute(select(AppSetting.value).where(AppSetting.key=="corrupt")).scalar_one(), "v1$corrupt")
