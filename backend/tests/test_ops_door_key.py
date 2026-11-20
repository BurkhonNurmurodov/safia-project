import hashlib
import unittest
from unittest import mock

from app.services import ops_door


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


class OpsDoorKeyTests(unittest.TestCase):
    """The door opens to each computer's own key and to nothing else."""

    def test_either_key_opens_and_nothing_else_does(self):
        win, mac = "w" * 64, "m" * 64
        with mock.patch.object(ops_door, "KEY_SHA256", _sha(win)), \
             mock.patch.object(ops_door, "KEY_SHA256_MAC", _sha(mac)):
            self.assertTrue(ops_door.key_ok(win))
            self.assertTrue(ops_door.key_ok(f"  {mac}\n"))
            for bad in ("", "x" * 64, _sha(win), _sha(mac)):
                self.assertFalse(ops_door.key_ok(bad))

    def test_a_blanked_digest_cuts_that_computer_off(self):
        mac = "m" * 64
        with mock.patch.object(ops_door, "KEY_SHA256_MAC", ""):
            self.assertFalse(ops_door.key_ok(mac))
            self.assertFalse(ops_door.key_ok(""))

    def test_the_shipped_digests_are_two_sha256_and_never_keys(self):
        both = (ops_door.KEY_SHA256, ops_door.KEY_SHA256_MAC)
        self.assertEqual(len(set(both)), 2)
        for k in both:
            self.assertRegex(k, r"^[0-9a-f]{64}$")
            # the fingerprint pasted in place of the key must not open the door
            self.assertFalse(ops_door.key_ok(k))


if __name__ == "__main__":
    unittest.main()
