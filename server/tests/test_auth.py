import bcrypt
from server.app.auth import hash_password, verify_password, create_session_token


def test_hash_and_verify_password():
    password = "mypassword123"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrongpassword", hashed)


def test_create_session_token():
    token = create_session_token()
    assert len(token) > 20
    token2 = create_session_token()
    assert token != token2
