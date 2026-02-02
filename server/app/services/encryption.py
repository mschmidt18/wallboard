from pathlib import Path
from cryptography.fernet import Fernet


def generate_key() -> bytes:
    return Fernet.generate_key()


def load_or_create_key(path: Path) -> bytes:
    if path.exists():
        return path.read_bytes().strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    key = generate_key()
    path.write_bytes(key)
    return key


def encrypt(plaintext: str, key: bytes) -> str:
    f = Fernet(key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str, key: bytes) -> str:
    f = Fernet(key)
    return f.decrypt(ciphertext.encode()).decode()
