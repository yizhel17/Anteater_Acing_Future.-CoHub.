from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.core import security


def test_hash_and_verify_password_roundtrip():
    hashed = security.hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert security.verify_password("correct horse battery staple", hashed)
    assert not security.verify_password("wrong password", hashed)


def test_create_and_decode_access_token():
    token = security.create_access_token({"sub": "user-123"})
    payload = security.decode_token(token)
    assert payload["sub"] == "user-123"


def test_decode_expired_token_raises_401():
    token = security.create_access_token(
        {"sub": "user-123"}, expires_delta=timedelta(seconds=-1)
    )
    with pytest.raises(HTTPException) as exc_info:
        security.decode_token(token)
    assert exc_info.value.status_code == 401


def test_decode_tampered_token_raises_401():
    token = security.create_access_token({"sub": "user-123"})
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(HTTPException) as exc_info:
        security.decode_token(tampered)
    assert exc_info.value.status_code == 401


def test_decode_empty_token_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        security.decode_token("")
    assert exc_info.value.status_code == 401
