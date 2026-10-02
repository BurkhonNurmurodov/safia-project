import unittest
from app.config import Settings


class SecurityConfigTests(unittest.TestCase):
    def settings(self, **values):
        defaults = {'secret_key': 'a' * 48, 'environment': 'production',
                    'webapp_url': 'https://production.safiacorporate.uz/app',
                    'cors_origins': '', 'dev_auth': False, 'init_data_max_age_hours': 24}
        defaults.update(values)
        return Settings(_env_file=None, **defaults)

    def test_default_key_cannot_sign_production_tokens(self):
        for secret in ['change-this-secret-key', 'change-this-secret-key-in-production', 'short']:
            with self.subTest(secret=secret), self.assertRaises(ValueError):
                self.settings(secret_key=secret)

    def test_bypass_and_nonexpiring_telegram_data_are_rejected(self):
        for values in [{'dev_auth': True}, {'init_data_max_age_hours': 0}]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.settings(**values)

    def test_cross_origin_credentials_are_never_opened_to_every_site(self):
        for origin in ['*', 'http://evil.example', 'https://example.com/private', 'https://example.com?test=1']:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                self.settings(cors_origins=origin)

    def test_webapp_path_is_reduced_to_origin(self):
        self.assertEqual(self.settings().cors_origin_list, ['https://production.safiacorporate.uz'])

    def test_explicit_local_development(self):
        self.settings(environment='development', webapp_url='http://localhost:5173', secret_key='dev', dev_auth=True)


if __name__ == '__main__':
    unittest.main()
