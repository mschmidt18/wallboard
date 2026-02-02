import json
from pathlib import Path
from server.app.services.encryption import generate_key, encrypt, decrypt, load_or_create_key


def test_encrypt_decrypt_roundtrip(tmp_path):
    key = generate_key()
    plaintext = json.dumps({"access_token": "abc123", "refresh_token": "def456"})
    encrypted = encrypt(plaintext, key)
    assert encrypted != plaintext
    decrypted = decrypt(encrypted, key)
    assert decrypted == plaintext


def test_different_keys_cannot_decrypt(tmp_path):
    key1 = generate_key()
    key2 = generate_key()
    encrypted = encrypt("secret", key1)
    try:
        result = decrypt(encrypted, key2)
        assert result != "secret"
    except Exception:
        pass  # Expected: decryption fails with wrong key


def test_load_or_create_key_creates_file(tmp_path):
    key_path = tmp_path / "secret.key"
    key = load_or_create_key(key_path)
    assert key_path.exists()
    assert len(key) > 0


def test_load_or_create_key_returns_same_key(tmp_path):
    key_path = tmp_path / "secret.key"
    key1 = load_or_create_key(key_path)
    key2 = load_or_create_key(key_path)
    assert key1 == key2
