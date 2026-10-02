"""Prepare ciphertext rotation without partial changes or secret output."""
from collections.abc import Mapping
from app.web_auth import open_password, seal_password


def reseal_values(values: Mapping[tuple[str, int], str]) -> dict[tuple[str, int], str]:
    """Decrypt every input before preparing any replacement ciphertext."""
    plaintext = {}
    for identity, sealed in values.items():
        plain = open_password(sealed)
        if plain is None:
            raise ValueError("Ciphertext rotation requires every stored value to decrypt.")
        plaintext[identity] = plain
    return {identity: seal_password(plain) for identity, plain in plaintext.items()}
